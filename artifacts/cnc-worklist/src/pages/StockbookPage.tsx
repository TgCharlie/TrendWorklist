import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStockbook,
  getListStockbookQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const API_BASE = "/api";

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

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
      <div
        className="bg-blue-500 h-2 rounded-full transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function StockbookPage() {
  const [search, setSearch] = useState("");
  const [syncState, setSyncState] = useState<SyncState>(idleSyncState);
  const queryClient = useQueryClient();

  const params = search.trim() ? { search: search.trim() } : undefined;
  const { data, isLoading, isError, error } = useListStockbook(params, {
    query: {
      queryKey: getListStockbookQueryKey(params),
      staleTime: 30_000,
    },
  });

  const handleSync = async (full = false) => {
    setSyncState({ ...idleSyncState, active: true, phase: "fetch" });

    try {
      const res = await fetch(`${API_BASE}/stockbook/${full ? "sync/full" : "sync"}`, {
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
  const lastSyncedAt = data?.lastSyncedAt;

  const syncProgress = (() => {
    if (!syncState.active) return null;
    if (syncState.phase === "fetch") {
      const total = syncState.fetchTotal;
      const fetched = syncState.fetched;
      return {
        label: total
          ? `Fetching from FileMaker… ${fetched.toLocaleString()} / ${total.toLocaleString()} records`
          : `Fetching from FileMaker…`,
        value: fetched,
        max: total || fetched || 1,
      };
    }
    return {
      label: `Saving to local database… ${syncState.saved.toLocaleString()} / ${syncState.saveTotal.toLocaleString()} records`,
      value: syncState.saved,
      max: syncState.saveTotal || 1,
    };
  })();

  return (
    <div className="space-y-6">
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
          {syncState.active ? "Syncing…" : "Quick sync"}
        </Button>
        <Button
          onClick={() => handleSync(true)}
          disabled={syncState.active}
          variant="outline"
          className="shrink-0"
        >
          Full sync
        </Button>
      </div>

      {syncProgress && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-sm text-blue-700">
            <span>{syncProgress.label}</span>
            <span className="font-medium tabular-nums">
              {syncProgress.max > 0
                ? `${Math.min(100, Math.round((syncProgress.value / syncProgress.max) * 100))}%`
                : ""}
            </span>
          </div>
          <ProgressBar value={syncProgress.value} max={syncProgress.max} />
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

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
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
        {data && (
          <span className="text-sm text-zinc-500">
            {data.total} item{data.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
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
            {search ? (
              <>No results for &ldquo;{search}&rdquo;</>
            ) : (
              <>
                No stock items yet.{" "}
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() => handleSync()}
                  disabled={syncState.active}
                >
                  Quick sync
                </button>{" "}
                to populate this table.
              </>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50">
                <TableHead className="w-36 font-semibold text-zinc-700">PCODE</TableHead>
                <TableHead className="font-semibold text-zinc-700">Item</TableHead>
                <TableHead className="w-28 font-semibold text-zinc-700 text-right">
                  Qty on Hand
                </TableHead>
                <TableHead className="w-20 font-semibold text-zinc-700">Unit</TableHead>
                <TableHead className="w-32 font-semibold text-zinc-700">Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="hover:bg-zinc-50/50">
                  <TableCell className="font-mono text-sm text-zinc-800 font-medium">
                    {item.pcode}
                  </TableCell>
                  <TableCell className="text-zinc-700 text-sm">
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
