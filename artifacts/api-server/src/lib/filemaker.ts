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

// Projects layout columns: ProjectID, Address, ClientName, Status
export async function findProjects(search?: string): Promise<Array<Record<string, unknown>>> {
  return withToken(async (config, token) => {
    const layout = "Projects";
    const query = search ? [{ Address: `*${search}*` }] : undefined;
    const records = await findRecords(config, token, layout, query, 200);
    return records.map((r) => ({
      id: r.fieldData["ProjectID"] as string,
      recordId: r.recordId,
      address: r.fieldData["Address"] as string,
      clientName: r.fieldData["ClientName"] as string,
      status: r.fieldData["Status"] as string,
      ...r.fieldData,
    }));
  });
}

// Direct project lookup by ProjectID field (no list scan / cache dependency)
export async function findProjectById(projectId: string): Promise<Record<string, unknown> | null> {
  return withToken(async (config, token) => {
    const layout = "Projects";
    const records = await findRecords(config, token, layout, [{ ProjectID: projectId }], 1);
    if (!records.length) return null;
    const r = records[0];
    return {
      id: r.fieldData["ProjectID"] as string,
      recordId: r.recordId,
      address: r.fieldData["Address"] as string,
      clientName: r.fieldData["ClientName"] as string,
      status: r.fieldData["Status"] as string,
      ...r.fieldData,
    };
  });
}

// Cutlists layout columns: CutlistID, ProjectID, Description, Status
export async function findCutlistsByProject(projectId: string): Promise<Array<Record<string, unknown>>> {
  return withToken(async (config, token) => {
    const layout = "Cutlists";
    const records = await findRecords(config, token, layout, [{ ProjectID: projectId }], 200);
    return records.map((r) => ({
      id: r.fieldData["CutlistID"] as string,
      recordId: r.recordId,
      projectId: r.fieldData["ProjectID"] as string,
      description: r.fieldData["Description"] as string,
      status: r.fieldData["Status"] as string,
      ...r.fieldData,
    }));
  });
}

export async function findCutlistById(cutlistId: string): Promise<Record<string, unknown> | null> {
  return withToken(async (config, token) => {
    const layout = "Cutlists";
    const records = await findRecords(config, token, layout, [{ CutlistID: cutlistId }], 1);
    if (!records.length) return null;
    const r = records[0];
    return {
      id: r.fieldData["CutlistID"] as string,
      recordId: r.recordId,
      projectId: r.fieldData["ProjectID"] as string,
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

// StockBook layout columns: PCODE, Item, QtyOnHand, Unit
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
  tracked: boolean;
}

// Format a JS Date as the FileMaker timestamp string expected by _find:
// "MM/DD/YYYY HH:MM:SS"
function toFileMakerTimestamp(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min}:${ss}`;
}

// Fetch tracked records from the FileMaker StockBook layout in batches.
// When `since` is provided only records with ModifiedDate > since are fetched
// (delta / incremental sync). Without it every tracked record is returned.
// onProgress(fetched, total) is called after each batch.
export async function getAllStockbook(
  onProgress?: (fetched: number, total: number) => void,
  since?: Date,
): Promise<FMStockbookRecord[]> {
  return withToken(async (config, token) => {
    const layout = "StockBook";
    const batchSize = 1000;
    const results: FMStockbookRecord[] = [];
    let offset = 1;
    let knownTotal = 0;

    // When `since` is set, add a ModifiedDate range to the criterion so
    // FileMaker returns only records changed after the last sync.
    // Criteria in the same object are ANDed by FileMaker Data API.
    const criterion: Record<string, string> = { Tag_StockTracked: "1" };
    if (since) {
      criterion["ModifiedDate"] = `>${toFileMakerTimestamp(since)}`;
    }
    const query = [criterion];

    // fetchedFromFM counts every record received from FileMaker across all
    // batches (before the PCODE filter).  We use this for progress so the
    // bar starts moving immediately on the first batch instead of waiting
    // for 50 filtered results to accumulate.
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
        results.push({
          pcode,
          description: item,
          qtyOnHand: Number(r.fieldData["QtyOnHand"] ?? 0),
          unit: sanitizeStr(r.fieldData["Unit"] as string | undefined),
          location: sanitizeStr(r.fieldData["Location"] as string | undefined),
          tracked: true,
        });
      }
      // Emit once per batch so the bar advances after every 1,000 FM records.
      if (onProgress) {
        onProgress(fetchedFromFM, knownTotal || fetchedFromFM);
      }
      if (records.length < batchSize) break;
      offset += batchSize;
    }

    return results;
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
