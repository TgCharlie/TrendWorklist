import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";

type Tab = "users" | "filemaker" | "server";

interface User {
  id: number;
  username: string;
  role: "admin" | "operator";
  active: boolean;
  createdAt: string;
}

interface Settings {
  filemaker_server_url: string;
  filemaker_database: string;
  filemaker_username: string;
  filemaker_password: string;
  filemaker_allow_self_signed: string;
  csv_server_path: string;
  worklist_start_number: string;
}

interface TestStep {
  step: string;
  ok: boolean;
  detail: string;
}

interface TestResult {
  ok: boolean;
  steps: TestStep[];
}

interface NextNumber {
  nextNumber: number;
  formatted: string;
  worklistsExist: boolean;
}

function UsersTab() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: "", pin: "", role: "operator" as "admin" | "operator" });
  const [editForm, setEditForm] = useState({ pin: "", role: "operator" as "admin" | "operator", active: true });
  const [deletePending, setDeletePending] = useState<User | null>(null);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiFetch("/users"),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiFetch<User>("/users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setForm({ username: "", pin: "", role: "operator" });
      toast({ title: "User created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<typeof editForm> }) =>
      apiFetch<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditUser(null);
      toast({ title: "User updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function openEdit(u: User) {
    setEditUser(u);
    setEditForm({ pin: "", role: u.role, active: u.active });
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-zinc-500 text-sm">Manage workshop accounts and access</p>
        <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-12">Loading...</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="bg-white border border-zinc-200 rounded-lg px-5 py-3.5 flex items-center gap-4"
            >
              <div className="w-9 h-9 bg-zinc-100 rounded-full flex items-center justify-center text-sm font-medium text-zinc-700 uppercase flex-shrink-0">
                {u.username[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-950 font-medium">{u.username}</span>
                  {u.id === currentUser?.id && (
                    <Badge variant="outline" className="border-zinc-300 text-zinc-500 text-xs">you</Badge>
                  )}
                  {!u.active && (
                    <Badge className="bg-red-50 text-red-600 border border-red-200 text-xs">inactive</Badge>
                  )}
                </div>
                <p className="text-zinc-500 text-xs capitalize">{u.role}</p>
              </div>
              <Badge variant="outline" className={`border text-xs ${u.role === "admin" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-zinc-50 text-zinc-600 border-zinc-200"}`}>
                {u.role}
              </Badge>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(u)}
                  className="text-zinc-400 hover:text-zinc-950 transition-colors p-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {u.id !== currentUser?.id && (
                  <button
                    onClick={() => setDeletePending(u)}
                    className="text-zinc-400 hover:text-red-500 transition-colors p-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deletePending}
        title="Delete user"
        message={deletePending ? `Are you sure you want to delete the user "${deletePending.username}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        onConfirm={() => { if (deletePending) deleteMutation.mutate(deletePending.id); }}
        onCancel={() => setDeletePending(null)}
      />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-950">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-700">Username</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="e.g. john"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-700">4-digit PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={form.pin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setForm((f) => ({ ...f, pin: v }));
                }}
                placeholder="••••"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 font-mono tracking-widest"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-700">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as "admin" | "operator" }))}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200">
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-zinc-400">Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-950">
          <DialogHeader>
            <DialogTitle>Edit User: {editUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-700">New PIN (leave blank to keep)</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={editForm.pin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setEditForm((f) => ({ ...f, pin: v }));
                }}
                placeholder="Leave blank to keep current"
                className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 font-mono tracking-widest"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-700">Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as "admin" | "operator" }))}>
                <SelectTrigger className="bg-white border-zinc-300 text-zinc-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200">
                  <SelectItem value="operator">Operator</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={editForm.active}
                onCheckedChange={(checked) => setEditForm((f) => ({ ...f, active: checked }))}
              />
              <Label className="text-zinc-700">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditUser(null)} className="text-zinc-400">Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                if (!editUser) return;
                const updates: Record<string, unknown> = { role: editForm.role, active: editForm.active };
                if (editForm.pin.length === 4) updates.pin = editForm.pin;
                updateMutation.mutate({ id: editUser.id, data: updates });
              }}
              disabled={updateMutation.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useSettingsForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Settings>({
    filemaker_server_url: "",
    filemaker_database: "",
    filemaker_username: "",
    filemaker_password: "",
    filemaker_allow_self_signed: "false",
    csv_server_path: "",
    worklist_start_number: "1",
  });

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => apiFetch("/settings"),
  });

  const { data: nextNumber } = useQuery<NextNumber>({
    queryKey: ["settings-next-number"],
    queryFn: () => apiFetch("/settings/next-worklist-number"),
    refetchInterval: false,
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
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch<Settings>("/settings", { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-next-number"] });
      toast({ title: "Settings saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return { form, setForm, settings, isLoading, nextNumber, saveMutation };
}

function FileMakerTab() {
  const { form, setForm, settings, isLoading, saveMutation } = useSettingsForm();
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  if (isLoading) return <div className="text-zinc-400 text-center py-12">Loading…</div>;

  function handleSave() {
    const updates: Record<string, unknown> = {
      filemaker_server_url: form.filemaker_server_url,
      filemaker_database: form.filemaker_database,
      filemaker_username: form.filemaker_username,
      filemaker_allow_self_signed: form.filemaker_allow_self_signed,
    };
    if (form.filemaker_password) updates.filemaker_password = form.filemaker_password;
    saveMutation.mutate(updates);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<TestResult>("/filemaker/test");
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, steps: [{ step: "Request failed", ok: false, detail: err instanceof Error ? err.message : String(err) }] });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white border-zinc-200 p-6">
        <h2 className="text-zinc-950 font-semibold mb-1">FileMaker Data API</h2>
        <p className="text-zinc-500 text-sm mb-5">
          Connection credentials for the FileMaker server. Used to import projects, cutlists and stock levels.
        </p>
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
                  type={showPassword ? "text" : "password"}
                  value={form.filemaker_password}
                  onChange={(e) => setForm((f) => ({ ...f, filemaker_password: e.target.value }))}
                  placeholder={settings?.filemaker_password === "***" ? "••••••• (saved)" : "Enter password"}
                  className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-950"
                >
                  {showPassword ? (
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
                Enable if your FileMaker server uses a self-signed certificate or one that doesn't match its hostname.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {testResult && (
        <Card className={`border p-5 ${testResult.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          <h3 className={`font-semibold text-sm mb-3 ${testResult.ok ? "text-green-800" : "text-red-800"}`}>
            {testResult.ok ? "Connection successful" : "Connection failed"}
          </h3>
          <div className="space-y-2">
            {testResult.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 ${s.ok ? "text-green-500" : "text-red-500"}`}>
                  {s.ok ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </span>
                <div>
                  <p className={`text-sm font-medium ${s.ok ? "text-green-800" : "text-red-800"}`}>{s.step}</p>
                  <p className={`text-xs font-mono break-all ${s.ok ? "text-green-700" : "text-red-700"}`}>{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button
          onClick={handleTest}
          disabled={testing}
          variant="outline"
          className="border-zinc-300 text-zinc-700 hover:bg-zinc-50"
        >
          {testing ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Testing…
            </span>
          ) : "Test Connection"}
        </Button>
        <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700 min-w-28">
          {saveMutation.isPending ? "Saving…" : "Save FileMaker Settings"}
        </Button>
      </div>
    </div>
  );
}

function ServerTab() {
  const { form, setForm, isLoading, nextNumber, saveMutation } = useSettingsForm();
  const [forceOverride, setForceOverride] = useState(false);

  if (isLoading) return <div className="text-zinc-400 text-center py-12">Loading…</div>;

  function handleSave() {
    const updates: Record<string, unknown> = {
      csv_server_path: form.csv_server_path,
      worklist_start_number: form.worklist_start_number,
    };
    if (forceOverride) updates.force_override = true;
    saveMutation.mutate(updates);
    setForceOverride(false);
  }

  return (
    <div className="space-y-6">
      {nextNumber && (
        <Card className="bg-blue-50 border-blue-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-900 font-semibold text-sm">Next Worklist Number</p>
              <p className="text-blue-700 font-mono text-2xl font-bold mt-0.5">{nextNumber.formatted}</p>
              {nextNumber.worklistsExist && (
                <p className="text-blue-600 text-xs mt-1">
                  Worklists exist — changing the start number requires enabling Force Reset.
                </p>
              )}
            </div>
            <div className="text-blue-300">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </Card>
      )}

      <Card className="bg-white border-zinc-200 p-6">
        <h2 className="text-zinc-950 font-semibold mb-1">Worklist Numbering</h2>
        <p className="text-zinc-500 text-sm mb-5">Configure the numbering sequence for new worklists.</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-700">Start Number</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={1}
                value={form.worklist_start_number}
                onChange={(e) => setForm((f) => ({ ...f, worklist_start_number: e.target.value }))}
                className="bg-white border-zinc-300 text-zinc-950 max-w-40"
              />
              {nextNumber?.worklistsExist && !forceOverride && (
                <span className="text-amber-600 text-xs flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Enable Force Reset to change
                </span>
              )}
            </div>
            <p className="text-zinc-500 text-xs">The sequence number that will be used for the next worklist.</p>
          </div>
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <input
              id="force-override"
              type="checkbox"
              checked={forceOverride}
              onChange={(e) => setForceOverride(e.target.checked)}
              className="w-4 h-4 accent-amber-500 mt-0.5"
            />
            <div>
              <Label htmlFor="force-override" className="text-amber-800 text-sm font-medium cursor-pointer">
                Force Reset Sequence Counter
              </Label>
              <p className="text-amber-700 text-xs mt-0.5">
                Resets the sequence to the start number. Existing worklists keep their numbers. Use with caution.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-white border-zinc-200 p-6">
        <h2 className="text-zinc-950 font-semibold mb-1">CSV Output</h2>
        <p className="text-zinc-500 text-sm mb-5">Local server path where CSV files are written.</p>
        <div className="space-y-1.5">
          <Label className="text-zinc-700">CSV Server Path</Label>
          <Input
            value={form.csv_server_path}
            onChange={(e) => setForm((f) => ({ ...f, csv_server_path: e.target.value }))}
            placeholder="\\server\share\worklists"
            className="bg-white border-zinc-300 text-zinc-950 placeholder:text-zinc-400 font-mono text-sm"
          />
          <p className="text-zinc-500 text-xs">Windows UNC path on the local server where output CSV files are saved.</p>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending} className="bg-blue-600 hover:bg-blue-700 min-w-28">
          {saveMutation.isPending ? "Saving…" : "Save Server Settings"}
        </Button>
      </div>
    </div>
  );
}

export default function AdminPortalPage() {
  const [tab, setTab] = useState<Tab>("users");

  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "filemaker", label: "FileMaker" },
    { key: "server", label: "Server" },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Admin Portal</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Manage users and system configuration</p>
      </div>

      <div className="flex border-b border-zinc-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-zinc-500 hover:text-zinc-950 hover:border-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "filemaker" && <FileMakerTab />}
      {tab === "server" && <ServerTab />}
    </div>
  );
}
