import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { useGetMaterialStock, getGetMaterialStockQueryKey } from "@workspace/api-client-react";
import type { StockLevel } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

function StockBadge({ materialId }: { materialId: number }) {
  const { data, isLoading, isError } = useGetMaterialStock(materialId, {
    query: { queryKey: getGetMaterialStockQueryKey(materialId), retry: false, staleTime: 60_000 },
  });

  const stock = data as StockLevel | undefined;

  if (isLoading) {
    return <span className="text-zinc-300 text-xs animate-pulse">…</span>;
  }
  if (isError || stock == null) {
    return <span className="text-zinc-300 text-xs">—</span>;
  }
  const qty = stock.qtyOnHand;
  const unit = stock.unit ?? "";
  const color =
    qty <= 0
      ? "text-red-600 bg-red-50 border-red-200"
      : qty < 5
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-green-700 bg-green-50 border-green-200";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${color}`}>
      {qty} {unit}
    </span>
  );
}

interface Material {
  id: number;
  pcode: string;
  displayName: string;
  length: number | null;
  width: number | null;
  thickness: number | null;
  notes: string | null;
  isFavourite: boolean;
  createdAt: string;
}

interface StockbookItem {
  pcode: string;
  description: string;
  qtyOnHand: number;
  unit: string | null;
  length?: number | null;
  width?: number | null;
  thickness?: number | null;
}

const EMPTY_FORM = { pcode: "", displayName: "", length: "", width: "", thickness: "", notes: "" };

