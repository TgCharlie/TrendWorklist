import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface WorklistItem {
  id: number;
  worklistId: number;
  materialId: number | null;
  pcode: string | null;
  displayName: string | null;
  quantity: number;
  length: string | null;
  width: string | null;
  thickness: string | null;
  notes: string | null;
}

interface Material {
  id: number;
  pcode: string;
  displayName: string;
  length: number | null;
  width: number | null;
  thickness: number | null;
}

interface Worklist {
  id: number;
  worklistNumber: string;
  projectId: string | null;
  projectAddress: string | null;
  machineType: "B" | "C";
  folderNumber: number;
  status: "draft" | "submitted" | "completed";
  createdAt: string;
  items: WorklistItem[];
}

const EMPTY_ITEM = {
  pcode: "",
  displayName: "",
  quantity: 1,
  length: "",
  width: "",
  thickness: "",
  notes: "",
  materialId: null as number | null,
};

export default function WorklistDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });

  const { data: worklist, isLoading } = useQuery<Worklist>({
    queryKey: ["worklist", id],
    queryFn: () => apiFetch(`/worklists/${id}`),
    enabled: !!id,
  });

  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ["materials"],
    queryFn: () => apiFetch("/materials"),
  });

  const addItemMutation = useMutation({
    mutationFn: (data: typeof itemForm) =>
      apiFetch<WorklistItem>(`/worklists/${id}/items`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worklist", id] });
      setShowAddItem(false);
      setItemForm({ ...EMPTY_ITEM });
      toast({ title: "Item added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add item", description: err.message, variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) =>
      apiFetch(`/worklists/${id}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worklist", id] });
      toast({ title: "Item removed" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`/worklists/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worklist", id] });
      queryClient.invalidateQueries({ queryKey: ["worklists"] });
      toast({ title: "Status updated" });
    },
  });

  function handleMaterialSelect(materialId: string) {
    const mat = materials.find((m) => String(m.id) === materialId);
    if (mat) {
      setItemForm((f) => ({
        ...f,
        materialId: mat.id,
        pcode: mat.pcode,
        displayName: mat.displayName,
        length: mat.length?.toString() ?? "",
        width: mat.width?.toString() ?? "",
        thickness: mat.thickness?.toString() ?? "",
      }));
    }
  }

  function handleDownloadCsv() {
    if (!worklist) return;
    const a = document.createElement("a");
    a.href = `/api/worklists/${worklist.id}/csv`;
    a.download = `${worklist.worklistNumber}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (isLoading) {
    return <div className="text-zinc-400 text-center py-16">Loading...</div>;
  }

  if (!worklist) {
    return <div className="text-zinc-400 text-center py-16">Worklist not found</div>;
  }

  const folderRef = `${worklist.machineType}${String(worklist.folderNumber).padStart(4, "0")}`;

  const STATUS_OPTIONS = ["draft", "submitted", "completed"];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <Link href="/" className="text-zinc-500 hover:text-zinc-950 mt-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-zinc-950 font-mono">{worklist.worklistNumber}</h1>
            <span className="font-mono text-blue-600 text-lg">{folderRef}</span>
            <Badge variant="outline" className="border-zinc-300 text-zinc-700">
              Rover {worklist.machineType}
            </Badge>
          </div>
          {worklist.projectAddress && (
            <p className="text-zinc-500 text-sm mt-1">{worklist.projectAddress}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Select
            value={worklist.status}
            onValueChange={(v) => updateStatusMutation.mutate(v)}
          >
            <SelectTrigger className="bg-white border-zinc-300 text-zinc-950 h-9 text-sm w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-zinc-200">
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-300 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100"
            onClick={handleDownloadCsv}
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-zinc-950 font-semibold">
          Items <span className="text-zinc-500 font-normal text-sm">({worklist.items.length})</span>
        </h2>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
          onClick={() => setShowAddItem(true)}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Item
        </Button>
      </div>

      {worklist.items.length === 0 ? (
        <Card className="bg-white border-zinc-200 p-10 text-center">
          <p className="text-zinc-500 text-sm">No items yet. Add materials to this worklist.</p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">PCODE</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Description</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Qty</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">L (mm)</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">W (mm)</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">T (mm)</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Notes</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {worklist.items.map((item, i) => (
                <tr
                  key={item.id}
                  className={`border-t border-zinc-200 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                >
                  <td className="px-4 py-2.5 font-mono text-blue-600 text-xs">{item.pcode}</td>
                  <td className="px-4 py-2.5 text-zinc-800">{item.displayName}</td>
                  <td className="px-4 py-2.5 text-zinc-800 text-right">{item.quantity}</td>
                  <td className="px-4 py-2.5 text-zinc-600 text-right font-mono text-xs">
                    {item.length ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600 text-right font-mono text-xs">
                    {item.width ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600 text-right font-mono text-xs">
                    {item.thickness ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{item.notes}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => deleteItemMutation.mutate(item.id)}
                      className="text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-950">
          <DialogHeader>
            <DialogTitle>Add Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {materials.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Select from materials library</Label>
                <Select onValueChange={handleMaterialSelect}>
                  <SelectTrigger className="bg-white border-zinc-300 text-zinc-950">
                    <SelectValue placeholder="Choose a material..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200">
                    {materials.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        <span className="font-mono text-blue-600 text-xs mr-2">{m.pcode}</span>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-700">PCODE</Label>
                <Input
                  value={itemForm.pcode}
                  onChange={(e) => setItemForm((f) => ({ ...f, pcode: e.target.value }))}
                  placeholder="e.g. MDF18"
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                  className="bg-white border-zinc-300 text-zinc-950"
                />
              </div>
            </div>
            <div className="space-y-1.5">
                <Label className="text-zinc-700">Description</Label>
              <Input
                value={itemForm.displayName}
                onChange={(e) => setItemForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Material description"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Length (mm)</Label>
                <Input
                  value={itemForm.length}
                  onChange={(e) => setItemForm((f) => ({ ...f, length: e.target.value }))}
                  placeholder="2400"
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Width (mm)</Label>
                <Input
                  value={itemForm.width}
                  onChange={(e) => setItemForm((f) => ({ ...f, width: e.target.value }))}
                  placeholder="1200"
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-700">Thickness (mm)</Label>
              <Input
                value={itemForm.thickness}
                onChange={(e) => setItemForm((f) => ({ ...f, thickness: e.target.value }))}
                placeholder="18"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
              />
            </div>
            <div className="space-y-1.5">
                <Label className="text-zinc-700">Notes</Label>
              <Input
                value={itemForm.notes}
                onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddItem(false)} className="text-zinc-400">
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => addItemMutation.mutate(itemForm)}
              disabled={addItemMutation.isPending}
            >
              {addItemMutation.isPending ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
