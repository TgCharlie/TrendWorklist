import { getSetting } from "./settings";

interface FileMakerConfig {
  serverUrl: string;
  database: string;
  username: string;
  password: string;
  allowSelfSigned: boolean;
}

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

interface FileMakerRecord {
  fieldData: Record<string, unknown>;
  recordId: string;
  modId: string;
}

interface FileMakerResponse {
  response: {
    data?: FileMakerRecord[];
    dataInfo?: {
      totalRecordCount: number;
      foundCount: number;
      returnedCount: number;
    };
  };
  messages: Array<{ code: string; message: string }>;
}

async function getConfig(): Promise<FileMakerConfig> {
  const [serverUrl, database, username, password, allowSelfSignedStr] = await Promise.all([
    getSetting("filemaker_server_url"),
    getSetting("filemaker_database"),
    getSetting("filemaker_username"),
    getSetting("filemaker_password"),
    getSetting("filemaker_allow_self_signed"),
  ]);
  return {
    serverUrl,
    database,
    username,
    password,
    allowSelfSigned: allowSelfSignedStr === "true",
  };
}

async function acquireToken(config: FileMakerConfig): Promise<string> {
  const url = `${config.serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(config.database)}/sessions`;
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  const res = await sslFetch(config.allowSelfSigned, url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FileMaker auth failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as FileMakerResponse;
  const token = res.headers.get("X-FM-Data-Access-Token");
  if (!token) throw new Error("FileMaker returned no access token");
  return token;
}

async function releaseToken(config: FileMakerConfig, token: string): Promise<void> {
  try {
    const url = `${config.serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(config.database)}/sessions/${token}`;
    await sslFetch(config.allowSelfSigned, url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
  }
}

async function withToken<T>(fn: (config: FileMakerConfig, token: string) => Promise<T>): Promise<T> {
  const config = await getConfig();
  if (!config.serverUrl || !config.database) {
    throw new Error("FileMaker not configured. Please set server URL and database in settings.");
  }
  const token = await acquireToken(config);
  try {
    return await fn(config, token);
  } finally {
    await releaseToken(config, token);
  }
}

interface FindPageResult {
  records: FileMakerRecord[];
  total: number;
}

async function findRecordsPage(
  config: FileMakerConfig,
  token: string,
  layout: string,
  query?: Array<Record<string, string>>,
  limit = 100,
  offset = 1,
): Promise<FindPageResult> {
  const base = `${config.serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(config.database)}/layouts/${encodeURIComponent(layout)}`;

  let url: string;
  let options: RequestInit;

  if (query && query.length > 0) {
    url = `${base}/_find`;
    options = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, limit, offset }),
    };
  } else {
    url = `${base}/records?_limit=${limit}&_offset=${offset}`;
    options = {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    };
  }

  const res = await sslFetch(config.allowSelfSigned, url, options);
  const data = (await res.json()) as FileMakerResponse;

  if (data.messages[0]?.code === "401") {
    return { records: [], total: 0 };
  }

  if (!res.ok) {
    throw new Error(`FileMaker error: ${data.messages[0]?.message}`);
  }

  // For _find requests, foundCount is the matching record count.
  // For GET /records, foundCount is absent so fall back to totalRecordCount.
  const info = data.response.dataInfo;
  return {
    records: data.response.data ?? [],
    total: info?.foundCount ?? info?.totalRecordCount ?? 0,
  };
}

async function findRecords(
  config: FileMakerConfig,
  token: string,
  layout: string,
  query?: Array<Record<string, string>>,
  limit = 100,
  offset = 1,
): Promise<FileMakerRecord[]> {
  const { records } = await findRecordsPage(config, token, layout, query, limit, offset);
  return records;
}

// Projects layout: PROJ_MAIN — key fields: PID, ProjectName
export async function findProjects(search?: string): Promise<Array<Record<string, unknown>>> {
  return withToken(async (config, token) => {
    const layout = "PROJ_MAIN";
    // Search by PID OR ProjectName. FileMaker Data API treats multiple query objects as OR.
    const query = search
      ? [{ PID: `*${search}*` }, { ProjectName: `*${search}*` }]
      : undefined;
    const records = await findRecords(config, token, layout, query, 200);
    return records.map((r) => {
      const pid = String(r.fieldData["PID"] ?? "");
      return {
        id: pid,
        projectId: pid,
        projectNumber: pid,
        projectName: r.fieldData["ProjectName"] as string,
        recordId: r.recordId,
        address: r.fieldData["Address"] as string,
        clientName: r.fieldData["ClientName"] as string,
        status: r.fieldData["Status"] as string,
        ...r.fieldData,
      };
    });
  });
}

