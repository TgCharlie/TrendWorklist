import { useState } from "react";
import { downloadCsv } from "@/lib/electron-bridge";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWorklists,
  useDeleteWorklist,
  useCreateWorklist,
  useAddWorklistItem,
  useListMaterials,
  useListStockbook,
  getCutlist,
  getProject,
  useGetCutlist,
  getListWorklistsQueryKey,
  getListMaterialsQueryKey,
  getListStockbookQueryKey,
  getGetCutlistQueryKey,
} from "@workspace/api-client-react";
import type {
  WorklistSummary,
  Material,
  StockbookItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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

const cutlistCache = new Map<string, Record<string, unknown>>();
const projectCache = new Map<string, Record<string, unknown>>();

async function fetchCutlistCached(id: string): Promise<Record<string, unknown>> {
  if (cutlistCache.has(id)) return cutlistCache.get(id)!;
  const result = (await getCutlist(id)) as Record<string, unknown>;
  cutlistCache.set(id, result);
  return result;
}

async function fetchProjectCached(projectId: string): Promise<Record<string, unknown>> {
  if (projectCache.has(projectId)) return projectCache.get(projectId)!;
  const result = (await getProject(projectId)) as Record<string, unknown>;
  projectCache.set(projectId, result);
  return result;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 border border-zinc-200",
  active: "bg-blue-50 text-blue-700 border border-blue-200",
  complete: "bg-green-50 text-green-700 border border-green-200",
};

function CutlistItemLabel({ cutlistRef }: { cutlistRef: string }) {
  const { data } = useGetCutlist(cutlistRef, {
    query: { queryKey: getGetCutlistQueryKey(cutlistRef), staleTime: 300_000 },
  });
  const item = data?.item as string | undefined;
  if (!item) return null;
  return <span className="text-zinc-700 font-semibold text-xs">{item}</span>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = "cutlists" | "machine" | "materials";

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

interface CutlistEntry {
  cutlistId: string;
  item: string;
  memo: string;
  createdBy: string;
  projectId: string;
  projectName: string;
}

interface CreateState {
  step: Step;
  cutlistInput: string;
  cutlistEntries: CutlistEntry[];
  resolvedProjectId: string;
  resolvedProjectName: string;
  machineType: "B" | "C";
  materialRows: DraftMaterialRow[];
}

const DEFAULT_STATE: CreateState = {
  step: "cutlists",
  cutlistInput: "",
  cutlistEntries: [],
  resolvedProjectId: "",
  resolvedProjectName: "",
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

function CutlistStep({
  state,
  setState,
  onNext,
}: {
  state: CreateState;
  setState: (s: CreateState) => void;
  onNext: () => void;
}) {
  const [isLooking, setIsLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  async function addCutlist() {
    const raw = state.cutlistInput.trim();
    if (!raw) return;

    const ids = raw.split(/[,.]/).map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return;

    setIsLooking(true);
    setLookupError(null);

    const existingIds = new Set(state.cutlistEntries.map((e) => e.cutlistId));
    const newIds = ids.filter((id) => !existingIds.has(id));

    const results = await Promise.allSettled(
      newIds.map(async (id) => {
        const cutlist = await fetchCutlistCached(id);
        const projectId = (cutlist.projectId as string) ?? "";
        let projectName = (cutlist.projectName as string) ?? "";
        if (!projectName && projectId) {
          try {
            const project = await fetchProjectCached(projectId);
            projectName = (project.projectName as string) ?? "";
          } catch {
            // ignore — project name is best-effort
          }
        }
        return {
          cutlistId: String(cutlist.cutlistId ?? cutlist.id ?? id),
          item: (cutlist.item as string) ?? "",
          memo: (cutlist.memo as string) ?? "",
          createdBy: (cutlist.createdBy as string) ?? "",
          projectId,
          projectName,
        } satisfies CutlistEntry;
      })
    );

    const errors: string[] = [];
    let entries = [...state.cutlistEntries];
    let resolvedProjectId = state.resolvedProjectId;
    let resolvedProjectName = state.resolvedProjectName;

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        entries = [...entries, result.value];
        resolvedProjectId = resolvedProjectId || result.value.projectId;
        resolvedProjectName = resolvedProjectName || result.value.projectName;
      } else {
        errors.push(newIds[i]);
      }
    });

    setState({
      ...state,
      cutlistInput: "",
      cutlistEntries: entries,
      resolvedProjectId,
      resolvedProjectName,
    });

    if (errors.length > 0) {
      setLookupError(
        `${errors.length === 1 ? `Cutlist "${errors[0]}"` : `Cutlists ${errors.map((e) => `"${e}"`).join(", ")}`} not found in FileMaker.`
      );
    }

    setIsLooking(false);
  }

  function removeCutlist(cutlistId: string) {
    const entries = state.cutlistEntries.filter((e) => e.cutlistId !== cutlistId);
    setState({
      ...state,
      cutlistEntries: entries,
      resolvedProjectId: entries[0]?.projectId ?? "",
      resolvedProjectName: entries[0]?.projectName ?? "",
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label className="text-zinc-700">Cutlist Numbers</Label>
          <span className="text-zinc-400 text-xs">Separate multiple numbers with commas or periods</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={state.cutlistInput}
            onChange={(e) => {
              setState({ ...state, cutlistInput: e.target.value });
              setLookupError(null);
            }}
            onKeyDown={(e) => { if (e.key === "Enter") addCutlist(); }}
            placeholder="e.g. 298337,298333,298327"
            autoFocus
            className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
          />
          <Button
            onClick={addCutlist}
            disabled={!state.cutlistInput.trim() || isLooking}
            className="bg-blue-600 hover:bg-blue-700 flex-shrink-0 min-w-[80px]"
          >
            {isLooking ? (
              <span className="flex items-center gap-1.5">
                <svg
                  className="animate-spin h-3.5 w-3.5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span className="animate-pulse tracking-wide text-xs font-semibold uppercase">
                  Fetching
                </span>
              </span>
            ) : (
              "Add"
            )}
          </Button>
        </div>
      </div>

      {lookupError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          {lookupError}
        </div>
      )}

      {state.resolvedProjectId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
          <p className="text-blue-500 text-xs font-medium uppercase tracking-wide">
            Project (auto-detected){state.resolvedProjectName ? ` — ${state.resolvedProjectName}` : ""}
          </p>
          <p className="font-mono font-bold text-blue-900">{state.resolvedProjectId}</p>
        </div>
      )}

      {state.cutlistEntries.length > 0 && (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
          <div className="bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">
            {state.cutlistEntries.length} cutlist{state.cutlistEntries.length !== 1 ? "s" : ""} added
          </div>
          <div className="divide-y divide-zinc-100 max-h-52 overflow-y-auto">
            {state.cutlistEntries.map((entry) => (
              <div key={entry.cutlistId} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-medium text-zinc-900 text-sm">{entry.cutlistId}</p>
                  {entry.item && <p className="text-zinc-600 text-xs truncate">{entry.item}</p>}
                  {entry.memo && <p className="text-zinc-400 text-xs truncate">{entry.memo}</p>}
                  {entry.createdBy && <p className="text-zinc-400 text-xs">{entry.createdBy}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => removeCutlist(entry.cutlistId)}
                  className="text-zinc-300 hover:text-red-500 flex-shrink-0"
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

      <div className="flex justify-end pt-1">
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          onClick={onNext}
          disabled={state.cutlistEntries.length === 0}
        >
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
            {state.resolvedProjectId}
          </span>
          <span className="text-zinc-600 truncate">{state.resolvedProjectName}</span>
        </div>
        {state.cutlistEntries.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-zinc-500 flex-shrink-0">Cutlists:</span>
            <div className="flex flex-wrap gap-1">
              {state.cutlistEntries.map((e) => (
                <span
                  key={e.cutlistId}
                  className="bg-blue-100 text-blue-800 border border-blue-200 rounded text-xs px-1.5 py-0.5 font-mono"
                >
                  {e.cutlistId}
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
  const [selectKey, setSelectKey] = useState(0);

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
    setSelectKey((k) => k + 1);
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
            {state.resolvedProjectId}
          </span>
        </span>
        <span>
          Machine:{" "}
          <span className="font-mono font-semibold text-zinc-800">
            Rover {state.machineType}
          </span>
        </span>
        {state.cutlistEntries.length > 0 && (
          <span>Cutlists: {state.cutlistEntries.length}</span>
        )}
      </div>

      {/* Add row form */}
      <div className="border border-zinc-200 rounded-lg p-3 space-y-3">
        <p className="text-xs font-medium text-zinc-600 uppercase tracking-wide">Add Material Row</p>

        {/* Material library picker + Qty stepper */}
        {materials.length > 0 && (
          <div className="flex items-center gap-2">
            <Select
              key={selectKey}
              onValueChange={(id) => {
                const mat = materials.find((m) => String(m.id) === id);
                if (mat) selectMaterial(mat);
              }}
            >
              <SelectTrigger className="bg-white border-zinc-300 text-zinc-950 text-sm flex-1 h-10">
                <SelectValue placeholder="Pick from materials library…" />
              </SelectTrigger>
              <SelectContent className="bg-white border-zinc-200">
                {materials.map((m) => {
                  const alreadyAdded = state.materialRows.some((r) => r.pcode === m.pcode);
                  return (
                    <SelectItem key={m.id} value={String(m.id)}>
                      <span className={`font-mono text-xs mr-2 ${alreadyAdded ? "text-red-600" : "text-blue-600"}`}>{m.pcode}</span>
                      <span className={alreadyAdded ? "text-red-600" : ""}>{m.displayName}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <div className="flex items-stretch border border-zinc-300 rounded-md bg-white overflow-hidden flex-shrink-0 h-10">
              <span className="px-3 text-sm text-zinc-900 min-w-[2.5rem] text-center select-none flex items-center justify-center">
                {rowForm.quantity}
              </span>
              <div className="flex flex-col border-l border-zinc-200">
                <button
                  type="button"
                  onClick={() => setRowForm((f) => ({ ...f, quantity: f.quantity + 1 }))}
                  className="flex-1 px-3 text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 text-base leading-none font-medium flex items-center justify-center"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setRowForm((f) => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))}
                  className="flex-1 px-3 text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 text-base leading-none font-medium border-t border-zinc-200 flex items-center justify-center"
                >
                  −
                </button>
              </div>
            </div>
          </div>
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

        {/* Qty stepper (shown when no materials library, so always visible for manual entry) */}
        {!materials.length && (
          <div className="flex items-center gap-3">
            <Label className="text-zinc-600 text-xs">Qty</Label>
            <div className="flex items-center border border-zinc-300 rounded-md bg-white overflow-hidden">
              <span className="px-3 text-sm text-zinc-900 min-w-[2.5rem] text-center select-none">
                {rowForm.quantity}
              </span>
              <div className="flex flex-col border-l border-zinc-200">
                <button
                  type="button"
                  onClick={() => setRowForm((f) => ({ ...f, quantity: f.quantity + 1 }))}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 text-base leading-none font-medium"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setRowForm((f) => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 text-base leading-none font-medium border-t border-zinc-200"
                >
                  −
                </button>
              </div>
            </div>
          </div>
        )}

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
  cutlists: "1. Cutlists",
  machine: "2. Machine",
  materials: "3. Materials",
};

const STEPS: Step[] = ["cutlists", "machine", "materials"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorklistsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [createState, setCreateState] = useState<CreateState>({ ...DEFAULT_STATE });
  const [deletePending, setDeletePending] = useState<{ id: number; worklistNumber: string } | null>(null);

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
    const { resolvedProjectId, resolvedProjectName, cutlistEntries, machineType } = createState;
    createMutation.mutate({
      data: {
        projectId: resolvedProjectId || undefined,
        projectNumber: resolvedProjectId || undefined,
        projectAddress: resolvedProjectName || undefined,
        cutlistRefs: cutlistEntries.map((e) => e.cutlistId),
        machineType,
      },
    });
  }

  async function handleDownloadCsv(wl: { id: number; worklistNumber: string }) {
    try {
      await downloadCsv(
        `/api/worklists/${wl.id}/csv`,
        `${wl.worklistNumber}.csv`,
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
                    {(w as any).cutlistRefs?.[0] && (
                      <CutlistItemLabel cutlistRef={(w as any).cutlistRefs[0]} />
                    )}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-400 hover:text-red-600"
                    title="Delete worklist"
                    onClick={() => setDeletePending({ id: w.id, worklistNumber: w.worklistNumber })}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </Button>
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

      <ConfirmDialog
        open={!!deletePending}
        title="Delete Worklist"
        message={deletePending ? `Permanently delete ${deletePending.worklistNumber}? This cannot be undone.` : ""}
        confirmLabel="Delete"
        confirmVariant="destructive"
        onConfirm={() => {
          if (deletePending) deleteMutation.mutate({ id: deletePending.id });
          setDeletePending(null);
        }}
        onCancel={() => setDeletePending(null)}
      />

      {/* Create Worklist Dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) setShowCreate(false);
        }}
      >
        <DialogContent className="bg-white border-zinc-200 text-zinc-950 max-w-2xl">
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

          {createState.step === "cutlists" && (
            <CutlistStep
              state={createState}
              setState={setCreateState}
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
