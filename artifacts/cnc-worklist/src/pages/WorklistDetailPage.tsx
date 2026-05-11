import { useState } from "react";
import { downloadCsv } from "@/lib/electron-bridge";
import { printWorklistPdf } from "@/lib/generateWorklistPdf";
import { useParams, Link, useLocation } from "wouter";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import {
  useGetWorklist,
  useGetCutlist,
  getCutlist,
  useListMaterials,
  useAddWorklistItem,
  useUpdateWorklistItem,
  useDeleteWorklistItem,
  useDeleteWorklist,
  useUpdateWorklist,
  useListStockbook,
  useGetStockLevel,
  getGetWorklistQueryKey,
  getGetCutlistQueryKey,
  getListWorklistsQueryKey,
  getListMaterialsQueryKey,
  getListStockbookQueryKey,
  getGetStockLevelQueryKey,
} from "@workspace/api-client-react";
import type { WorklistStatus, StockbookItem, WorklistItem } from "@workspace/api-client-react";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";

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

interface WorklistFolder {
  id: number;
  worklistId: number;
  folderReference: string;
  createdAt: string;
  createdBy: number | null;
}

export default function WorklistDetailPage() {
  const { id } = useParams();
  const numId = Number(id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ ...EMPTY_ITEM });
  const [stockSearch, setStockSearch] = useState<string | undefined>(undefined);
  const [deletePending, setDeletePending] = useState<{ id: number; pcode: string | null } | null>(null);
  const [deleteWorklistPending, setDeleteWorklistPending] = useState(false);
  const [showEditCutlists, setShowEditCutlists] = useState(false);
  const [editCutlists, setEditCutlists] = useState<string[]>([]);
  const [cutlistEditInput, setCutlistEditInput] = useState("");
  const [cutlistEditError, setCutlistEditError] = useState<string | null>(null);
  const [isEditLooking, setIsEditLooking] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [selectedMaterialItem, setSelectedMaterialItem] = useState<WorklistItem | null>(null);
  const [, navigate] = useLocation();

  const { data: worklist, isLoading } = useGetWorklist(numId, {
    query: { queryKey: getGetWorklistQueryKey(numId), enabled: !!numId },
  });

  const firstCutlistId = worklist?.cutlistRefs?.[0] ?? "";
  const { data: firstCutlist } = useGetCutlist(firstCutlistId, {
    query: {
      queryKey: getGetCutlistQueryKey(firstCutlistId),
      enabled: !!firstCutlistId,
      staleTime: 300_000,
    },
  });
  const cutlistItem = firstCutlist?.item as string | undefined;

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

  const updateItemNoteMutation = useUpdateWorklistItem({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWorklistQueryKey(numId) });
        setEditingNoteId(null);
      },
      onError: () => {
        toast({ title: "Failed to save note", variant: "destructive" });
      },
    },
  });

  function startEditNote(itemId: number, current: string | null | undefined) {
    setEditingNoteId(itemId);
    setEditingNoteValue(current ?? "");
  }

  function commitNote(itemId: number) {
    updateItemNoteMutation.mutate({ id: numId, itemId, data: { notes: editingNoteValue || null } });
  }

  const deleteWorklistMutation = useDeleteWorklist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorklistsQueryKey() });
        toast({ title: "Worklist deleted" });
        navigate("/worklists");
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

  const updateCutlistsMutation = useUpdateWorklist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetWorklistQueryKey(numId) });
        queryClient.invalidateQueries({ queryKey: getListWorklistsQueryKey() });
        setShowEditCutlists(false);
        toast({ title: "Cutlists updated" });
      },
      onError: (err) => {
        toast({
          title: "Failed to update cutlists",
          description: (err as Error).message,
          variant: "destructive",
        });
      },
    },
  });

  const foldersQueryKey = ["worklist-folders", numId];
  const { data: folders = [] } = useQuery<WorklistFolder[]>({
    queryKey: foldersQueryKey,
    queryFn: () => apiFetch<WorklistFolder[]>(`/worklists/${numId}/folders`),
    enabled: !!numId,
  });

  const addFolderMutation = useMutation({
    mutationFn: () =>
      apiFetch<WorklistFolder>(`/worklists/${numId}/folders`, { method: "POST" }),
    onSuccess: (newFolder) => {
      queryClient.setQueryData<WorklistFolder[]>(foldersQueryKey, (prev = []) => [
        ...prev,
        newFolder,
      ]);
      toast({ title: `Folder ${newFolder.folderReference} created` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create folder", description: err.message, variant: "destructive" });
    },
  });

  function openEditCutlists() {
    setEditCutlists([...(worklist?.cutlistRefs ?? [])]);
    setCutlistEditInput("");
    setCutlistEditError(null);
    setShowEditCutlists(true);
  }

  async function addEditCutlist() {
    const val = cutlistEditInput.trim();
    if (!val) return;
    if (editCutlists.includes(val)) {
      setCutlistEditError("That cutlist number is already in this worklist");
      return;
    }
    setIsEditLooking(true);
    setCutlistEditError(null);
    try {
      await getCutlist(val);
      setEditCutlists((prev) => [...prev, val]);
      setCutlistEditInput("");
    } catch {
      setCutlistEditError(`Cutlist "${val}" not found in FileMaker`);
    } finally {
      setIsEditLooking(false);
    }
  }

  function handleMaterialSelect(materialId: string) {
    const mat = materials.find((m) => String(m.id) === materialId);
    if (mat) {
      setItemForm((f) => ({
        ...f,
        materialId: mat.id,
        pcode: mat.pcode,
        displayName: mat.displayName,
        length: mat.length != null ? String(mat.length) : f.length,
        width: mat.width != null ? String(mat.width) : f.width,
        thickness: mat.thickness != null ? String(mat.thickness) : f.thickness,
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
          {/* Cutlist item description — shown prominently above the worklist number */}
          {cutlistItem && (
            <p className="text-base font-semibold text-zinc-800 mb-1 leading-snug">{cutlistItem}</p>
          )}

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
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-zinc-400 text-xs">Cutlists:</span>
            {cutlistRefs.map((ref, i) => (
              <span key={ref} className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono text-xs">
                  {ref}
                </span>
                {i === 0 && cutlistItem && (
                  <span className="text-zinc-700 text-xs font-medium">{cutlistItem}</span>
                )}
              </span>
            ))}
            {cutlistRefs.length === 0 && (
              <span className="text-zinc-400 text-xs italic">None</span>
            )}
            <button
              onClick={openEditCutlists}
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-blue-600 text-xs ml-1"
              title="Edit cutlists"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 16H9v-3z" />
              </svg>
              Edit
            </button>
          </div>
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
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-300 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100"
            onClick={() =>
              printWorklistPdf({
                worklistNumber: worklist.worklistNumber,
                folderNumber: worklist.folderNumber,
                machineType: worklist.machineType,
                status: worklist.status,
                projectId: worklist.projectId,
                projectAddress: worklist.projectAddress,
                createdAt: worklist.createdAt,
                cutlistRefs,
                cutlistItem,
                items,
              })
            }
            title="Print / Save PDF"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print PDF
          </Button>
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
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:text-red-600"
            title="Delete worklist"
            onClick={() => setDeleteWorklistPending(true)}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Items section */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-zinc-950 font-semibold">
          Items <span className="text-zinc-500 font-normal text-sm">({items.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-zinc-300 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100"
            onClick={() => addFolderMutation.mutate()}
            disabled={addFolderMutation.isPending}
            title="Create a new sequential folder on the server for this worklist"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            {addFolderMutation.isPending ? "Creating…" : "Add Folder"}
          </Button>
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
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium w-20">PCODE</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium w-64">Description</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">Qty</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">L (mm)</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">W (mm)</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">T (mm)</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Notes</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                return (
                  <tr
                    key={item.id}
                    className={`border-t border-zinc-200 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                  >
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedMaterialItem(item)}
                        className="font-mono text-blue-600 text-xs hover:underline hover:text-blue-800"
                      >
                        {item.pcode}
                      </button>
                    </td>
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
                    <td className="px-2 py-1.5">
                      {editingNoteId === item.id ? (
                        <input
                          autoFocus
                          value={editingNoteValue}
                          onChange={(e) => setEditingNoteValue(e.target.value)}
                          onBlur={() => commitNote(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.currentTarget.blur(); }
                            if (e.key === "Escape") { setEditingNoteId(null); }
                          }}
                          className="w-full text-xs text-zinc-800 bg-white border border-blue-400 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-zinc-400"
                          placeholder="Add a note…"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditNote(item.id, item.notes)}
                          className="w-full text-left text-xs px-2 py-1 rounded hover:bg-zinc-100 transition-colors min-h-[28px]"
                          title="Click to add/edit note"
                        >
                          {item.notes ? (
                            <span className="text-zinc-600">{item.notes}</span>
                          ) : (
                            <span className="text-zinc-300 italic">Add note…</span>
                          )}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDeletePending({ id: item.id, pcode: item.pcode ?? null })}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Folders section */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-zinc-950 font-semibold">
            Folders <span className="text-zinc-500 font-normal text-sm">({folders.length})</span>
          </h2>
        </div>
        {folders.length === 0 ? (
          <Card className="bg-white border-zinc-200 p-6 text-center">
            <p className="text-zinc-500 text-sm">
              No folders yet. Click "Add Folder" to create the next sequential folder on the server.
            </p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50">
                  <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Folder Reference</th>
                  <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {folders.map((folder, i) => (
                  <tr
                    key={folder.id}
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/worklists/${numId}/folders/${folder.id}/open`, {
                          method: "POST",
                          credentials: "include",
                        });
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          toast({ title: "Could not open folder", description: data.error ?? "Unknown error", variant: "destructive" });
                        }
                      } catch {
                        toast({ title: "Could not open folder", description: "Network error", variant: "destructive" });
                      }
                    }}
                    className={`border-t border-zinc-200 cursor-pointer transition-colors ${i % 2 === 0 ? "bg-white hover:bg-amber-50" : "bg-zinc-50 hover:bg-amber-50"}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                        <span className="font-mono font-semibold text-zinc-900">{folder.folderReference}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">
                      {new Date(folder.createdAt).toLocaleString("en-AU", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deletePending}
        title="Remove item"
        message={deletePending ? `Are you sure you want to remove ${deletePending.pcode ?? "this item"} from the worklist?` : ""}
        confirmLabel="Remove"
        onConfirm={() => { if (deletePending) deleteItemMutation.mutate({ id: numId, itemId: deletePending.id }); }}
        onCancel={() => setDeletePending(null)}
      />

      <ConfirmDialog
        open={deleteWorklistPending}
        title="Delete Worklist"
        message={worklist ? `Permanently delete ${worklist.worklistNumber}? This cannot be undone.` : ""}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => { deleteWorklistMutation.mutate({ id: numId }); setDeleteWorklistPending(false); }}
        onCancel={() => setDeleteWorklistPending(false)}
      />

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
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setItemForm((f) => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))}
                    className="w-9 h-9 flex items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 text-lg font-medium select-none"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-mono text-zinc-950 text-sm font-semibold">
                    {itemForm.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setItemForm((f) => ({ ...f, quantity: f.quantity + 1 }))}
                    className="w-9 h-9 flex items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 text-lg font-medium select-none"
                  >
                    +
                  </button>
                </div>
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
            <div className="grid grid-cols-3 gap-3">
              {(["length", "width", "thickness"] as const).map((dim) => (
                <div key={dim} className="space-y-1.5">
                  <Label className="text-zinc-700">
                    {dim === "length" ? "Length" : dim === "width" ? "Width" : "Thickness"} (mm)
                  </Label>
                  <Input
                    value={itemForm[dim]}
                    onChange={(e) => setItemForm((f) => ({ ...f, [dim]: e.target.value }))}
                    placeholder={dim === "length" ? "2400" : dim === "width" ? "1200" : "18"}
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
                    thickness: itemForm.thickness ? Number(itemForm.thickness) : undefined,
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

      {/* Edit Cutlists Dialog */}
      <Dialog open={showEditCutlists} onOpenChange={setShowEditCutlists}>
        <DialogContent className="bg-white border-zinc-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-950">Edit Cutlists</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Current cutlist list */}
            {editCutlists.length > 0 ? (
              <div className="space-y-1.5">
                {editCutlists.map((ref) => (
                  <div
                    key={ref}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200"
                  >
                    <span className="font-mono text-sm text-zinc-800">{ref}</span>
                    <button
                      onClick={() => setEditCutlists((prev) => prev.filter((r) => r !== ref))}
                      className="text-zinc-400 hover:text-red-600 transition-colors"
                      title="Remove"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-400 text-sm text-center py-2">No cutlists added yet</p>
            )}

            {/* Add new cutlist input */}
            <div className="space-y-1.5">
              <Label className="text-zinc-700 text-sm">Add Cutlist Number</Label>
              <div className="flex gap-2">
                <Input
                  value={cutlistEditInput}
                  onChange={(e) => {
                    setCutlistEditInput(e.target.value);
                    setCutlistEditError(null);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") addEditCutlist(); }}
                  placeholder="e.g. 298282"
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
                <Button
                  onClick={addEditCutlist}
                  disabled={!cutlistEditInput.trim() || isEditLooking}
                  className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                >
                  {isEditLooking ? "…" : "Add"}
                </Button>
              </div>
              {cutlistEditError && (
                <p className="text-red-600 text-xs">{cutlistEditError}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowEditCutlists(false)}
              className="text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={updateCutlistsMutation.isPending}
              onClick={() =>
                updateCutlistsMutation.mutate({ id: numId, data: { cutlistRefs: editCutlists } })
              }
            >
              {updateCutlistsMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Material Info Dialog */}
      {selectedMaterialItem && (
        <MaterialInfoDialog
          item={selectedMaterialItem}
          onClose={() => setSelectedMaterialItem(null)}
        />
      )}
    </div>
  );
}

function MaterialInfoDialog({
  item,
  onClose,
}: {
  item: WorklistItem;
  onClose: () => void;
}) {
  const pcode = item.pcode ?? "";
  const { data: stock, isLoading } = useGetStockLevel(pcode, {
    query: {
      queryKey: getGetStockLevelQueryKey(pcode),
      enabled: !!pcode,
      staleTime: 60_000,
    },
  });

  const qtyOnHand = stock?.qtyOnHand ?? null;
  const stockColor =
    qtyOnHand === null
      ? "text-zinc-400"
      : qtyOnHand <= 0
      ? "text-red-600"
      : qtyOnHand < 5
      ? "text-amber-600"
      : "text-green-700";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-white border-zinc-200 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-zinc-950 font-mono text-base">{pcode}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Description */}
          <div>
            <p className="text-zinc-800 text-sm font-medium">{item.displayName}</p>
          </div>

          {/* Dimensions */}
          {(item.length || item.width || item.thickness) && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Length", value: item.length, unit: "mm" },
                { label: "Width", value: item.width, unit: "mm" },
                { label: "Thickness", value: item.thickness, unit: "mm" },
              ].map(({ label, value, unit }) => (
                <div key={label} className="bg-zinc-50 rounded-lg px-3 py-2 text-center">
                  <p className="text-zinc-400 text-xs mb-0.5">{label}</p>
                  <p className="text-zinc-900 text-sm font-mono font-semibold">
                    {value ?? "—"}
                    {value && <span className="text-zinc-400 text-xs font-normal ml-0.5">{unit}</span>}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Stock */}
          <div className="border border-zinc-200 rounded-lg divide-y divide-zinc-100">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-zinc-500 text-sm">Stock on hand</span>
              {isLoading ? (
                <span className="text-zinc-400 text-sm italic">Loading…</span>
              ) : qtyOnHand !== null ? (
                <span className={`font-semibold text-sm ${stockColor}`}>
                  {qtyOnHand} {stock?.unit ?? ""}
                </span>
              ) : (
                <span className="text-zinc-400 text-sm italic">Not in stockbook</span>
              )}
            </div>
            {stock?.location && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-zinc-500 text-sm">Location</span>
                <span className="text-zinc-800 text-sm font-mono">{stock.location}</span>
              </div>
            )}
            {stock?.otype && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-zinc-500 text-sm">Type</span>
                <span className="text-zinc-800 text-sm">{stock.otype}</span>
              </div>
            )}
            {stock?.cost != null && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-zinc-500 text-sm">Cost</span>
                <span className="text-zinc-800 text-sm font-mono">
                  ${Number(stock.cost).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-zinc-500">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
