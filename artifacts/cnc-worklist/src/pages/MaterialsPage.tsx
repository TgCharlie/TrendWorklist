import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
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

interface Material {
  id: number;
  pcode: string;
  displayName: string;
  notes: string | null;
  createdAt: string;
}

export default function MaterialsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<Material | null>(null);
  const [form, setForm] = useState({ pcode: "", displayName: "", notes: "" });

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
      setForm({ pcode: "", displayName: "", notes: "" });
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

  const isAdmin = user?.role === "admin";

  function openEdit(m: Material) {
    setEditItem(m);
    setForm({ pcode: m.pcode, displayName: m.displayName, notes: m.notes ?? "" });
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Materials</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Internal materials database (PCODE-mapped)</p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => { setShowCreate(true); setForm({ pcode: "", displayName: "", notes: "" }); }}
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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by PCODE or name..."
          className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 max-w-sm"
        />
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-16">Loading...</div>
      ) : materials.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800 p-12 text-center">
          <p className="text-zinc-500">
            {search ? "No materials match your search." : "No materials yet."}
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800/50">
                <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">PCODE</th>
                <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">Description</th>
                <th className="text-left px-4 py-2.5 text-zinc-400 font-medium">Notes</th>
                {isAdmin && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody>
              {materials.map((m, i) => (
                <tr key={m.id} className={`border-t border-zinc-800 ${i % 2 === 0 ? "bg-zinc-900" : "bg-zinc-900/50"}`}>
                  <td className="px-4 py-2.5 font-mono text-blue-400 text-xs font-bold">{m.pcode}</td>
                  <td className="px-4 py-2.5 text-zinc-200">{m.displayName}</td>
                  <td className="px-4 py-2.5 text-zinc-400 text-xs">{m.notes}</td>
                  {isAdmin && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(m)}
                          className="text-zinc-500 hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${m.pcode}?`)) deleteMutation.mutate(m.id);
                          }}
                          className="text-zinc-500 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showCreate || !!editItem} onOpenChange={(open) => {
        if (!open) { setShowCreate(false); setEditItem(null); }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Material" : "Add Material"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">PCODE</Label>
              <Input
                value={form.pcode}
                onChange={(e) => setForm((f) => ({ ...f, pcode: e.target.value.toUpperCase() }))}
                placeholder="e.g. MDF18-2400"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Description</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="e.g. 18mm MDF Sheet 2400x1200"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowCreate(false); setEditItem(null); }} className="text-zinc-400">
              Cancel
            </Button>
            <Button
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
