import { getSetting } from "./settings";

interface FileMakerConfig {
  serverUrl: string;
  database: string;
  username: string;
  password: string;
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
      returnedCount: number;
    };
  };
  messages: Array<{ code: string; message: string }>;
}

async function getConfig(): Promise<FileMakerConfig> {
  const [serverUrl, database, username, password] = await Promise.all([
    getSetting("filemaker_server_url"),
    getSetting("filemaker_database"),
    getSetting("filemaker_username"),
    getSetting("filemaker_password"),
  ]);
  return { serverUrl, database, username, password };
}

async function acquireToken(config: FileMakerConfig): Promise<string> {
  const url = `${config.serverUrl}/fmi/data/vLatest/databases/${encodeURIComponent(config.database)}/sessions`;
  const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  const res = await fetch(url, {
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
    await fetch(url, {
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

async function findRecords(
  config: FileMakerConfig,
  token: string,
  layout: string,
  query?: Array<Record<string, string>>,
  limit = 100,
  offset = 1,
): Promise<FileMakerRecord[]> {
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

  const res = await fetch(url, options);
  const data = (await res.json()) as FileMakerResponse;

  if (data.messages[0]?.code === "401") {
    return [];
  }

  if (!res.ok) {
    throw new Error(`FileMaker error: ${data.messages[0]?.message}`);
  }

  return data.response.data ?? [];
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

// StockBook layout columns: PCODE, Description, QtyOnHand, Unit
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
