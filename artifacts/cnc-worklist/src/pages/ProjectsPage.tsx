import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Project {
  id: string;
  recordId: string;
  address: string;
  clientName: string;
  status: string;
}

export default function ProjectsPage() {
  const [search, setSearch] = useState("");

  const { data: projects, isLoading, error } = useQuery<Project[]>({
    queryKey: ["projects", search],
    queryFn: () =>
      apiFetch(`/projects${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    retry: false,
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Projects</h1>
        <p className="text-zinc-500 text-sm mt-0.5">From FileMaker database</p>
      </div>

      <div className="mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects..."
          className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 max-w-sm"
        />
      </div>

      {isLoading && (
        <div className="text-zinc-400 text-center py-16">Loading from FileMaker...</div>
      )}

      {error && (
        <Card className="bg-red-950/30 border-red-900 p-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-red-300 font-medium">FileMaker connection failed</p>
              <p className="text-red-400/70 text-sm mt-1">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
              <p className="text-zinc-500 text-xs mt-2">
                Configure FileMaker credentials in Admin → Settings
              </p>
            </div>
          </div>
        </Card>
      )}

      {!isLoading && !error && projects && (
        projects.length === 0 ? (
          <Card className="bg-white border-zinc-200 p-12 text-center">
            <p className="text-zinc-500">No projects found.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Card
                key={p.recordId}
                className="bg-white border-zinc-200 px-5 py-3.5 hover:border-zinc-300 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-zinc-950 font-medium truncate">{p.address}</p>
                    {p.clientName && (
                      <p className="text-zinc-400 text-sm">{p.clientName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {p.status && (
                      <Badge variant="outline" className="border-zinc-300 text-zinc-700 text-xs">
                        {p.status}
                      </Badge>
                    )}
                    <span className="text-zinc-600 font-mono text-xs">{p.id}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
