import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Settings {
  filemaker_server_url: string;
  filemaker_database: string;
  filemaker_username: string;
  filemaker_password: string;
  filemaker_allow_self_signed: string;
  csv_server_path: string;
  worklist_start_number: string;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState<Settings>({
    filemaker_server_url: "",
    filemaker_database: "",
    filemaker_username: "",
    filemaker_password: "",
    filemaker_allow_self_signed: "false",
    csv_server_path: "",
    worklist_start_number: "1",
  });
  const [showFmPassword, setShowFmPassword] = useState(false);
  const [forceOverride, setForceOverride] = useState(false);

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/settings"),
  });

  useEffect(() => {
    if (settings) {
      setForm({
        ...settings,
        filemaker_password: settings.filemaker_password === "***" ? "" : settings.filemaker_password,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Settings>) =>
      apiFetch<Settings>("/settings", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Settings saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    const updates: Partial<Settings> & { force_override?: boolean } = { ...form };
    if (!updates.filemaker_password) delete updates.filemaker_password;
    if (forceOverride) updates.force_override = true;
    saveMutation.mutate(updates as Partial<Settings>);
  }

  if (isLoading) {
    return <div className="text-zinc-400 text-center py-16">Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Settings</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Configure FileMaker connection and system settings</p>
      </div>

      <div className="space-y-6">
        <Card className="bg-white border-zinc-200 p-6">
          <h2 className="text-zinc-950 font-semibold mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            FileMaker Data API
          </h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-700">Server URL</Label>
              <Input
                value={form.filemaker_server_url}
                onChange={(e) => setForm((f) => ({ ...f, filemaker_server_url: e.target.value }))}
                placeholder="https://filemaker.example.com"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-700">Database Name</Label>
              <Input
                value={form.filemaker_database}
                onChange={(e) => setForm((f) => ({ ...f, filemaker_database: e.target.value }))}
                placeholder="MyDatabase"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Username</Label>
                <Input
                  value={form.filemaker_username}
                  onChange={(e) => setForm((f) => ({ ...f, filemaker_username: e.target.value }))}
                  placeholder="admin"
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-700">Password</Label>
                <div className="relative">
                  <Input
                    type={showFmPassword ? "text" : "password"}
                    value={form.filemaker_password}
                    onChange={(e) => setForm((f) => ({ ...f, filemaker_password: e.target.value }))}
                    placeholder={settings?.filemaker_password === "***" ? "••••••• (saved)" : "Enter password"}
                    className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFmPassword(!showFmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-950"
                  >
                    {showFmPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2 pt-1">
              <input
                id="allow-self-signed"
                type="checkbox"
                checked={form.filemaker_allow_self_signed === "true"}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    filemaker_allow_self_signed: e.target.checked ? "true" : "false",
                  }))
                }
                className="w-4 h-4 mt-0.5 accent-blue-600 shrink-0"
              />
              <div>
                <Label htmlFor="allow-self-signed" className="text-zinc-700 text-sm cursor-pointer">
                  Allow self-signed / mismatched SSL certificate
                </Label>
                <p className="text-zinc-500 text-xs mt-0.5">
                  Enable this if your FileMaker server uses a self-signed certificate or one that doesn't match its hostname. Disables SSL verification for FileMaker connections only.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-white border-zinc-200 p-6">
          <h2 className="text-zinc-950 font-semibold mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Worklist Settings
          </h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-700">Worklist Start Number</Label>
              <Input
                type="number"
                min={1}
                value={form.worklist_start_number}
                onChange={(e) => setForm((f) => ({ ...f, worklist_start_number: e.target.value }))}
                className="bg-white border-zinc-300 text-zinc-950 max-w-40"
              />
              <p className="text-zinc-500 text-xs">
                Only effective before the first worklist is created, or when Force Reset is enabled.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="force-override"
                type="checkbox"
                checked={forceOverride}
                onChange={(e) => setForceOverride(e.target.checked)}
                className="w-4 h-4 accent-red-500"
              />
              <Label htmlFor="force-override" className="text-zinc-700 text-sm cursor-pointer">
                Force reset sequence counter (use with caution — existing worklists keep their numbers)
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-700">CSV Server Path</Label>
              <Input
                value={form.csv_server_path}
                onChange={(e) => setForm((f) => ({ ...f, csv_server_path: e.target.value }))}
                placeholder="\\server\share\worklists"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 font-mono text-sm"
              />
              <p className="text-zinc-500 text-xs">
                Windows UNC path where CSV files are saved on the local server (for reference).
              </p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 min-w-28"
          >
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