// Direct project lookup by PID field in PROJ_MAIN layout
export async function findProjectById(projectId: string): Promise<Record<string, unknown> | null> {
  return withToken(async (config, token) => {
    const layout = "PROJ_MAIN";
    const records = await findRecords(config, token, layout, [{ PID: projectId }], 1);
    if (!records.length) return null;
    const r = records[0];
    const pid = String(r.fieldData["PID"] ?? "");
    return {
      id: pid,
      projectId: pid,
      projectNumber: pid,
      projectName: r.fieldData["ProjectName"] as string,
      recordId: r.recordId,
      address: r.fieldData["Address"] as string,
      clientName: r.fieldData["ClientName"] as string,
      status: r.fieldData["Status"] as string,
      ...r.fieldData,
    };
  });
}

// Cutlists layout: LIST_Cutlist — key fields: CutlistNumber, PID, Description, Status
export async function findCutlistsByProject(projectId: string): Promise<Array<Record<string, unknown>>> {
  return withToken(async (config, token) => {
    const layout = "LIST_Cutlist";
    // Project link field in this layout is 'Pid' (confirmed via FM Data API debug)
    const records = await findRecords(config, token, layout, [{ Pid: projectId }], 200);
    return records.map((r) => {
      const num = String(r.fieldData["CutlistNumber"] ?? "");
      return {
        id: num,
        cutlistId: num,
        cutlistNumber: num,
        recordId: r.recordId,
        projectId: String(r.fieldData["Pid"] ?? ""),
        // 'Item' field must be added to the LIST_Cutlist layout in FileMaker to appear here
        item: (r.fieldData["Item"] ?? r.fieldData["item"] ?? "") as string,
        description: (r.fieldData["Description"] ?? "") as string,
        status: (r.fieldData["Status"] ?? "") as string,
        ...r.fieldData,
      };
    });
  });
}

export async function findCutlistById(cutlistId: string): Promise<Record<string, unknown> | null> {
  return withToken(async (config, token) => {
    const layout = "LIST_Cutlist";
    const records = await findRecords(config, token, layout, [{ CutlistNumber: cutlistId }], 1);
    if (!records.length) return null;
    const r = records[0];
    const num = String(r.fieldData["CutlistNumber"] ?? "");
    return {
      id: num,
      cutlistId: num,
      cutlistNumber: num,
      recordId: r.recordId,
      projectId: String(r.fieldData["PID"] ?? ""),
      item: r.fieldData["Item"] as string,
      description: r.fieldData["Description"] as string,
      status: r.fieldData["Status"] as string,
      ...r.fieldData,
    };
  });
}

// Strip characters PostgreSQL rejects: null bytes and lone UTF-16 surrogates.
// FileMaker sometimes returns strings with these from legacy data.
function sanitizeStr(s: unknown): string | null {
  if (s == null) return null;
  if (typeof s !== "string") return null;
  const cleaned = s
    .replace(/\0/g, "")              // null bytes
    .replace(/[\uD800-\uDFFF]/g, "") // lone surrogates (invalid UTF-8 when encoded)
    .trim();
  return cleaned || null;
}

// StockBook layout columns: PCODE, Item, QtyOnHand, Cost, CostSub, Unit
export async function getStockLevel(pcode: string): Promise<Record<string, unknown> | null> {
  return withToken(async (config, token) => {
    const layout = "StockBook";
    const records = await findRecords(config, token, layout, [{ PCODE: pcode }], 1);
    if (!records.length) return null;
    const r = records[0];
    return {
      pcode: r.fieldData["PCODE"] as string,
      description: r.fieldData["Description"] as string,
      qtyOnHand: r.fieldData["QtyOnHand"] as number,
      unit: r.fieldData["Unit"] as string,
      ...r.fieldData,
    };
  });
}

export interface FMStockbookRecord {
  pcode: string;
  description: string;
  qtyOnHand: number;
  unit: string | null;
  location: string | null;
  otype: string | null;
  project: string | null;
  pid: string | null;
  /** URL or base64 image data from the FileMaker Image field. */
  image: string | null;
  tracked: boolean;
  /** Replit_ModifiedDate parsed to epoch ms (0 if field absent/unparseable). */
  fmModifiedMs: number;
}

