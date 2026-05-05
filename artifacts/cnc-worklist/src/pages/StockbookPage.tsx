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

  const handleSync = async () => {
    setSyncState({ ...idleSyncState, active: true, phase: "fetch" });

    try {
      const res = await fetch(`${API_BASE}/stockbook/sync/full`, {
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Stockbook</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Local stock levels synced from FileMaker.{