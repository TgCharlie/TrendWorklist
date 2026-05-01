import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Settings {
  filemaker_server_url: string;
  filemaker_database: string;
}

export default function StockbookPage() {
  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/settings"),
    staleTime: 60_000,
  });

  const serverUrl = settings?.filemaker_server_url?.replace(/\/$/, "") ?? "";
  const database = settings?.filemaker_database ?? "";
  const stockbookUrl = serverUrl
    ? `${serverUrl}/fmi/webd${database ? `#${encodeURIComponent(database)}` : ""}`
    : null;

  function handleOpen() {
    if (stockbookUrl) window.open(stockbookUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Stockbook</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Open the FileMaker stockbook to view and manage stock levels.
        </p>
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-16">Loading…</div>
      ) : !serverUrl ? (
        <Card className="bg-white border-zinc-200 p-10 text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-zinc-700 font-medium">FileMaker not configured</p>
          <p className="text-zinc-500 text-sm mt-1">
            Set the FileMaker server URL in the Admin portal to enable the Stockbook link.
          </p>
        </Card>
      ) : (
        <Card className="bg-white border-zinc-200 p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <div>
              <p className="text-zinc-950 font-semibold">FileMaker Stockbook</p>
              {database && (
                <p className="text-zinc-500 text-sm mt-0.5">Database: <span className="font-mono text-zinc-700">{database}</span></p>
              )}
              <p className="text-zinc-400 text-xs mt-0.5 font-mono truncate max-w-sm">{serverUrl}</p>
            </div>
          </div>

          <Button
            onClick={handleOpen}
            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
            size="lg"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Stockbook
          </Button>

          <p className="text-zinc-400 text-xs mt-4">
            Opens FileMaker WebDirect in a new tab. You may need to sign in with your FileMaker credentials.
          </p>
        </Card>
      )}
    </div>
  );
}
