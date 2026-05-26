import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  cutlistNumber?: string;
  pid?: string;
  item: string;
  memo?: string;
  lister?: string | null;
  createdBy?: string | null;
  dateListed?: string | null;
  projectId: string;
  projectName?: string;
  status?: string;
}

type Mode = "search" | "browse";

export default function CutlistsPage() {
  const [mode, setMode] = useState<Mode>("search");

  const [cutlistSearch, setCutlistSearch] = useState("");
  const [debouncedCutlistSearch, setDebouncedCutlistSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectSearch, setProjectSearch] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedCutlistSearch(cutlistSearch.trim());
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cutlistSearch]);

  const {
    data: foundCutlist,
    isLoading: cutlistSearchLoading,
    error: cutlistSearchError,
    isFetching: cutlistSearchFetching,
  } = useQuery<Cutlist | null, Error>({
    queryKey: ["cutlist-direct", debouncedCutlistSearch],
    queryFn: (): Promise<Cutlist | null> =>
      (apiFetch(`/cutlists/${encodeURIComponent(debouncedCutlistSearch)}`) as Promise<Cutlist>).catch((err: { status?: number }) => {
        if (err?.status === 404) return null;
        throw err;
      }),
    enabled: mode === "search" && debouncedCutlistSearch.length > 0,
    retry: false,
    initialData: undefined,
  });

  const { data: foundProject } = useQuery<Project | null>({
    queryKey: ["project-by-id", foundCutlist?.projectId],
    queryFn: (): Promise<Project | null> =>
      (apiFetch(`/projects/${encodeURIComponent(foundCutlist!.projectId)}`) as Promise<Project>).catch(() => null),
    enabled: mode === "search" && !!foundCutlist?.projectId,
    staleTime: 5 * 60 * 1000,
    retry: false,
    initialData: undefined,
  });

  const {
    data: projects = [],
    isLoading: projectsLoading,
    error: projectsError,
  } = useQuery<Project[]>({
    queryKey: ["projects", projectSearch],
    queryFn: () =>
      apiFetch(`/projects${projectSearch ? `?search=${encodeURIComponent(projectSearch)}` : ""}`),
    enabled: mode === "browse",
    retry: false,
  });

  const {
    data: cutlists = [],
    isLoading: cutlistsLoading,
    error: cutlistsError,
  } = useQuery<Cutlist[]>({
    queryKey: ["cutlists", selectedProjectId],
    queryFn: () => apiFetch(`/cutlists?projectId=${encodeURIComponent(selectedProjectId)}`),
    enabled: mode === "browse" && !!selectedProjectId,
    retry: false,
  });

  const selectedProject = projects.find((p) => p.projectId === selectedProjectId);

  function switchMode(m: Mode) {
    setMode(m);
    setCutlistSearch("");
    setDebouncedCutlistSearch("");
    setSelectedProjectId("");
    setProjectSearch("");
  }

  const searching = cutlistSearchLoading || cutlistSearchFetching;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Cutlists</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Reference view — cutlists from FileMaker</p>
      </div>

      <div className="flex gap-2 mb-5">
        <Button
          size="sm"
          variant={mode === "search" ? "default" : "outline"}
          className={mode === "search" ? "bg-blue-600 text-white hover:bg-blue-700" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"}
          onClick={() => switchMode("search")}
        >
          Search by cutlist number
        </Button>
        <Button
          size="sm"
          variant={mode === "browse" ? "default" : "outline"}
          className={mode === "browse" ? "bg-blue-600 text-white hover:bg-blue-700" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"}
          onClick={() => switchMode("browse")}
        >
          Browse by project
        </Button>
      </div>

      {mode === "search" && (
        <>
          <div className="mb-5">
            <Input
              value={cutlistSearch}
              onChange={(e) => setCutlistSearch(e.target.value)}
              placeholder="Enter cutlist number e.g. 298282"
              className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 max-w-xs"
              autoFocus
            />
          </div>

          {!debouncedCutlistSearch && (
            <Card className="bg-white border-zinc-200 p-12 text-center">
              <p className="text-zinc-500 text-sm">Enter a cutlist number to search.</p>
            </Card>
          )}

          {debouncedCutlistSearch && searching && (
            <div className="text-zinc-400 text-center py-16 text-sm">Searching FileMaker...</div>
          )}

          {debouncedCutlistSearch && !searching && cutlistSearchError && (
            <Card className="bg-red-950/10 border-red-200 p-6">
              <p className="text-red-700 font-medium text-sm">Search failed</p>
              <p className="text-red-500 text-xs mt-1">
                {cutlistSearchError instanceof Error ? cutlistSearchError.message : "FileMaker unavailable"}
              </p>
            </Card>
          )}

          {debouncedCutlistSearch && !searching && !cutlistSearchError && foundCutlist === null && (
            <Card className="bg-white border-zinc-200 p-12 text-center">
              <p className="text-zinc-500 text-sm">
                No cutlist found for <span className="font-mono text-zinc-700">#{debouncedCutlistSearch}</span>.
              </p>
            </Card>
          )}

          {!searching && !cutlistSearchError && foundCutlist && (
            <div className="overflow-hidden rounded-lg border border-zinc-200">
              <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-200 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-blue-600 font-bold text-sm">
                  #{foundCutlist.cutlistId || foundCutlist.cutlistNumber}
                </span>
                {foundCutlist.projectName && (
                  <span className="text-zinc-800 text-sm font-medium">{foundCutlist.projectName}</span>
                )}
                {foundCutlist.status && (
                  <Badge variant="outline" className="border-zinc-300 text-zinc-600 text-xs">
                    {foundCutlist.status}
                  </Badge>
                )}
              </div>

              {foundProject && (
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-xs text-zinc-500">
                  <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="font-mono text-blue-700 font-medium">{foundProject.projectNumber}</span>
                  <span className="ml-1">{foundProject.address}</span>
                  {foundProject.status && (
                    <span className="ml-1">· {foundProject.status}</span>
                  )}
                </div>
              )}

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white border-b border-zinc-100">
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium w-1/3">Field</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Item", value: foundCutlist.item },
                    { label: "Memo", value: foundCutlist.memo },
                    { label: "Created by", value: foundCutlist.createdBy || foundCutlist.lister },
                    { label: "Status", value: foundCutlist.status },
                  ]
                    .filter((row) => row.value)
                    .map((row, i) => (
                      <tr
                        key={row.label}
                        className={`border-t border-zinc-200 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                      >
                        <td className="px-4 py-2.5 text-zinc-500 text-xs font-medium">{row.label}</td>
                        <td className="px-4 py-2.5 text-zinc-800">{row.value}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {mode === "browse" && (
        <>
          <div className="mb-5 flex flex-col sm:flex-row gap-3">
            <Input
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Filter projects..."
              className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 max-w-xs"
            />
            {projectsLoading ? (
              <div className="text-zinc-400 text-sm flex items-center">Loading projects...</div>
            ) : projectsError ? (
              <div className="text-red-500 text-sm flex items-center">FileMaker unavailable</div>
            ) : (
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-950 max-w-sm">
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
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">#</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">ITEM</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">CREATED BY</th>
                    <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {cutlists.map((c, i) => (
                    <tr
                      key={c.cutlistId}
                      className={`border-t border-zinc-200 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-blue-600 text-xs font-bold">
                        {c.cutlistId || c.cutlistNumber}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-800">{c.item}</td>
                      <td className="px-4 py-2.5 text-zinc-500 text-xs">{c.createdBy || c.lister || "—"}</td>
                      <td className="px-4 py-2.5 text-zinc-500 text-xs">{c.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
