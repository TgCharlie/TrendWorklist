import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Worklist {
  id: number;
  worklistNumber: string;
  projectId: string | null;
  projectAddress: string | null;
  machineType: "B" | "C";
  folderNumber: number;
  status: "draft" | "submitted" | "completed";
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-200",
  submitted: "bg-blue-700 text-blue-100",
  completed: "bg-green-700 text-green-100",
};

export default function WorklistsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    machineType: "B" as "B" | "C",
    projectAddress: "",
    projectId: "",
  });

  const { data: worklists = [], isLoading } = useQuery<Worklist[]>({
    queryKey: ["worklists"],
    queryFn: () => apiFetch("/worklists"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch<Worklist>("/worklists", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: (newWorklist) => {
      queryClient.invalidateQueries({ queryKey: ["worklists"] });
      setShowCreate(false);
      setForm({ machineType: "B", projectAddress: "", projectId: "" });
      toast({ title: `Created ${newWorklist.worklistNumber}` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create worklist", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/worklists/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worklists"] });
      toast({ title: "Worklist deleted" });
    },
  });

  function handleDownloadCsv(worklist: Worklist) {
    const a = document.createElement("a");
    a.href = `/api/worklists/${worklist.id}/csv`;
    a.download = `${worklist.worklistNumber}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const folderRef = (w: Worklist) =>
    `${w.machineType}${String(w.folderNumber).padStart(4, "0")}`;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Worklists</h1>
          <p className="text-zinc-400 text-sm mt-0.5">{worklists.length} total</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Worklist
        </Button>
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-16">Loading...</div>
      ) : worklists.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800 p-12 text-center">
          <p className="text-zinc-400">No worklists yet.</p>
          <Button onClick={() => setShowCreate(true)} className="mt-4 bg-blue-600 hover:bg-blue-700">
            Create your first worklist
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {worklists.map((w) => (
            <Card
              key={w.id}
              className="bg-zinc-900 border-zinc-800 px-5 py-4 flex items-center gap-4 hover:border-zinc-600 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-white text-sm">{w.worklistNumber}</span>
                  <span className="font-mono text-blue-400 text-sm">{folderRef(w)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[w.status]}`}>
                    {w.status}
                  </span>
                </div>
                {w.projectAddress && (
                  <p className="text-zinc-400 text-sm mt-0.5 truncate">{w.projectAddress}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="outline" className="border-zinc-700 text-zinc-300 font-mono text-xs">
                  Rover {w.machineType}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-zinc-400 hover:text-white"
                  onClick={() => handleDownloadCsv(w)}
                  title="Download CSV"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </Button>
                <Link href={`/worklists/${w.id}`}>
                  <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle>New Worklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Machine Type</Label>
              <Select
                value={form.machineType}
                onValueChange={(v) => setForm({ ...form, machineType: v as "B" | "C" })}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="B" className="text-white">Rover B</SelectItem>
                  <SelectItem value="C" className="text-white">Rover C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Project Address</Label>
              <Input
                value={form.projectAddress}
                onChange={(e) => setForm({ ...form, projectAddress: e.target.value })}
                placeholder="e.g. 123 Smith Street, Suburb"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Project ID (FileMaker)</Label>
              <Input
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                placeholder="Optional project ID"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-zinc-400">
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Worklist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
