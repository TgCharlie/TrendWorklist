import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { useGetMaterialStock } from "@workspace/api-client-react";
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

function StockBadge({ materialId }: { materialId: number }) {
  const { data, isLoading, isError } = useGetMaterialStock(materialId, {
    query: { retry: false, staleTime: 60_000 },
  });

  if (isLoading) {
    return <span className="text-zinc-300 text-xs animate-pulse">…</span>;
  }
  if (isError || data == null || (data as { quantity?: number }).quantity == null) {
    return <span className="text-zinc-300 text-xs">—</span>;
  }
  const qty = (data as { quantity: number }).quantity;
  const unit = (data as { unit?: string | null }).unit ?? "";
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

const EMPTY_FORM = { pcode: "", displayName: "", length: "", width: "", thickness: "", notes: "" };

export default function MaterialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Material | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

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
    setForm({
      pcode: m.pcode,
      displayName: m.displayName,
      length: m.length != null ? String(m.length) : "",
      width: m.width != null ? String(m.width) : "",
      thickness: m.thickness != null ? String(m.thickness) : "",
      notes: m.notes ?? "",
    });
  }

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
            onClick={() => { setShowCreate(true); setForm(EMPTY_FORM); }}
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
                  <td className="px-4 py-2.5 font-mono text-blue-600 text-xs font-bold">{m.pcode}</td>
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
                            data-testid={`button-edit-material-${m.id}`}
                            onClick={() => openEdit(m)}
                            className="text-zinc-500 hover:text-zinc-950 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            data-testid={`button-delete-material-${m.id}`}
                            onClick={() => {
                              if (confirm(`Delete ${m.pcode}?`)) deleteMutation.mutate(m.id);
                            }}
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

      <Dialog open={showCreate || !!editItem} onOpenChange={(open) => {
        if (!open) { setShowCreate(false); setEditItem(null); }
      }}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-950">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Material" : "Add Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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
            <div className="space-y-1.5">
              <Label className="text-zinc-700">Description</Label>
              <Input
                data-testid="input-material-description"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="e.g. 18mm MDF Sheet 2400x1200"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Length (mm)</Label>
                <Input
                  data-testid="input-material-length"
                  value={form.length}
                  onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
                  placeholder="2400"
                  type="number"
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Width (mm)</Label>
                <Input
                  data-testid="input-material-width"
                  value={form.width}
                  onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
                  placeholder="1200"
                  type="number"
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Thickness (mm)</Label>
                <Input
                  data-testid="input-material-thickness"
                  value={form.thickness}
                  onChange={(e) => setForm((f) => ({ ...f, thickness: e.target.value }))}
                  placeholder="18"
                  type="number"
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
              </div>
            </div>
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
              onClick={() => { setShowCreate(false); setEditItem(null); }}
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
