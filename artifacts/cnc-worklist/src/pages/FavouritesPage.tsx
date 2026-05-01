import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMaterials,
  useListWorklists,
  useToggleFavourite,
  useAddWorklistItem,
  getListMaterialsQueryKey,
  getListWorklistsQueryKey,
} from "@workspace/api-client-react";
import type { Material, WorklistSummary } from "@workspace/api-client-react";
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

interface AddState {
  materialId: number;
  pcode: string;
  displayName: string;
  worklistId: string;
  quantity: number;
  notes: string;
}

export default function FavouritesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addState, setAddState] = useState<AddState | null>(null);

  const { data: favourites = [], isLoading } = useListMaterials(
    { favouritesOnly: true },
    { query: { queryKey: getListMaterialsQueryKey({ favouritesOnly: true }), staleTime: 30_000 } }
  );

  const { data: worklists = [] } = useListWorklists(undefined, {
    query: {
      queryKey: getListWorklistsQueryKey(),
      staleTime: 30_000,
      select: (wls: WorklistSummary[]) => wls.filter((w) => w.status === "draft"),
    },
  });

  const toggleFavouriteMutation = useToggleFavourite({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey({ favouritesOnly: true }) });
        toast({ title: "Removed from favourites" });
      },
      onError: (err) => {
        toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
      },
    },
  });

  const addToWorklistMutation = useAddWorklistItem({
    mutation: {
      onSuccess: () => {
        setAddState(null);
        toast({ title: "Item added to worklist" });
      },
      onError: (err) => {
        toast({ title: "Failed", description: (err as Error).message, variant: "destructive" });
      },
    },
  });

  function openAddDialog(m: Material) {
    const draftWorklists = worklists as WorklistSummary[];
    setAddState({
      materialId: m.id,
      pcode: m.pcode,
      displayName: m.displayName,
      worklistId: draftWorklists[0]?.id.toString() ?? "",
      quantity: 1,
      notes: "",
    });
  }

  function handleAddConfirm() {
    if (!addState || !addState.worklistId) return;
    addToWorklistMutation.mutate({
      id: Number(addState.worklistId),
      data: {
        materialId: addState.materialId,
        pcode: addState.pcode,
        displayName: addState.displayName,
        quantity: addState.quantity,
        notes: addState.notes || undefined,
      },
    });
  }

  const mats = favourites as Material[];
  const draftWorklists = worklists as WorklistSummary[];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Favourites</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Frequently used materials — star items on the Materials screen to add them here.
        </p>
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-16">Loading…</div>
      ) : mats.length === 0 ? (
        <Card className="bg-white border-zinc-200 p-12 text-center">
          <svg className="w-10 h-10 text-zinc-200 mx-auto mb-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
          <p className="text-zinc-500 text-sm">No favourites yet.</p>
          <p className="text-zinc-400 text-xs mt-1">Star a material on the Materials screen to add it here.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">PCODE</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Description</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Notes</th>
                <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mats.map((m, i) => (
                <tr
                  key={m.id}
                  data-testid={`row-favourite-${m.id}`}
                  className={`border-t border-zinc-200 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                >
                  <td className="px-4 py-2.5 font-mono text-blue-600 text-xs font-bold">{m.pcode}</td>
                  <td className="px-4 py-2.5 text-zinc-800">{m.displayName}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{m.notes ?? ""}</td>
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
                        onClick={() => toggleFavouriteMutation.mutate({ id: m.id })}
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
                <p className="font-mono text-blue-600 text-xs font-bold">{addState.pcode}</p>
                <p className="text-zinc-800 text-sm mt-0.5">{addState.displayName}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Worklist</Label>
                {draftWorklists.length === 0 ? (
                  <p className="text-zinc-500 text-sm italic">No draft worklists. Create one first.</p>
                ) : (
                  <Select
                    value={addState.worklistId}
                    onValueChange={(v) => setAddState((s) => s ? { ...s, worklistId: v } : s)}
                  >
                    <SelectTrigger className="bg-white border-zinc-300 text-zinc-950">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-zinc-200">
                      {draftWorklists.map((wl) => (
                        <SelectItem key={wl.id} value={wl.id.toString()}>
                          <span className="font-mono text-xs mr-2">{wl.worklistNumber}</span>
                          {wl.projectId && <span className="text-zinc-500">— {wl.projectId}</span>}
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
                  onChange={(e) => setAddState((s) => s ? { ...s, quantity: parseInt(e.target.value) || 1 } : s)}
                  className="bg-white border-zinc-300 text-zinc-950 max-w-24"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Notes (optional)</Label>
                <Input
                  value={addState.notes}
                  onChange={(e) => setAddState((s) => s ? { ...s, notes: e.target.value } : s)}
                  placeholder="Any notes…"
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddState(null)} className="text-zinc-400">Cancel</Button>
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
