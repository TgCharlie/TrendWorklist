import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface User {
  id: number;
  username: string;
  role: "admin" | "operator";
  active: boolean;
  createdAt: string;
}

export default function UsersPage() {
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
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Users</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Manage workshop accounts</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-blue-600 hover:bg-blue-700">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </Button>
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-16">Loading...</div>
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
                    <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-xs">you</Badge>
                  )}
                  {!u.active && (
                    <Badge className="bg-red-900/50 text-red-300 border-0 text-xs">inactive</Badge>
                  )}
                </div>
                <p className="text-zinc-500 text-xs capitalize">{u.role}</p>
              </div>
              <Badge variant="outline" className={`border text-xs ${u.role === "admin" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-zinc-50 text-zinc-700 border-zinc-200"}`}>
                {u.role}
              </Badge>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(u)}
                  className="text-zinc-500 hover:text-zinc-950 transition-colors p-1.5"
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
                    className="text-zinc-500 hover:text-red-400 transition-colors p-1.5"
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
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v as "admin" | "operator" }))}
              >
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
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending}
            >
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
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as "admin" | "operator" }))}
              >
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
                const updates: Record<string, unknown> = {
                  role: editForm.role,
                  active: editForm.active,
                };
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
    </div>
  );
}