// Parse a FileMaker text timestamp into UTC milliseconds.
// Handles three formats:
//   12h: "MM/DD/YYYY HH:MM:SS am/pm"  (FileMaker default — NOT sortable as text)
//   24h: "MM/DD/YYYY HH:MM:SS"        (sortable within same year; breaks at Dec→Jan)
//   ISO: "YYYY/MM/DD HH:MM:SS"        (perfectly sortable — recommended if you can change FM)
export function fmTextTimestampToMs(s: string): number {
  // ISO 24h: YYYY/MM/DD HH:MM:SS
  const iso = s.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (iso) {
    const [, yyyy, mm, dd, hh, min, ss] = iso;
    return Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min, +ss);
  }
  // 24h: MM/DD/YYYY HH:MM:SS (no am/pm suffix)
  const h24 = s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (h24) {
    const [, mm, dd, yyyy, hh, min, ss] = h24;
    return Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min, +ss);
  }
  // 12h: MM/DD/YYYY HH:MM:SS am/pm
  const h12 = s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2}) (am|pm)$/i);
  if (h12) {
    const [, mm, dd, yyyy, hh, min, ss, ap] = h12;
    let hours = +hh;
    if (ap.toLowerCase() === "pm" && hours !== 12) hours += 12;
    if (ap.toLowerCase() === "am" && hours === 12) hours = 0;
    return Date.UTC(+yyyy, +mm - 1, +dd, hours, +min, +ss);
  }
  return 0;
}

// Returns true when the timestamp string is in a 24h format that FileMaker
// can compare correctly with the > text operator (no am/pm suffix).
//   MM/DD/YYYY HH:MM:SS  — sortable within same calendar year (Dec→Jan edge case)
//   YYYY/MM/DD HH:MM:SS  — perfectly sortable in all cases (recommended)
function fmTimestampIsSortable(s: string): boolean {
  return (
    /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(s) ||
    /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(s)
  );
}

