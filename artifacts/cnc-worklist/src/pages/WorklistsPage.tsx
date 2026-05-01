import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWorklists,
  useDeleteWorklist,
  useCreateWorklist,
  useAddWorklistItem,
  useListProjects,
  useListCutlists,
  useListMaterials,
  useListStockbook,
  getListWorklistsQueryKey,
  getListProjectsQueryKey,
  getListCutlistsQueryKey,
  getListMaterialsQueryKey,
  getListStockbookQueryKey,
} from "@workspace/api-client-react";
import type {
  Project,
  Cutlist,
  WorklistSummary,
  Material,
  StockbookItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  active: "bg-blue-50 text-blue-700 border border-blue-200",
  complete: "bg-green-50 text-green-700 border border-green-200",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "project" | "cutlists" | "machine" | "materials";

interface DraftMaterialRow {
  rowId: string;
  materialId: number | null;
  pcode: string;
  displayName: string;
  quantity: number;
  length: string;
  width: string;
  notes: string;
}

interface CreateState {
  step: Step;
  projectSearch: string;
  selectedProject: Project | null;
  selectedCutlistIds: Set<string>;
  machineType: "B" | "C";
  materialRows: DraftMaterialRow[];
}

const DEFAULT_STATE: CreateState = {
  step: "project",
  projectSearch: "",
  selectedProject: null,
  selectedCutlistIds: new Set(),
  machineType: "B",
  materialRows: [],
};

const EMPTY_ROW = (): DraftMaterialRow => ({
  rowId: crypto.randomUUID(),
  materialId: null,
  pcode: "",
  displayName: "",
  quantity: 1,
  length: "",
  width: "",
  notes: "",
});

// ─── Step components ──────────────────────────────────────────────────────────

function ProjectStep({
  state,
  setState,
  onNext,
}: {
  state: CreateState;
  setState: (s: CreateState) => void;
  onNext: () => void;
}) {
  const params = state.projectSearch ? { search: state.projectSearch } : undefined;
  const { data: projects, isLoading, isError } = useListProjects(params, {
    query: { queryKey: getListProjectsQueryKey(params), retry: false, staleTime: 10_000 },
  });
  const fmUnavailable = isError && !projects;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-zinc-700">Search FileMaker Projects</Label>
        <Input
          value={state.projectSearch}
          onChange={(e) =>
            setState({ ...state, projectSearch: e.target.value, selectedProject: null })
          }
          placeholder="Project number or address…"
          autoFocus
          className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
        />
      </div>

      {fmUnavailable ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-medium">FileMaker unavailable</p>
          <p className="text-amber-700 text-xs mt-1">Enter project details manually below.</p>
        </div>
      ) : isLoading ? (
        <div className="text-zinc-400 text-sm text-center py-4 animate-pulse">Searching projects…</div>
      ) : (
        <div className="max-h-52 overflow-y-auto border border-zinc-200 rounded-lg divide-y divide-zinc-100">
          {(projects ?? []).length === 0 ? (
            <div className="text-zinc-400 text-sm text-center py-6">
              {state.projectSearch ? "No matching projects." : "Type to search projects."}
            </div>
          ) : (
            (projects ?? []).map((p) => (
              <button
                key={p.projectId}
                onClick={() => setState({ ...state, selectedProject: p })}
                className={`w-full text-left px-4 py-2.5 hover:bg-zinc-50 transition-colors ${
                  state.selectedProject?.projectId === p.projectId
                    ? "bg-blue-50 border-l-2 border-blue-500"
                    : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-blue-600 font-bold">{p.projectNumber}</span>
                  {p.status && (
                    <span className="text-xs text-zinc-500 capitalize">{p.status}</span>
                  )}
                </div>
                <p className="text-zinc-800 text-sm truncate">{p.address}</p>
              </button>
            ))
          )}
        </div>
      )}

      {fmUnavailable && (
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-zinc-700">Project Number</Label>
            <Input
              value={state.selectedProject?.projectNumber ?? ""}
              onChange={(e) =>
                setState({
                  ...state,
                  selectedProject: {
                    projectId: state.selectedProject?.projectId ?? "",
                    projectNumber: e.target.value,
                    address: state.selectedProject?.address ?? "",
                  },
                })
              }
              placeholder="e.g. 1234"
              className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-700">Project Address</Label>
            <Input
              value={state.selectedProject?.address ?? ""}
              onChange={(e) =>
                setState({
                  ...state,
                  selectedProject: {
                    projectId: state.selectedProject?.projectId ?? "",
                    projectNumber: state.selectedProject?.projectNumber ?? "",
                    address: e.target.value,
                  },
                })
              }
              placeholder="e.g. 123 Smith Street, Suburb"
              className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
            />
          </div>
        </div>
      )}

      {state.selectedProject && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-blue-800 truncate">
            <span className="font-mono font-bold mr-1">{state.selectedProject.projectNumber}</span>
            {state.selectedProject.address}
          </span>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          onClick={onNext}
          disabled={!state.selectedProject}
        >
          Next: Cutlists
          <svg className="w-4 h-4 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  );
}

function CutlistStep({
  state,
  setState,
  onBack,
  onNext,
}: {
  state: CreateState;
  setState: (s: CreateState) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const projectId = state.selectedProject?.projectId ?? "";
  const cutlistParams = projectId ? { projectId } : undefined;
  const { data: cutlists, isLoading, isError } = useListCutlists(cutlistParams, {
    query: { queryKey: getListCutlistsQueryKey(cutlistParams), retry: false, staleTime: 10_000 },
  });

  function toggleCutlist(cutlistId: string) {
    const next = new Set(state.selectedCutlistIds);
    if (next.has(cutlistId)) next.delete(cutlistId);
    else next.add(cutlistId);
    setState({ ...state, selectedCutlistIds: next });
  }

  const allSelected =
    (cutlists ?? []).length > 0 &&
    (cutlists ?? []).every((c) => state.selectedCutlistIds.has(c.cutlistId));

  function toggleAll() {
    if (allSelected) {
      setState({ ...state, selectedCutlistIds: new Set() });
    } else {
      setState({
        ...state,
        selectedCutlistIds: new Set((cutlists ?? []).map((c) => c.cutlistId)),
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-zinc-50 rounded-lg px-3 py-2 text-sm text-zinc-600">
        Project:{" "}
        <span className="font-mono font-bold text-zinc-950">
          {state.selectedProject?.projectNumber}
        </span>{" "}
        <span className="text-zinc-500">{state.selectedProject?.address}</span>
      </div>

      <Label className="text-zinc-700 block">Select Cutlists</Label>

      {isError ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          FileMaker unavailable — no cutlists to select. Continue without selecting cutlists.
        </div>
      ) : isLoading ? (
        <div className="text-zinc-400 text-sm text-center py-6 animate-pulse">Loading cutlists…</div>
      ) : (cutlists ?? []).length === 0 ? (
        <div className="text-zinc-400 text-sm text-center py-6 border border-zinc-200 rounded-lg">
          No cutlists found for this project.
        </div>
      ) : (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 accent-blue-600"
              id="select-all-cutlists"
            />
            <label
              htmlFor="select-all-cutlists"
              className="text-zinc-600 text-xs font-medium cursor-pointer"
            >
              Select all ({(cutlists ?? []).length})
            </label>
            {state.selectedCutlistIds.size > 0 && (
              <span className="ml-auto text-blue-600 text-xs font-medium">
                {state.selectedCutlistIds.size} selected
              </span>
            )}
          </div>
          <div className="max-h-44 overflow-y-auto divide-y divide-zinc-100">
            {(cutlists ?? []).map((c: Cutlist) => (
              <label
                key={c.cutlistId}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={state.selectedCutlistIds.has(c.cutlistId)}
                  onChange={() => toggleCutlist(c.cutlistId)}
                  className="w-4 h-4 accent-blue-600 flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-zinc-900 text-sm font-mono font-medium">{c.cutlistId}</p>
                  <p className="text-zinc-500 text-xs truncate">{c.item}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-1">
        <Button variant="ghost" onClick={onBack} className="text-zinc-500">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={onNext}>
          Next: Machine Type
          <svg className="w-4 h-4 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  );
}

function MachineStep({
  state,
  setState,
  onBack,
  onNext,
}: {
  state: CreateState;
  setState: (s: CreateState) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-50 rounded-lg px-3 py-2 space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">Project:</span>
          <span className="font-mono font-bold text-zinc-950">
            {state.selectedProject?.projectNumber}
          </span>
          <span className="text-zinc-600 truncate">{state.selectedProject?.address}</span>
        </div>
        {state.selectedCutlistIds.size > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-zinc-500 flex-shrink-0">Cutlists:</span>
            <div className="flex flex-wrap gap-1">
              {[...state.selectedCutlistIds].map((id) => (
                <span
                  key={id}
                  className="bg-blue-100 text-blue-800 border border-blue-200 rounded text-xs px-1.5 py-0.5 font-mono"
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-700">CNC Machine</Label>
        <div className="grid grid-cols-2 gap-3">
          {(["B", "C"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setState({ ...state, machineType: m })}
              className={`p-4 rounded-lg border-2 text-center transition-colors ${
                state.machineType === m
                  ? "border-blue-500 bg-blue-50 text-blue-900"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
              }`}
            >
              <div className="text-2xl font-mono font-bold">{m}</div>
              <div className="text-xs mt-0.5">Rover {m}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-between pt-1">
        <Button variant="ghost" onClick={onBack} className="text-zinc-500">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={onNext}>
          Next: Materials
          <svg className="w-4 h-4 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  );
}

function MaterialsStep({
  state,
  setState,
  onBack,
  onSubmit,
  isPending,
}: {
  state: CreateState;
  setState: (s: CreateState) => void;
  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  const [rowForm, setRowForm] = useState<DraftMaterialRow>(EMPTY_ROW());

  const { data: materials = [] } = useListMaterials(undefined, {
    query: { queryKey: getListMaterialsQueryKey(), staleTime: 60_000 },
  });

  const stockParams = rowForm.pcode.trim() ? { search: rowForm.pcode.trim() } : undefined;
  const { data: stockData } = useListStockbook(stockParams, {
    query: {
      queryKey: getListStockbookQueryKey(stockParams),
      enabled: !!rowForm.pcode.trim(),
      staleTime: 60_000,
    },
  });
  const stockItem: StockbookItem | undefined = rowForm.pcode.trim()
    ? stockData?.items.find(
        (s) => s.pcode.toLowerCase() === rowForm.pcode.trim().toLowerCase(),
      )
    : undefined;

  function selectMaterial(mat: Material) {
    setRowForm((f) => ({
      ...f,
      materialId: mat.id,
      pcode: mat.pcode,
      displayName: mat.displayName,
    }));
  }

  function addRow() {
    if (!rowForm.pcode.trim()) return;
    setState({
      ...state,
      materialRows: [...state.materialRows, { ...rowForm }],
    });
    setRowForm(EMPTY_ROW());
  }

  function removeRow(rowId: string) {
    setState({
      ...state,
      materialRows: state.materialRows.filter((r) => r.rowId !== rowId),
    });
  }

  return (
    <div className="space-y-4">
      {/* Context summary */}
      <div className="bg-zinc-50 rounded-lg px-3 py-2 text-xs text-zinc-500 flex flex-wrap gap-3">
        <span>
          Project:{" "}
          <span className="font-mono font-semibold text-zinc-800">
            {state.selectedProject?.projectNumber}
          </span>
        </span>
        <span>
          Machine:{" "}
          <span className="font-mono font-semibold text-zinc-800">
            Rover {state.machineType}
          </span>
        </span>
        {state.selectedCutlistIds.size > 0 && (
          <span>Cutlists: {state.selectedCutlistIds.size} selected</span>
        )}
      </div>

      {/* Add row form */}
      <div className="border border-zinc-200 rounded-lg p-3 space-y-3">
        <p className="text-xs font-medium text-zinc-600 uppercase tracking-wide">Add Material Row</p>

        {/* Material library picker */}
        {materials.length > 0 && (
          <Select
            onValueChange={(id) => {
              const mat = materials.find((m) => String(m.id) === id);
              if (mat) selectMaterial(mat);
            }}
          >
            <SelectTrigger className="bg-white border-zinc-300 text-zinc-950 text-sm">
              <SelectValue placeholder="Pick from materials library…" />
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
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-1 space-y-1">
            <Label className="text-zinc-600 text-xs">PCODE *</Label>
            <Input
              value={rowForm.pcode}
              onChange={(e) => setRowForm((f) => ({ ...f, pcode: e.target.value }))}
              placeholder="MDF18"
              className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 text-sm h-8"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-zinc-600 text-xs">Description</Label>
            <Input
              value={rowForm.displayName}
              onChange={(e) => setRowForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="Material description"
              className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 text-sm h-8"
            />
          </div>
        </div>

        {/* Live stock */}
        {rowForm.pcode.trim() && (
          <div className="flex items-center gap-2 text-xs">
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
              <span className="text-zinc-400 italic">not in stockbook</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-zinc-600 text-xs">Qty</Label>
            <Input
              type="number"
              min={1}
              value={rowForm.quantity}
              onChange={(e) => setRowForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
              className="bg-white border-zinc-300 text-zinc-950 text-sm h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-zinc-600 text-xs">Length (mm)</Label>
            <Input
              value={rowForm.length}
              onChange={(e) => setRowForm((f) => ({ ...f, length: e.target.value }))}
              placeholder="2400"
              className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 text-sm h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-zinc-600 text-xs">Width (mm)</Label>
            <Input
              value={rowForm.width}
              onChange={(e) => setRowForm((f) => ({ ...f, width: e.target.value }))}
              placeholder="1200"
              className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 text-sm h-8"
            />
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={addRow}
          disabled={!rowForm.pcode.trim()}
          className="w-full border-zinc-300 text-zinc-700 hover:bg-zinc-50"
        >
          <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Row
        </Button>
      </div>

      {/* Added rows */}
      {state.materialRows.length > 0 && (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <div className="bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">
            {state.materialRows.length} row{state.materialRows.length !== 1 ? "s" : ""} added
          </div>
          <div className="divide-y divide-zinc-100 max-h-40 overflow-y-auto">
            {state.materialRows.map((row) => (
              <div key={row.rowId} className="flex items-center gap-2 px-3 py-2">
                <span className="font-mono text-blue-600 text-xs w-20 flex-shrink-0 truncate">
                  {row.pcode}
                </span>
                <span className="text-zinc-700 text-xs flex-1 truncate">{row.displayName}</span>
                <span className="text-zinc-500 text-xs flex-shrink-0">×{row.quantity}</span>
                {(row.length || row.width) && (
                  <span className="text-zinc-400 text-xs flex-shrink-0 font-mono">
                    {row.length || "—"} × {row.width || "—"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(row.rowId)}
                  className="text-zinc-300 hover:text-red-500 ml-1 flex-shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-1">
        <Button variant="ghost" onClick={onBack} className="text-zinc-500">
          <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700 min-w-40"
          onClick={onSubmit}
          disabled={isPending}
        >
          {isPending
            ? "Creating…"
            : state.materialRows.length > 0
            ? `Create with ${state.materialRows.length} item${state.materialRows.length !== 1 ? "s" : ""}`
            : "Create Worklist"}
        </Button>
      </div>
    </div>
  );
}

// ─── Step config ──────────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  project: "1. Project",
  cutlists: "2. Cutlists",
  machine: "3. Machine",
  materials: "4. Materials",
};

const STEPS: Step[] = ["project", "cutlists", "machine", "materials"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorklistsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [createState, setCreateState] = useState<CreateState>({ ...DEFAULT_STATE });

  const { data: worklists = [], isLoading } = useListWorklists(undefined, {
    query: { queryKey: getListWorklistsQueryKey() },
  });

  const deleteMutation = useDeleteWorklist({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWorklistsQueryKey() });
        toast({ title: "Worklist deleted" });
      },
    },
  });

  const addItemMutation = useAddWorklistItem({ mutation: {} });

  const createMutation = useCreateWorklist({
    mutation: {
      onSuccess: async (newWorklist) => {
        const rows = createState.materialRows;
        if (rows.length > 0) {
          for (const row of rows) {
            await addItemMutation.mutateAsync({
              id: newWorklist.id,
              data: {
                materialId: row.materialId ?? undefined,
                pcode: row.pcode,
                displayName: row.displayName,
                quantity: row.quantity,
                length: row.length ? Number(row.length) : undefined,
                width: row.width ? Number(row.width) : undefined,
                notes: row.notes || undefined,
              },
            });
          }
        }
        queryClient.invalidateQueries({ queryKey: getListWorklistsQueryKey() });
        setShowCreate(false);
        setCreateState({ ...DEFAULT_STATE });
        toast({ title: `Created ${newWorklist.worklistNumber}` });
        navigate(`/worklists/${newWorklist.id}`);
      },
      onError: (err) => {
        toast({
          title: "Failed to create worklist",
          description: (err as Error).message,
          variant: "destructive",
        });
      },
    },
  });

  function handleOpenCreate() {
    setCreateState({ ...DEFAULT_STATE });
    setShowCreate(true);
  }

  function handleSubmit() {
    const { selectedProject, selectedCutlistIds, machineType } = createState;
    if (!selectedProject) return;
    createMutation.mutate({
      data: {
        projectId: selectedProject.projectId,
        projectNumber: selectedProject.projectNumber,
        projectAddress: selectedProject.address,
        cutlistRefs: [...selectedCutlistIds],
        machineType,
      },
    });
  }

  function handleDownloadCsv(wl: { id: number; worklistNumber: string }) {
    const a = document.createElement("a");
    a.href = `/api/worklists/${wl.id}/csv`;
    a.download = `${wl.worklistNumber}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const currentStepIndex = STEPS.indexOf(createState.step);
  const isPending = createMutation.isPending || addItemMutation.isPending;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Worklists</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {(worklists as unknown[]).length} total
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Worklist
        </Button>
      </div>

      {isLoading ? (
        <div className="text-zinc-500 text-center py-16">Loading…</div>
      ) : (worklists as unknown[]).length === 0 ? (
        <Card className="bg-white border-zinc-200 p-12 text-center">
          <p className="text-zinc-500">No worklists yet.</p>
          <Button onClick={handleOpenCreate} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Create your first worklist
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {(worklists as WorklistSummary[]).map((w) => (
            <Card
              key={w.id}
              className="bg-white border-zinc-200 px-5 py-4 hover:border-zinc-300 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono font-bold text-zinc-950 text-sm">
                      {w.worklistNumber}
                    </span>
                    <Badge className="font-mono text-xs px-2 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-100">
                      {w.folderRef}
                    </Badge>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        STATUS_COLORS[w.status] ?? STATUS_COLORS.draft
                      }`}
                    >
                      {w.status}
                    </span>
                    <span className="text-zinc-400 text-xs">
                      {w.itemCount} {w.itemCount === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
                    {w.projectNumber && (
                      <span className="font-mono font-semibold text-zinc-700">{w.projectNumber}</span>
                    )}
                    {w.projectAddress && (
                      <span className="truncate max-w-xs">{w.projectAddress}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge
                    variant="outline"
                    className="border-zinc-300 text-zinc-700 font-mono text-xs"
                  >
                    Rover {w.machineType}
                  </Badge>
                  {/* CSV only shown for complete worklists from the list */}
                  {w.status === "complete" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-500 hover:text-zinc-950"
                      onClick={() => handleDownloadCsv(w)}
                      title="Download CSV"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                    </Button>
                  )}
                  <Link href={`/worklists/${w.id}`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-500 hover:text-zinc-950"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Worklist Dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) setShowCreate(false);
        }}
      >
        <DialogContent className="bg-white border-zinc-200 text-zinc-950 max-w-lg">
          <DialogHeader>
            <DialogTitle>New Worklist</DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-4">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                    i === currentStepIndex
                      ? "bg-blue-600 text-white"
                      : i < currentStepIndex
                      ? "bg-green-100 text-green-700"
                      : "bg-zinc-100 text-zinc-500"
                  }`}
                >
                  {i < currentStepIndex ? (
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : null}
                  {STEP_LABELS[step]}
                </div>
                {i < STEPS.length - 1 && <div className="w-4 h-px bg-zinc-200" />}
              </div>
            ))}
          </div>

          {createState.step === "project" && (
            <ProjectStep
              state={createState}
              setState={setCreateState}
              onNext={() => setCreateState({ ...createState, step: "cutlists" })}
            />
          )}
          {createState.step === "cutlists" && (
            <CutlistStep
              state={createState}
              setState={setCreateState}
              onBack={() => setCreateState({ ...createState, step: "project" })}
              onNext={() => setCreateState({ ...createState, step: "machine" })}
            />
          )}
          {createState.step === "machine" && (
            <MachineStep
              state={createState}
              setState={setCreateState}
              onBack={() => setCreateState({ ...createState, step: "cutlists" })}
              onNext={() => setCreateState({ ...createState, step: "materials" })}
            />
          )}
          {createState.step === "materials" && (
            <MaterialsStep
              state={createState}
              setState={setCreateState}
              onBack={() => setCreateState({ ...createState, step: "machine" })}
              onSubmit={handleSubmit}
              isPending={isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
