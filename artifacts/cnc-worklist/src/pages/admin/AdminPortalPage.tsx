import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
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

type Tab = "users" | "settings";

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
  csv_server_path: string;
  worklist_start_number: string;
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
                    onClick={() => {
                      if (confirm(`Delete user "${u.username}"?`)) deleteMutation.mutate(u.id);
                    }}
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

function SettingsTab() {
  const { toast } = useToast();
  const [form, setForm] = useState<Settings>({
    filemaker_server_url: "",
    filemaker_database: "",
    filemaker_username: "",
    filemaker_password: "",
    csv_server_path: "",
    worklist_start_number: "1",
  });
  const [showFmPassword, setShowFmPassword] = useState(false);
  const [forceOverride, setForceOverride] = useState(false);
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery<Settings>({
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
      setForceOverride(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    const updates: Record<string, unknown> = { ...form };
    if (!updates.filemaker_password) delete updates.filemaker_password;
    if (forceOverride) updates.force_override = true;
    saveMutation.mutate(updates);
  }

  if (settingsLoading) {
    return <div className="text-zinc-400 text-center py-12">Loading...</div>;
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
                  Worklists exist — changing the start number requires enabling Force Reset below.
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
        <h2 className="text-zinc-950 font-semibold mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        </div>
      </Card>

      <Card className="bg-white border-zinc-200 p-6">
        <h2 className="text-zinc-950 font-semibold mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Worklist Settings
        </h2>
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
            <p className="text-zinc-500 text-xs">
              The number for the next worklist to be created.
            </p>
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
                Resets the sequence to the start number above. Existing worklists keep their numbers. Use with caution.
              </p>
            </div>
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
              Windows UNC path where CSV files are saved on the local server.
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
  );
}

export default function AdminPortalPage() {
  const [tab, setTab] = useState<Tab>("users");

  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "settings", label: "Settings" },
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
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}
