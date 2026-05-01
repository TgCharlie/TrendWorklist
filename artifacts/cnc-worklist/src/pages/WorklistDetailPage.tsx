import { useState } from "react";
import { downloadCsv } from "@/lib/electron-bridge";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWorklist,
  useListMaterials,
  useAddWorklistItem,
  useDeleteWorklistItem,
  useUpdateWorklist,
  useListStockbook,
  getGetWorklistQueryKey,
  getListWorklistsQueryKey,
  getListMaterialsQueryKey,
  getListStockbookQueryKey,
} from "@workspace/api-client-react";
import type { WorklistStatus, StockbookItem } from "@workspace/api-client-react";
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

const STATUS_OPTIONS: WorklistStatus[] = ["draft", "active", "complete"];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  active: "bg-blue-50 text-blue-700 border border-blue-200",
  complete: "bg-green-50 text-green-700 border border-green-200",
};

const EMPTY_ITEM = {
  pcode: "",
  displayName: "",
  quantity: 1,
  length: "" as string,
  width: "" as string,
  notes: "" as string,
  materialId: null as number | null,
};

export default function WorklistDetailPage() {
  const { id } = useParams();
  const numId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });
  const [stockSearch, setStockSearch] = useState<string | undefined>(undefined);

  const { data: worklist, isLoading } = useGetWorklist(numId, {
    query: { queryKey: getGetWorklistQueryKey(numId), enabled: !!numId },
  });

  const { data: materials = [] } = useListMaterials(undefined, {
    query: { queryKey: getListMaterialsQueryKey(), staleTime: 60_000 },
  });

  const stockParams = stockSearch ? { search: stockSearch } : undefined;
  const { data: stockData } = useListStockbook(stockParams, {
    query: {
      queryKey: getListStockbookQueryKey(stockParams),
      enabled: !!stockSearch,
      staleTime: 60_000,
    },
  });
  const stockItem: StockbookItem | undefined = stockSearch
    ? stockData?.items.find((s) => s.pcode.toLowerCase() === stockSearch.toLowerCase())
    : undefined;

  const addItemMutation = useAddWorklistItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWorklistQueryKey(numId) });
        setShowAddItem(false);
        setItemForm({ ...EMPTY_ITEM });
        setStockSearch(undefined);
        toast({ title: "Item added" });
      },
      onError: (err) => {
        toast({
          title: "Failed to add item",
          description: (err as Error).message,
          variant: "destructive",
        });
      },
    },
  });

  const deleteItemMutation = useDeleteWorklistItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWorklistQueryKey(numId) });
        toast({ title: "Item removed" });
      },
    },
  });

  const updateStatusMutation = useUpdateWorklist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWorklistQueryKey(numId) });
        queryClient.invalidateQueries({ queryKey: getListWorklistsQueryKey() });
        toast({ title: "Status updated" });
      },
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
      }));
      setStockSearch(mat.pcode);
    }
  }

  function handlePcodeBlur() {
    if (itemForm.pcode.trim()) setStockSearch(itemForm.pcode.trim());
  }

  async function handleDownloadCsv() {
    if (!worklist) return;
    try {
      await downloadCsv(
        `/api/worklists/${worklist.id}/csv`,
        `${worklist.worklistNumber}.csv`,
      );
    } catch (err) {
      toast({
        title: "Download failed",
        description:
          err instanceof Error ? err.message : "Could not download CSV",
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return <div className="text-zinc-400 text-center py-16">Loading…</div>;
  }
  if (!worklist) {
    return <div className="text-zinc-400 text-center py-16">Worklist not found</div>;
  }

  const createdDate = new Date(worklist.createdAt).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const cutlistRefs: string[] = worklist.cutlistRefs ?? [];
  const items = worklist.items ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Link href="/worklists" className="text-zinc-500 hover:text-zinc-950 mt-1 flex-shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-zinc-950 font-mono">{worklist.worklistNumber}</h1>
            <Badge className="font-mono text-sm px-2.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-100">
              {worklist.folderRef}
            </Badge>
            <Badge variant="outline" className="border-zinc-300 text-zinc-700">
              Rover {worklist.machineType}
            </Badge>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                STATUS_COLORS[worklist.status] ?? STATUS_COLORS.draft
              }`}
            >
              {worklist.status}
            </span>
          </div>

          {/* Project details */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-zinc-500">
            {worklist.projectNumber && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <span className="text-zinc-400">Project</span>
                <span className="text-zinc-800 font-semibold font-mono">{worklist.projectNumber}</span>
              </span>
            )}
            {worklist.projectId && !worklist.projectNumber && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <span className="text-zinc-700 font-mono">{worklist.projectId}</span>
              </span>
            )}
            {worklist.projectAddress && (
              <span className="flex items-center gap-1 truncate max-w-xs">
                <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="truncate">{worklist.projectAddress}</span>
              </span>
            )}
            <span className="flex items-center gap-1 text-zinc-400 text-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {createdDate}
            </span>
            <span className="text-zinc-400 text-xs">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          {/* Cutlist pills */}
          {cutlistRefs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-zinc-400 text-xs">Cutlists:</span>
              {cutlistRefs.map((ref) => (
                <span
                  key={ref}
                  className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono text-xs"
                >
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Select
            value={worklist.status}
            onValueChange={(v) =>
              updateStatusMutation.mutate({ id: numId, data: { status: v as WorklistStatus } })
            }
          >
            <SelectTrigger className="bg-white border-zinc-300 text-zinc-950 h-9 text-sm w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-zinc-200">
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {worklist.status === "complete" && (
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-300 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100"
              onClick={handleDownloadCsv}
              title="Download CSV"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              CSV
            </Button>
          )}
        </div>
      </div>

      {/* Items section */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-zinc-950 font-semibold">
          Items <span className="text-zinc-500 font-normal text-sm">({items.length})</span>
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

      {items.length === 0 ? (
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
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Notes</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
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
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{item.notes}</td>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete ${item.pcode ?? "item"}?`)) {
                          deleteItemMutation.mutate({ id: numId, itemId: item.id });
                        }
                      }}
                      className="text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog
        open={showAddItem}
        onOpenChange={(open) => {
          setShowAddItem(open);
          if (!open) {
            setItemForm({ ...EMPTY_ITEM });
            setStockSearch(undefined);
          }
        }}
      >
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
                    <SelectValue placeholder="Choose a material…" />
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
                  onBlur={handlePcodeBlur}
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

            {/* Live stock display */}
            {stockSearch && (
              <div className="rounded-md bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs flex items-center gap-3">
                <span className="text-zinc-500">Stock on hand:</span>
                {stockItem ? (
                  <span
                    className={`font-semibold ${
                      stockItem.qtyOnHand <= 0
                        ? "text-red-600"
                        : stockItem.qtyOnHand < 5
                        ? "text-amber-600"
                        : "text-green-700"
                    }`}
                  >
                    {stockItem.qtyOnHand} {stockItem.unit ?? ""}
                  </span>
                ) : (
                  <span className="text-zinc-400 italic">Not found in stockbook</span>
                )}
              </div>
            )}

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
              {(["length", "width"] as const).map((dim) => (
                <div key={dim} className="space-y-1.5">
                  <Label className="text-zinc-700">
                    {dim === "length" ? "Length" : "Width"} (mm)
                  </Label>
                  <Input
                    value={itemForm[dim]}
                    onChange={(e) => setItemForm((f) => ({ ...f, [dim]: e.target.value }))}
                    placeholder={dim === "length" ? "2400" : "1200"}
                    className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                  />
                </div>
              ))}
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
            <Button
              variant="ghost"
              onClick={() => {
                setShowAddItem(false);
                setItemForm({ ...EMPTY_ITEM });
                setStockSearch(undefined);
              }}
              className="text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() =>
                addItemMutation.mutate({
                  id: numId,
                  data: {
                    materialId: itemForm.materialId ?? undefined,
                    pcode: itemForm.pcode,
                    displayName: itemForm.displayName,
                    quantity: itemForm.quantity,
                    length: itemForm.length ? Number(itemForm.length) : undefined,
                    width: itemForm.width ? Number(itemForm.width) : undefined,
                    notes: itemForm.notes || undefined,
                  },
                })
              }
              disabled={addItemMutation.isPending || !itemForm.pcode}
            >
              {addItemMutation.isPending ? "Adding…" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
