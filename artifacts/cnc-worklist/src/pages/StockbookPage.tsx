import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStockbook,
  getListStockbookQueryKey,
  useUpdateStockTracked,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SyncState {
  active: boolean;
  phase: "fetch" | "save" | null;
  fetched: number;
  fetchTotal: number;
  saved: number;
  saveTotal: number;
  error: string | null;
  lastResult: { synced: number; syncedAt: string } | null;
}

const idleSyncState: SyncState = {
  active: false,
  phase: null,
  fetched: 0,
  fetchTotal: 0,
  saved: 0,
  saveTotal: 0,
  error: null,
  lastResult: null,
};

function fmt(d: string | null | undefined): string {
  if (!d) return "Never";
  return new Date(d).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ProgressBar({
  value,
  max,
  indeterminate = false,
}: {
  value: number;
  max: number;
  indeterminate?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
      {indeterminate ? (
        <div className="h-2 rounded-full bg-blue-400 animate-pulse w-full" />
      ) : (
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

const API_BASE_STOCKBOOK = "/api/stockbook";

export default function StockbookPage() {
  const [search, setSearch] = useState("");
  const [otype, setOtype] = useState("");
  const [otypes, setOtypes] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>(idleSyncState);
  const [trackedOverrides, setTrackedOverrides] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();
  const PAGE_SIZE = 200;

  const updateTrackedMutation = useUpdateStockTracked({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListStockbookQueryKey() });
        setTrackedOverrides((prev) => ({ ...prev, [result.pcode]: result.tracked }));
      },
      onError: (_err, variables) => {
        // Revert optimistic update on failure
        setTrackedOverrides((prev) => {
          const next = { ...prev };
          delete next[variables.pcode];
          return next;
        });
      },
    },
  });

  useEffect(() => {
    fetch(`${API_BASE_STOCKBOOK}/otypes`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setOtypes(d.otypes ?? []))
      .catch(() => {});
  }, []);

  const trimmed = search.trim();
  const params = useMemo(() => {
    setPage(0);
    const p: { search?: string; otype?: string } = {};
    if (trimmed) p.search = trimmed;
    if (otype) p.otype = otype;
    return Object.keys(p).length ? p : undefined;
  }, [trimmed, otype]);

  const { data, isLoading, isError, error } = useListStockbook(params, {
    query: { staleTime: 30_000 },
  });

  const handleSync = async () => {
    setSyncState({ ...idleSyncState, active: true, phase: "fetch" });

    try {
      const res = await fetch(`${API_BASE_STOCKBOOK}/sync/full`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(text);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line || line.startsWith(":")) continue;
          try {
            const msg = JSON.parse(line) as {
              type: string;
              phase?: string;
              fetched?: number;
              total?: number;
              saved?: number;
              synced?: number;
              syncedAt?: string;
              message?: string;
            };

            if (msg.type === "progress" && msg.phase === "fetch") {
              setSyncState((s) => ({
                ...s,
                phase: "fetch",
                fetched: msg.fetched ?? s.fetched,
                fetchTotal: msg.total ?? s.fetchTotal,
              }));
            } else if (msg.type === "progress" && msg.phase === "save") {
              setSyncState((s) => ({
                ...s,
                phase: "save",
                saved: msg.saved ?? s.saved,
                saveTotal: msg.total ?? s.saveTotal,
              }));
            } else if (msg.type === "done") {
              receivedDone = true;
              setSyncState((s) => ({
                ...s,
                active: false,
                phase: null,
                lastResult: {
                  synced: msg.synced ?? 0,
                  syncedAt: msg.syncedAt ?? new Date().toISOString(),
                },
              }));
              queryClient.invalidateQueries({ queryKey: getListStockbookQueryKey() });
            } else if (msg.type === "error") {
              setSyncState((s) => ({
                ...s,
                active: false,
                phase: null,
                error: msg.message ?? "Sync failed",
              }));
            }
          } catch {
          }
        }
      }

      if (!receivedDone) {
        setSyncState((s) => ({
          ...s,
          active: false,
          phase: null,
          error: s.error ?? null,
        }));
        queryClient.invalidateQueries({ queryKey: getListStockbookQueryKey() });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setSyncState((s) => ({ ...s, active: false, phase: null, error: message }));
    }
  };

  const items = data?.items ?? [];
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  // Prefer the syncedAt from the most recent sync result (set immediately on
  // the "done" SSE event) so the displayed date updates without waiting for a
  // GET refetch, which Express may answer with 304 and stale cached data.
  const lastSyncedAt = syncState.lastResult?.syncedAt ?? data?.lastSyncedAt;

  const syncProgress = (() => {
    if (!syncState.active) return null;
    if (syncState.phase === "fetch") {
      const total = syncState.fetchTotal;
      const fetched = syncState.fetched;
      const hasTotal = total > 0;
      return {
        label: hasTotal
          ? `Fetching from FileMaker… ${fetched.toLocaleString()} / ${total.toLocaleString()} records`
          : `Fetching from FileMaker… ${fetched.toLocaleString()} records`,
        value: fetched,
        max: hasTotal ? total : (fetched || 1),
        indeterminate: !hasTotal,
      };
    }
    return {
      label: `Saving to local database… ${syncState.saved.toLocaleString()} / ${syncState.saveTotal.toLocaleString()} records`,
      value: syncState.saved,
      max: syncState.saveTotal || 1,
      indeterminate: false,
    };
  })();

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 48px)" }}>

      {/* ── Fixed header ─────────────────────────────────────────── */}
      <div className="shrink-0 space-y-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-950">Stockbook</h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              Local stock levels synced from FileMaker.{" "}
              <span className="text-zinc-400">Last sync: {fmt(lastSyncedAt)}</span>
            </p>
          </div>

          <Button
            onClick={() => handleSync()}
            disabled={syncState.active}
            className="shrink-0 bg-blue-600 hover:bg-blue-700"
          >
            <svg
              className={`w-4 h-4 mr-2 ${syncState.active ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {syncState.active ? "Syncing…" : "Sync"}
          </Button>
        </div>

        {syncProgress && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-sm text-blue-700">
              <span>{syncProgress.label}</span>
              {!syncProgress.indeterminate && syncProgress.max > 0 && (
                <span className="font-medium tabular-nums">
                  {Math.min(100, Math.round((syncProgress.value / syncProgress.max) * 100))}%
                </span>
              )}
            </div>
            <ProgressBar
              value={syncProgress.value}
              max={syncProgress.max}
              indeterminate={syncProgress.indeterminate}
            />
          </div>
        )}

        {syncState.error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            Sync failed: {syncState.error}
          </div>
        )}

        {syncState.lastResult && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Synced {syncState.lastResult.synced.toLocaleString()} records from FileMaker.
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by pcode or item…"
              className="pl-9"
            />
          </div>

          {otypes.length > 0 && (
            <Select value={otype || "__all__"} onValueChange={(v) => setOtype(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All types</SelectItem>
                {otypes.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => { setSearch(""); setOtype(""); }}
            disabled={!search && !otype}
          >
            Clear
          </Button>
          {data && (
            <span className="text-sm text-zinc-500">
              {data.total} item{data.total !== 1 ? "s" : ""}
            </span>
          )}

          {totalPages > 1 && (
            <div className="ml-auto flex items-center gap-2 text-sm text-zinc-500">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Prev
              </Button>
              <span className="tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next →
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable table ──────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-zinc-200 bg-white">
        {isLoading ? (
          <div className="py-20 text-center text-zinc-400 text-sm">
            <svg
              className="w-6 h-6 mx-auto mb-2 animate-spin text-zinc-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707"
              />
            </svg>
            Loading stockbook…
          </div>
        ) : isError ? (
          <div className="py-20 text-center text-red-500 text-sm">
            {error instanceof Error ? error.message : "Failed to load stockbook"}
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-zinc-400 text-sm">
            {search || otype ? (
              <>No results{search ? <> for &ldquo;{search}&rdquo;</> : null}{otype ? <> in OTYPE &ldquo;{otype}&rdquo;</> : null}</>
            ) : (
              <>No stock items yet. <button className="text-blue-600 hover:underline" onClick={() => handleSync()} disabled={syncState.active}>Sync</button> to populate this table.</>
            )}
          </div>
        ) : (
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 bg-zinc-50 shadow-[0_1px_0_0_theme(colors.zinc.200)]">
              <TableRow className="bg-zinc-50 hover:bg-zinc-50">
                <TableHead className="w-36 font-semibold text-zinc-700">PCODE</TableHead>
                <TableHead className="font-semibold text-zinc-700">Item</TableHead>
                <TableHead className="w-16 font-semibold text-zinc-700 text-right whitespace-normal leading-tight">
                  Qty on Hand
                </TableHead>
                <TableHead className="w-20 font-semibold text-zinc-700">Unit</TableHead>
                <TableHead className="w-32 font-semibold text-zinc-700">Location</TableHead>
                <TableHead className="w-32 font-semibold text-zinc-700">Project</TableHead>
                <TableHead className="w-24 font-semibold text-zinc-700">PID</TableHead>
                <TableHead className="w-24 font-semibold text-zinc-700">OTYPE</TableHead>
                <TableHead className="w-24 min-w-24 font-semibold text-zinc-700 text-center whitespace-nowrap" title="Tag_StockTracked — uncheck to disable tracking in FileMaker">TagTracked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((item) => (
                <TableRow key={item.id} className="hover:bg-zinc-50/50">
                  <TableCell className="font-mono text-sm text-zinc-800 font-medium">
                    {item.pcode}
                  </TableCell>
                  <TableCell className="text-zinc-700 text-sm text-left">
                    {item.description || (
                      <span className="text-zinc-400 italic">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        item.qtyOnHand <= 0
                          ? "text-red-600 font-semibold text-sm"
                          : item.qtyOnHand < 5
                          ? "text-amber-600 font-semibold text-sm"
                          : "text-zinc-800 text-sm"
                      }
                    >
                      {item.qtyOnHand}
                    </span>
                  </TableCell>
                  <TableCell className="text-zinc-500 text-sm">
                    {item.unit ?? <span className="text-zinc-300">—</span>}
                  </TableCell>
                  <TableCell className="text-zinc-500 text-sm">
                    {item.location ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {item.location}
                      </Badge>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500 text-sm">
                    {item.project ?? <span className="text-zinc-300">—</span>}
                  </TableCell>
                  <TableCell className="text-zinc-500 text-sm font-mono">
                    {item.pid ?? <span className="text-zinc-300">—</span>}
                  </TableCell>
                  <TableCell className="text-zinc-500 text-sm">
                    {item.otype ?? <span className="text-zinc-300">—</span>}
                  </TableCell>
                  <TableCell className="text-center w-24 min-w-24">
                    <input
                      type="checkbox"
                      checked={trackedOverrides[item.pcode] ?? item.tagStockTracked}
                      disabled={
                        updateTrackedMutation.isPending &&
                        updateTrackedMutation.variables?.pcode === item.pcode
                      }
                      title={
                        (trackedOverrides[item.pcode] ?? item.tagStockTracked)
                          ? "Stock tracked in FileMaker — click to disable"
                          : "Stock tracking disabled — click to enable"
                      }
                      onChange={(e) => {
                        const newTracked = e.target.checked;
                        setTrackedOverrides((prev) => ({ ...prev, [item.pcode]: newTracked }));
                        updateTrackedMutation.mutate({
                          pcode: item.pcode,
                          data: { tracked: newTracked },
                        });
                      }}
                      className="w-4 h-4 accent-blue-600 cursor-pointer disabled:cursor-wait"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        )}
      </div>

    </div>
  );
}