// Debug helper: run a single-page _find against the StockBook layout with
// a given criterion object and return the raw dataInfo + first field-name list.
export async function debugStockbookFind(
  criterion: Record<string, string>,
  limit = 1,
): Promise<{
  query: Record<string, string>;
  foundCount: number | null;
  totalRecordCount: number | null;
  returnedCount: number | null;
  firstRecordFields: string[];
  fmMessage: string;
}> {
  return withToken(async (config, token) => {
    const layout = "StockBook";
    const base = `${config.serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(config.database)}/layouts/${encodeURIComponent(layout)}`;
    const body = { query: [criterion], limit, offset: 1 };
    const res = await sslFetch(config.allowSelfSigned, `${base}/_find`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as FileMakerResponse;
    const info = data.response.dataInfo;
    const firstRecord = data.response.data?.[0];
    return {
      query: criterion,
      foundCount: info?.foundCount ?? null,
      totalRecordCount: info?.totalRecordCount ?? null,
      returnedCount: info?.returnedCount ?? null,
      firstRecordFields: firstRecord ? Object.keys(firstRecord.fieldData) : [],
      fmMessage: data.messages[0]?.message ?? "",
    };
  });
}

// Fetch all tracked records from the FileMaker StockBook layout in batches.
//
// Always fetches every Tag_StockTracked=1 record — no timestamp criterion is
// applied. A FM-side Replit_ModifiedDate criterion was tried but proved
// unreliable: FileMaker returns error 401 ("no records match") when the
// criterion finds nothing, which is indistinguishable from a genuine empty
// result AND the Replit_ModifiedDate field does not reliably auto-update on
// every record save, so changed records are silently missed.
//
// Every returned record carries `fmModifiedMs` (Replit_ModifiedDate parsed to
// epoch ms) for informational logging. The highest seen value is returned as
// `maxFmTimestamp` and stored by the caller for display purposes.
export async function getAllStockbook(
  onProgress?: (fetched: number, total: number) => void,
): Promise<{ records: FMStockbookRecord[]; maxFmTimestamp: string | null }> {
  return withToken(async (config, token) => {
    const layout = "StockBook";
    const batchSize = 1000;
    const results: FMStockbookRecord[] = [];
    let offset = 1;
    let knownTotal = 0;
    let maxFmTimestamp: string | null = null;
    let maxFmMs = 0;

    const query = [{ Tag_StockTracked: "1" }];

    // fetchedFromFM counts every record received from FileMaker across all
    // batches so the progress bar starts moving on the first batch.
    let fetchedFromFM = 0;

    while (true) {
      const { records, total } = await findRecordsPage(
        config, token, layout, query, batchSize, offset,
      );
      if (!records.length) break;
      if (!knownTotal && total) knownTotal = total;
      fetchedFromFM += records.length;
      for (const r of records) {
        const pcode = sanitizeStr(r.fieldData["PCODE"] as string | undefined);
        if (!pcode) continue;
        const item = sanitizeStr(
          (r.fieldData["Item"] as string | undefined) ??
          (r.fieldData["Description"] as string | undefined),
        ) ?? "";
        const fmTs = sanitizeStr(r.fieldData["Replit_ModifiedDate"] as string | undefined);
        const fmModifiedMs = fmTs ? fmTextTimestampToMs(fmTs) : 0;
        const rawTracked = r.fieldData["Tag_StockTracked"];
        results.push({
          pcode,
          description: item,
          qtyOnHand: Number(r.fieldData["QtyOnHand"] ?? 0),
          cost: Number(r.fieldData["Cost"] ?? 0),
          costSub: Number(r.fieldData["CostSub"] ?? 0),
          unit: sanitizeStr(r.fieldData["Unit"] as string | undefined),
          location: sanitizeStr(r.fieldData["Location"] as string | undefined),
          otype: sanitizeStr(r.fieldData["OTYPE"] as string | undefined),
          project: sanitizeStr(r.fieldData["Project"] as string | undefined),
          pid: sanitizeStr(r.fieldData["PID"] as string | undefined),
          // Store the Data API container endpoint URL (Bearer-token accessible)
          // rather than the Streaming_SSL URL (which rejects all token types).
          image: sanitizeStr(r.fieldData["Image"] as string | undefined)
            ? `${config.serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(config.database)}/layouts/${encodeURIComponent(layout)}/records/${r.recordId}/containers/Image/1`
            : null,
          tracked: rawTracked === 1 || rawTracked === "1" || rawTracked === true,
          fmModifiedMs,
        });
        // Track the highest Replit_ModifiedDate so we can persist it after sync.
        if (fmTs && fmModifiedMs > maxFmMs) {
          maxFmMs = fmModifiedMs;
          maxFmTimestamp = fmTs;
        }
      }
      // Emit once per batch so the bar advances after every 1,000 FM records.
      if (onProgress) {
        onProgress(fetchedFromFM, knownTotal || fetchedFromFM);
      }
      if (records.length < batchSize) break;
      offset += batchSize;
    }

    return { records: results, maxFmTimestamp };
  });
}

// Fetch a FileMaker container image via the Data API container endpoint.
// The stored URL is already in the correct format:
//   /fmi/data/vLatest/databases/<db>/layouts/<layout>/records/<id>/containers/Image/1
// This endpoint accepts the Data API Bearer token, unlike the Streaming_SSL URLs.
export async function fetchFMImage(imageUrl: string): Promise<{ body: Buffer; contentType: string }> {
  return withToken(async (config, token) => {
    const res = await sslFetch(config.allowSelfSigned, imageUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(unreadable)");
      throw new Error(`FM image fetch failed ${res.status}: ${errBody}`);
    }

    // Buffer fully inside withToken so the token stays live during the read.
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    return { body: buf, contentType };
  });
}

// Update Tag_StockTracked for a given PCODE in the FileMaker StockBook layout.
// Returns true when the record was found and updated, false when the PCODE doesn't exist.
export async function setStockTracked(pcode: string, tracked: boolean): Promise<boolean> {
  return withToken(async (config, token) => {
    const layout = "StockBook";
    // Find the record first to get its FileMaker internal recordId.
    const records = await findRecords(config, token, layout, [{ PCODE: pcode }], 1);
    if (!records.length) return false;
    const recordId = records[0].recordId;

    const url = `${config.serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(config.database)}/layouts/${encodeURIComponent(layout)}/records/${recordId}`;
    const res = await sslFetch(config.allowSelfSigned, url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fieldData: { Tag_StockTracked: tracked ? 1 : 0 } }),
    });

    if (!res.ok) {
      const data = (await res.json()) as FileMakerResponse;
      throw new Error(`FileMaker update failed: ${data.messages[0]?.message ?? res.status}`);
    }
    return true;
  });
}

let projectsCache: { data: Array<Record<string, unknown>>; ts: number } | null = null;

export async function findProjectsCached(search?: string): Promise<Array<Record<string, unknown>>> {
  if (!search && projectsCache && Date.now() - projectsCache.ts < 60_000) {
    return projectsCache.data;
  }
  const data = await findProjects(search);
  if (!search) {
    projectsCache = { data, ts: Date.now() };
  }
  return data;
}
