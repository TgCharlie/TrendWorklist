import { Router } from "express";
import { requireAdmin } from "../lib/auth-middleware";
import { getSetting } from "../lib/settings";

async function sslFetch(allowSelfSigned: boolean, url: string, init?: RequestInit): Promise<Response> {
  if (!allowSelfSigned) return fetch(url, init);
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    return await fetch(url, init);
  } finally {
    if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
  }
}

const router = Router();

/**
 * GET /api/filemaker/test
 * Admin-only diagnostic endpoint — tests the FileMaker Data API connection step by step
 * and returns detailed information about what succeeded / failed.
 */
router.get("/test", requireAdmin, async (req, res): Promise<void> => {
  const steps: Array<{ step: string; ok: boolean; detail: string }> = [];

  // 1. Read settings
  const [serverUrl, database, username, password, allowSelfSignedStr] = await Promise.all([
    getSetting("filemaker_server_url"),
    getSetting("filemaker_database"),
    getSetting("filemaker_username"),
    getSetting("filemaker_password"),
    getSetting("filemaker_allow_self_signed"),
  ]);

  const allowSelfSigned = allowSelfSignedStr === "true";

  steps.push({
    step: "Read settings",
    ok: !!(serverUrl && database && username && password),
    detail: serverUrl && database && username && password
      ? `server=${serverUrl}, database=${database}, user=${username}, ssl_bypass=${allowSelfSigned}`
      : `Missing: ${[!serverUrl && "server_url", !database && "database", !username && "username", !password && "password"].filter(Boolean).join(", ")}`,
  });

  if (!serverUrl || !database || !username || !password) {
    res.json({ ok: false, steps });
    return;
  }

  // 2. Network reachability
  try {
    const reachRes = await sslFetch(allowSelfSigned, `${serverUrl}/fmi/data/vLatest`, {
      method: "GET",
    });
    steps.push({
      step: "Reach FileMaker Data API base URL",
      ok: true,
      detail: `HTTP ${reachRes.status} from ${serverUrl}/fmi/data/vLatest`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "Reach FileMaker Data API base URL", ok: false, detail: msg });
    res.json({ ok: false, steps });
    return;
  }

  // 3. Authenticate (get token)
  let token: string | null = null;
  try {
    const authUrl = `${serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(database)}/sessions`;
    const credentials = Buffer.from(`${username}:${password}`).toString("base64");

    const authRes = await sslFetch(allowSelfSigned, authUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const authText = await authRes.text();

    if (!authRes.ok) {
      steps.push({
        step: "Authenticate with FileMaker",
        ok: false,
        detail: `HTTP ${authRes.status}: ${authText.slice(0, 500)}`,
      });
      res.json({ ok: false, steps });
      return;
    }

    token = authRes.headers.get("X-FM-Data-Access-Token");
    const parsed = JSON.parse(authText) as { messages?: Array<{ code: string; message: string }> };

    steps.push({
      step: "Authenticate with FileMaker",
      ok: !!token,
      detail: token
        ? `Token received. FM messages: ${JSON.stringify(parsed.messages)}`
        : `No token in response header. Body: ${authText.slice(0, 300)}`,
    });

    if (!token) {
      res.json({ ok: false, steps });
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "Authenticate with FileMaker", ok: false, detail: msg });
    res.json({ ok: false, steps });
    return;
  }

  // 4. Hit StockBook layout (fetch 1 record)
  try {
    const layoutUrl = `${serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(database)}/layouts/StockBook/records?_limit=1`;
    const layoutRes = await sslFetch(allowSelfSigned, layoutUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const layoutText = await layoutRes.text();
    const parsed = JSON.parse(layoutText) as {
      messages?: Array<{ code: string; message: string }>;
      response?: { dataInfo?: { foundCount?: number; totalRecordCount?: number } };
    };

    const fmCode = parsed.messages?.[0]?.code;
    const fmMsg = parsed.messages?.[0]?.message;

    if (fmCode === "0") {
      steps.push({
        step: "Access StockBook layout",
        ok: true,
        detail: `Layout accessible. totalRecords=${parsed.response?.dataInfo?.totalRecordCount ?? "?"}`,
      });
    } else {
      steps.push({
        step: "Access StockBook layout",
        ok: false,
        detail: `FileMaker error ${fmCode}: ${fmMsg} — ${layoutText.slice(0, 300)}`,
      });
    }

    // Release token
    sslFetch(allowSelfSigned, `${serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(database)}/sessions/${token}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "Access StockBook layout", ok: false, detail: msg });
  }

  const allOk = steps.every((s) => s.ok);
  res.json({ ok: allOk, steps });
});

export default router;