// Parse "2400 × 1800 × 16 - rest of description" into numeric dimensions.
// The × separator may be the Unicode multiplication sign (U+00D7) or plain 'x'.
// Returns null if the description doesn't start with the expected pattern.
function parseDimsFromDescription(desc: string): { length: string; width: string; thickness: string } | null {
  const m = desc.trim().match(/^(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { length: m[1], width: m[2], thickness: m[3] };
}

function StockbookPicker({ onSelect }: { onSelect: (item: StockbookItem) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockbookItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiFetch<{ items: StockbookItem[] }>(
          `/stockbook?search=${encodeURIComponent(query.trim())}`
        );
        setResults((data.items ?? []).slice(0, 20));
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function handleSelect(item: StockbookItem) {
    onSelect(item);
    setQuery("");
    setResults([]);
    setSearched(false);
  }

  const showResults = searched && query.trim().length > 0;

  return (
    <div className="space-y-1.5">
      <Label className="text-zinc-700">Search Stockbook</Label>
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a PCODE or description to search…"
          className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 pl-8"
        />
        {loading && (
          <svg
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}
      </div>

      {/* Results rendered inline — no portal, so Radix Dialog won't treat
          clicks here as "outside" and close the dialog prematurely. */}
      {showResults && (
        <div className="border border-zinc-200 rounded-md overflow-x-hidden bg-white shadow-sm">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-zinc-400 text-center">
              No Stockbook entries match — fill the form manually below.
            </div>
          ) : (
            <ul className="max-h-52 overflow-y-auto overflow-x-hidden divide-y divide-zinc-100">
              {results.map((item) => (
                <li key={item.pcode}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="w-full text-left px-3 py-2.5 cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-bold text-blue-600 truncate">{item.pcode}</span>
                      <span className="block text-xs text-zinc-600 whitespace-normal break-words">{item.description}</span>
                    </div>
                    {item.qtyOnHand != null && (
                      <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded border font-medium ${
                        item.qtyOnHand <= 0
                          ? "text-red-600 bg-red-50 border-red-200"
                          : item.qtyOnHand < 5
                            ? "text-amber-700 bg-amber-50 border-amber-200"
                            : "text-green-700 bg-green-50 border-green-200"
                      }`}>
                        {item.qtyOnHand} {item.unit ?? ""}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!showResults && !loading && !query && (
        <p className="text-xs text-zinc-400">
          Search to import from Stockbook, or fill the fields below manually.
        </p>
      )}
    </div>
  );
}

export default function MaterialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Material | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedStockbookItem, setSelectedStockbookItem] = useState<StockbookItem | null>(null);
  const [deletePending, setDeletePending] = useState<Material | null>(null);

  const { data: materials = [], isLoading } = useQuery<Material[]>({
    queryKey: ["materials", search],
    queryFn: () =>
      apiFetch(`/materials${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiFetch<Material>("/materials", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setSelectedStockbookItem(null);
      toast({ title: "Material created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof form> }) =>
      apiFetch<Material>(`/materials/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      setEditItem(null);
      toast({ title: "Material updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/materials/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: "Material deleted" });
    },
  });

  const toggleFavouriteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ isFavourite: boolean; materialId: number }>(`/materials/${id}/favourite`, {
        method: "POST",
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: result.isFavourite ? "Added to favourites" : "Removed from favourites" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isAdmin = user?.role === "admin";

  function openEdit(m: Material) {
    setEditItem(m);
    setSelectedStockbookItem(null);
    setForm({
      pcode: m.pcode,
      displayName: m.displayName,
      length: m.length != null ? String(m.length) : "",
      width: m.width != null ? String(m.width) : "",
      thickness: m.thickness != null ? String(m.thickness) : "",
      notes: m.notes ?? "",
    });
  }

  function handleStockbookSelect(item: StockbookItem) {
    setSelectedStockbookItem(item);
    // Dimensions: prefer explicit fields; fall back to parsing the description
    // which follows the pattern "2400 × 1800 × 16 - rest of name".
    // Always set all three fields explicitly so stale values from a previous
    // selection are never carried over.
    const dims = parseDimsFromDescription(item.description ?? "");
    setForm((f) => ({
      ...f,
      pcode: item.pcode.toUpperCase(),
      displayName: item.description ?? "",
      length: item.length != null ? String(item.length) : (dims?.length ?? ""),
      width:  item.width  != null ? String(item.width)  : (dims?.width  ?? ""),
      thickness: item.thickness != null ? String(item.thickness) : (dims?.thickness ?? ""),
    }));
  }

  function clearStockbookSelection() {
    setSelectedStockbookItem(null);
    setForm(EMPTY_FORM);
  }

  function closeDialog() {
    setShowCreate(false);
    setEditItem(null);
    setSelectedStockbookItem(null);
  }

  const dimLocked = selectedStockbookItem !== null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Materials</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Internal materials database (PCODE-mapped)</p>
        </div>
        {isAdmin && (
          <Button
            data-testid="button-add-material"
            onClick={() => { setShowCreate(true); setForm(EMPTY_FORM); setSelectedStockbookItem(null); }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Material
          </Button>
        )}
      </div>

      <div className="mb-4">
        <Input
          data-testid="input-material-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by PCODE or name..."
          className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-16">Loading...</div>
      ) : materials.length === 0 ? (
        <Card className="bg-white border-zinc-200 p-12 text-center">
          <p className="text-zinc-500">
            {search ? "No materials match your search." : "No materials yet."}
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">PCODE</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Description</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">L (mm)</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">W (mm)</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">T (mm)</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Stock</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Notes</th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m, i) => (
                <tr
                  key={m.id}
                  data-testid={`row-material-${m.id}`}
                  className={`border-t border-zinc-200 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                >
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => openEdit(m)}
                      className="font-mono text-blue-600 text-xs font-bold hover:underline underline-offset-2 cursor-pointer transition-colors hover:text-blue-800"
                      title="Edit material"
                    >
                      {m.pcode}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-800">{m.displayName}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-right font-mono text-xs">{m.length ?? "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-right font-mono text-xs">{m.width ?? "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-right font-mono text-xs">{m.thickness ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <StockBadge materialId={m.id} />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{m.notes}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        data-testid={`button-favourite-${m.id}`}
                        onClick={() => toggleFavouriteMutation.mutate(m.id)}
                        title={m.isFavourite ? "Remove from favourites" : "Add to favourites"}
                        className={`transition-colors ${m.isFavourite ? "text-yellow-500 hover:text-zinc-400" : "text-zinc-300 hover:text-yellow-400"}`}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            data-testid={`button-delete-material-${m.id}`}
                            onClick={() => setDeletePending(m)}
                            className="text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deletePending}
        title="Delete material"
        message={deletePending ? `Are you sure you want to delete ${deletePending.pcode}? This cannot be undone.` : ""}
        confirmLabel="Delete"
        onConfirm={() => { if (deletePending) deleteMutation.mutate(deletePending.id); }}
        onCancel={() => setDeletePending(null)}
      />

      <Dialog open={showCreate || !!editItem} onOpenChange={(open) => {
        if (!open) closeDialog();
      }}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-950">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Material" : "Add Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Stockbook picker — create mode only */}
            {!editItem && (
              <>
                {selectedStockbookItem ? (
                  <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-blue-700 mb-0.5">Selected from Stockbook</p>
                      <p className="font-mono text-xs font-bold text-blue-900">{selectedStockbookItem.pcode}</p>
                      <p className="text-xs text-blue-700 truncate">{selectedStockbookItem.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={clearStockbookSelection}
                      className="shrink-0 text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2 transition-colors mt-0.5"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <StockbookPicker onSelect={handleStockbookSelect} />
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-zinc-200" />
                      <span className="text-xs text-zinc-400 shrink-0">or fill in manually</span>
                      <div className="flex-1 h-px bg-zinc-200" />
                    </div>
                  </>
                )}
              </>
            )}

            {/* PCODE */}
            <div className="space-y-1.5">
              <Label className="text-zinc-700">PCODE</Label>
              <Input
                data-testid="input-material-pcode"
                value={form.pcode}
                onChange={(e) => setForm((f) => ({ ...f, pcode: e.target.value.toUpperCase() }))}
                placeholder="e.g. MDF18-2400"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 font-mono"
              />
            </div>

            {/* Stockbook full description — read-only reference, shown when from stockbook */}
            {selectedStockbookItem && (
              <div className="space-y-1.5">
                <Label className="text-zinc-500 flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Stockbook Description
                </Label>
                <Input
                  value={selectedStockbookItem.description}
                  readOnly
                  className="bg-zinc-50 border-zinc-200 text-zinc-500 cursor-not-allowed select-text"
                />
              </div>
            )}

            {/* Abbreviated description / display name */}
            <div className="space-y-1.5">
              <Label className="text-zinc-700">
                {selectedStockbookItem ? "Abbreviated Description" : "Description"}
              </Label>
              {selectedStockbookItem && (
                <p className="text-xs text-zinc-400 -mt-0.5">
                  Short label shown on the worklist — type your own concise name.
                </p>
              )}
              <Input
                data-testid="input-material-description"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder={selectedStockbookItem ? "e.g. 18mm White Matt PB" : "e.g. 18mm MDF Sheet 2400x1200"}
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
              />
            </div>

            {/* Dimensions — locked when from stockbook */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-700">Dimensions (mm)</span>
                {dimLocked && (
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-400 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Locked — set by Stockbook
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-500 text-xs">Length</Label>
                  <Input
                    data-testid="input-material-length"
                    value={form.length}
                    onChange={(e) => !dimLocked && setForm((f) => ({ ...f, length: e.target.value }))}
                    readOnly={dimLocked}
                    placeholder="2400"
                    type="number"
                    className={dimLocked
                      ? "bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed"
                      : "bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-500 text-xs">Width</Label>
                  <Input
                    data-testid="input-material-width"
                    value={form.width}
                    onChange={(e) => !dimLocked && setForm((f) => ({ ...f, width: e.target.value }))}
                    readOnly={dimLocked}
                    placeholder="1200"
                    type="number"
                    className={dimLocked
                      ? "bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed"
                      : "bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-500 text-xs">Thickness</Label>
                  <Input
                    data-testid="input-material-thickness"
                    value={form.thickness}
                    onChange={(e) => !dimLocked && setForm((f) => ({ ...f, thickness: e.target.value }))}
                    readOnly={dimLocked}
                    placeholder="18"
                    type="number"
                    className={dimLocked
                      ? "bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed"
                      : "bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-zinc-700">Notes</Label>
              <Input
                data-testid="input-material-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={closeDialog}
              className="text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              data-testid="button-save-material"
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                if (editItem) {
                  updateMutation.mutate({ id: editItem.id, data: form });
                } else {
                  createMutation.mutate(form);
                }
              }}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editItem ? "Save Changes" : "Add Material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
