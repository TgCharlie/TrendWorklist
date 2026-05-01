import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Material {
  id: number;
  pcode: string;
  displayName: string;
  length: number | null;
  width: number | null;
  thickness: number | null;
  notes: string | null;
  isFavourite: boolean;
}

interface Worklist {
  id: number;
  worklistNumber: string;
  projectId: string | null;
  projectAddress: string | null;
  machineType: "B" | "C";
  status: string;
}

interface AddToWorklistState {
  material: Material;
  worklistId: string;
  quantity: number;
  length: string;
  width: string;
  thickness: string;
  notes: string;
}

export default function FavouritesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addState, setAddState] = useState<AddToWorklistState | null>(null);

  const { data: favourites = [], isLoading } = useQuery<Material[]>({
    queryKey: ["materials", "favourites"],
    queryFn: () => apiFetch("/materials?favouritesOnly=true"),
  });

  const { data: worklists = [] } = useQuery<Worklist[]>({
    queryKey: ["worklists"],
    queryFn: () => apiFetch("/worklists"),
    select: (wls) => wls.filter((w) => w.status === "draft"),
  });

  const toggleFavouriteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/materials/${id}/favourite`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: "Removed from favourites" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const addToWorklistMutation = useMutation({
    mutationFn: ({ worklistId, data }: { worklistId: string; data: Record<string, unknown> }) =>
      apiFetch(`/worklists/${worklistId}/items`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worklists"] });
      setAddState(null);
      toast({ title: "Item added to worklist" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add item", description: err.message, variant: "destructive" });
    },
  });

  function openAddDialog(material: Material) {
    setAddState({
      material,
      worklistId: worklists[0]?.id.toString() ?? "",
      quantity: 1,
      length: material.length?.toString() ?? "",
      width: material.width?.toString() ?? "",
      thickness: material.thickness?.toString() ?? "",
      notes: "",
    });
  }

  function handleAddConfirm() {
    if (!addState || !addState.worklistId) return;
    addToWorklistMutation.mutate({
      worklistId: addState.worklistId,
      data: {
        materialId: addState.material.id,
        pcode: addState.material.pcode,
        displayName: addState.material.displayName,
        quantity: addState.quantity,
        length: addState.length || null,
        width: addState.width || null,
        thickness: addState.thickness || null,
        notes: addState.notes || null,
      },
    });
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Favourites</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Frequently used materials — star items on the Materials screen to add them here.
        </p>
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-16">Loading...</div>
      ) : favourites.length === 0 ? (
        <Card className="bg-white border-zinc-200 p-12 text-center">
          <svg
            className="w-10 h-10 text-zinc-200 mx-auto mb-3"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
          <p className="text-zinc-500 text-sm">No favourites yet.</p>
          <p className="text-zinc-400 text-xs mt-1">
            Star a material on the Materials screen to add it here.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">PCODE</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Description</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">L</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">W</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">T</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Notes</th>
                <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {favourites.map((m, i) => (
                <tr
                  key={m.id}
                  data-testid={`row-favourite-${m.id}`}
                  className={`border-t border-zinc-200 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                >
                  <td className="px-4 py-2.5 font-mono text-blue-600 text-xs font-bold">
                    {m.pcode}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-800">{m.displayName}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-right font-mono text-xs">
                    {m.length ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-right font-mono text-xs">
                    {m.width ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-right font-mono text-xs">
                    {m.thickness ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{m.notes}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        data-testid={`button-add-to-worklist-${m.id}`}
                        onClick={() => openAddDialog(m)}
                        title="Add to worklist"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-medium transition-colors px-2 py-1 rounded hover:bg-blue-50"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add
                      </button>
                      <button
                        data-testid={`button-unfavourite-${m.id}`}
                        onClick={() => toggleFavouriteMutation.mutate(m.id)}
                        title="Remove from favourites"
                        className="text-yellow-500 hover:text-zinc-400 transition-colors p-1"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!addState} onOpenChange={(open) => !open && setAddState(null)}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-950 max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Worklist</DialogTitle>
          </DialogHeader>
          {addState && (
            <div className="space-y-4 py-1">
              <div className="bg-zinc-50 rounded-lg px-3 py-2.5 border border-zinc-200">
                <p className="font-mono text-blue-600 text-xs font-bold">{addState.material.pcode}</p>
                <p className="text-zinc-800 text-sm mt-0.5">{addState.material.displayName}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Worklist</Label>
                {worklists.length === 0 ? (
                  <p className="text-zinc-500 text-sm italic">No draft worklists available. Create one first.</p>
                ) : (
                  <Select
                    value={addState.worklistId}
                    onValueChange={(v) => setAddState((s) => s ? { ...s, worklistId: v } : s)}
                  >
                    <SelectTrigger className="bg-white border-zinc-300 text-zinc-950">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-zinc-200">
                      {worklists.map((wl) => (
                        <SelectItem key={wl.id} value={wl.id.toString()}>
                          <span className="font-mono text-xs mr-2">{wl.worklistNumber}</span>
                          {wl.projectId && <span className="text-zinc-500">— {wl.projectId}</span>}
                          {wl.projectAddress && !wl.projectId && (
                            <span className="text-zinc-500 truncate">— {wl.projectAddress}</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={addState.quantity}
                  onChange={(e) =>
                    setAddState((s) => s ? { ...s, quantity: parseInt(e.target.value) || 1 } : s)
                  }
                  className="bg-white border-zinc-300 text-zinc-950 max-w-24"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(["length", "width", "thickness"] as const).map((dim) => (
                  <div key={dim} className="space-y-1.5">
                    <Label className="text-zinc-700 capitalize">{dim === "thickness" ? "T" : dim === "length" ? "L" : "W"} (mm)</Label>
                    <Input
                      type="number"
                      value={addState[dim]}
                      onChange={(e) =>
                        setAddState((s) => s ? { ...s, [dim]: e.target.value } : s)
                      }
                      placeholder={`${dim === "thickness" ? "T" : dim === "length" ? "L" : "W"}`}
                      className="bg-white border-zinc-300 text-zinc-950 font-mono text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Notes (optional)</Label>
                <Input
                  value={addState.notes}
                  onChange={(e) =>
                    setAddState((s) => s ? { ...s, notes: e.target.value } : s)
                  }
                  placeholder="Any notes..."
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddState(null)} className="text-zinc-400">
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleAddConfirm}
              disabled={addToWorklistMutation.isPending || !addState?.worklistId}
            >
              Add to Worklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
