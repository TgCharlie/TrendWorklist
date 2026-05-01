import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Project {
  projectId: string;
  projectNumber: string;
  address: string;
  date?: string | null;
  status?: string | null;
}

interface Cutlist {
  cutlistId: string;
  pid: string;
  item: string;
  lister?: string | null;
  dateListed?: string | null;
  projectId: string;
}

export default function CutlistsPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectSearch, setProjectSearch] = useState("");

  const {
    data: projects = [],
    isLoading: projectsLoading,
    error: projectsError,
  } = useQuery<Project[]>({
    queryKey: ["projects", projectSearch],
    queryFn: () =>
      apiFetch(`/projects${projectSearch ? `?search=${encodeURIComponent(projectSearch)}` : ""}`),
    retry: false,
  });

  const {
    data: cutlists = [],
    isLoading: cutlistsLoading,
    error: cutlistsError,
  } = useQuery<Cutlist[]>({
    queryKey: ["cutlists", selectedProjectId],
    queryFn: () => apiFetch(`/cutlists?projectId=${encodeURIComponent(selectedProjectId)}`),
    enabled: !!selectedProjectId,
    retry: false,
  });

  const selectedProject = projects.find((p) => p.projectId === selectedProjectId);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Cutlists</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Reference view — cutlists from FileMaker</p>
      </div>

      <div className="mb-5 flex flex-col sm:flex-row gap-3">
        <Input
          value={projectSearch}
          onChange={(e) => setProjectSearch(e.target.value)}
          placeholder="Search projects..."
          className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 max-w-xs"
          data-testid="input-project-search"
        />
        {projectsLoading ? (
          <div className="text-zinc-400 text-sm flex items-center">Loading projects...</div>
        ) : projectsError ? (
          <div className="text-red-500 text-sm flex items-center">FileMaker unavailable</div>
        ) : (
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger
              className="bg-white border-zinc-300 text-zinc-950 max-w-sm"
              data-testid="select-project"
            >
              <SelectValue placeholder="Select a project..." />
            </SelectTrigger>
            <SelectContent className="bg-white border-zinc-200 max-h-72">
              {projects.map((p) => (
                <SelectItem key={p.projectId} value={p.projectId}>
                  <span className="font-mono text-blue-600 text-xs mr-2">{p.projectNumber}</span>
                  {p.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedProject && (
        <div className="mb-4 px-4 py-3 bg-zinc-100 rounded-lg border border-zinc-200">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-blue-600 font-bold text-sm">
              {selectedProject.projectNumber}
            </span>
            <span className="text-zinc-800 text-sm">{selectedProject.address}</span>
            {selectedProject.status && (
              <Badge variant="outline" className="border-zinc-300 text-zinc-600 text-xs">
                {selectedProject.status}
              </Badge>
            )}
          </div>
        </div>
      )}

      {!selectedProjectId && (
        <Card className="bg-white border-zinc-200 p-12 text-center">
          <p className="text-zinc-500 text-sm">Select a project above to view its cutlists.</p>
        </Card>
      )}

      {selectedProjectId && cutlistsLoading && (
        <div className="text-zinc-400 text-center py-16">Loading cutlists from FileMaker...</div>
      )}

      {selectedProjectId && cutlistsError && (
        <Card className="bg-red-950/10 border-red-200 p-6">
          <p className="text-red-700 font-medium text-sm">Failed to load cutlists</p>
          <p className="text-red-500 text-xs mt-1">
            {cutlistsError instanceof Error ? cutlistsError.message : "FileMaker unavailable"}
          </p>
        </Card>
      )}

      {selectedProjectId && !cutlistsLoading && !cutlistsError && cutlists.length === 0 && (
        <Card className="bg-white border-zinc-200 p-12 text-center">
          <p className="text-zinc-500 text-sm">No cutlists found for this project.</p>
        </Card>
      )}

      {cutlists.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">PID</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">ITEM</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">LISTER</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">DATE LISTED</th>
              </tr>
            </thead>
            <tbody>
              {cutlists.map((c, i) => (
                <tr
                  key={c.cutlistId}
                  data-testid={`row-cutlist-${c.cutlistId}`}
                  className={`border-t border-zinc-200 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                >
                  <td className="px-4 py-2.5 font-mono text-blue-600 text-xs font-bold">
                    {c.pid}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-800">{c.item}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{c.lister ?? "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{c.dateListed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
