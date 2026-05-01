import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStockbook,
  useSyncStockbook,
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

function fmt(d: string | null | undefined): string {
  if (!d) return "Never";
  return new Date(d).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function StockbookPage() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const params = search.trim() ? { search: search.trim() } : undefined;
  const { data, isLoading, isError, error } = useListStockbook(params, {
    query: {
      queryKey: getListStockbookQueryKey(params),
      staleTime: 30_000,
    },
  });

  const sync = useSyncStockbook({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStockbookQueryKey() });
      },
    },
  });

  const items = data?.items ?? [];
  const lastSyncedAt = data?.lastSyncedAt;

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
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="shrink-0 bg-blue-600 hover:bg-blue-700"
        >
          {sync.isPending ? (
            <>
              <svg
                className="w-4 h-4 mr-2 animate-spin"
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
              Syncing…
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4 mr-2"
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
              Sync from FileMaker
            </>
          )}
        </Button>
      </div>

      {sync.isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Sync failed:{" "}
          {sync.error instanceof Error ? sync.error.message : "Unknown error"}
        </div>
      )}

      {sync.isSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Synced {sync.data?.synced ?? 0} records from FileMaker.
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
            placeholder="Search by pcode or description…"
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
                  onClick={() => sync.mutate()}
                  disabled={sync.isPending}
                >
                  Sync from FileMaker
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
                <TableHead className="font-semibold text-zinc-700">Description</TableHead>
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
