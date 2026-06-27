"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Users,
  UserPlus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  UserX,
  UserCheck,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useAppToast } from "@/hooks/use-app-toast";
import { useSortableTable } from "@/hooks/use-sortable-table";
import { SortableHeader } from "@/components/ui/sortable-header";
import { UserProfile, UserRole } from "@/lib/types/database";
import {
  getAllUsers,
  createUser,
  updateUserRole,
  toggleUserStatus,
} from "@/lib/api/auth";

const inputCls = "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) placeholder:text-(--text-faint) h-9";
const selectCls = "bg-(--bg-raise)/40 border-(--svf-border) text-(--text) h-9";
const labelCls = "text-xs font-semibold text-(--text-faint) uppercase tracking-wider";

const roleCfg: Record<UserRole, { label: string; cls: string }> = {
  admin:  { label: "Admin",  cls: "bg-red-500/15 text-red-500 border-red-500/30 dark:text-red-300" },
  legal:  { label: "Legal",  cls: "bg-violet-500/15 text-violet-600 border-violet-500/30 dark:text-violet-300" },
  editor: { label: "Editor", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-300" },
  viewer: { label: "Viewer", cls: "bg-(--bg-deep) text-(--text-faint) border-(--svf-border-strong)" },
};

const roleDescriptions: Record<UserRole, string> = {
  admin:  "Full system access, can manage users",
  legal:  "Can manage rights and legal documents",
  editor: "Can edit movies and metadata",
  viewer: "Read-only access to all data",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading, profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useAppToast();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "", full_name: "", employee_id: "",
    role: "viewer" as UserRole, department: "", password: "",
  });

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetUser, setResetUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) router.push("/");
  }, [authLoading, isAdmin, router]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setUsers(await getAllUsers());
      } catch {
        toast.error("Failed to load users");
      } finally {
        setLoading(false);
      }
    };
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  const generateTempPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
    let p = "";
    for (let i = 0; i < 12; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
    return p;
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setCreateError(null);
    try {
      await createUser(newUser.email, newUser.password, {
        full_name: newUser.full_name, employee_id: newUser.employee_id,
        role: newUser.role, department: newUser.department || undefined,
      });
      setCreateSuccess(true);
      setUsers(await getAllUsers());
      setTimeout(() => {
        setCreateDialogOpen(false); setCreateSuccess(false);
        setNewUser({ email: "", full_name: "", employee_id: "", role: "viewer", department: "", password: "" });
      }, 2000);
    } catch (err: unknown) {
      setCreateError((err as Error).message || "Failed to create user");
    } finally { setCreating(false); }
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    setResetting(true);
    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetUser.email, newPassword }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to reset password");
      }
      setResetSuccess(true);
      setTimeout(() => {
        setResetDialogOpen(false); setResetSuccess(false);
        setResetUser(null); setNewPassword("");
      }, 2000);
    } catch (err: unknown) {
      setCreateError((err as Error).message || "Failed to reset password");
    } finally { setResetting(false); }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setDeleting(true); setDeleteError(null);
    try {
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: deleteUser.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to delete user");
      setUsers(users.filter(u => u.id !== deleteUser.id));
      setDeleteDialogOpen(false);
      setDeleteUser(null);
    } catch (err: unknown) {
      setDeleteError((err as Error).message || "Failed to delete user");
    } finally { setDeleting(false); }
  };

  const handleToggleStatus = async (user: UserProfile) => {
    try {
      await toggleUserStatus(user.id, !user.is_active);
      setUsers(users.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    } catch { /* ignore */ }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRole(userId, newRole);
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch { /* ignore */ }
  };

  const { sortedData: sortedUsers, sortConfig, requestSort } = useSortableTable(users);

  const activeCount = users.filter(u => u.is_active).length;
  const adminCount  = users.filter(u => u.role === "admin").length;

  if (authLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-red-500/10 border border-red-500/30 max-w-md">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-300">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* ── Compact toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-3">
          <div className="rounded-[9px] bg-(--bg-raise) border border-(--svf-border) px-4 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) mb-0.5">Total</div>
            <div className="text-xl font-bold text-(--text) tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{users.length}</div>
          </div>
          <div className="rounded-[9px] bg-(--bg-raise) border border-(--svf-border) px-4 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) mb-0.5">Active</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{activeCount}</div>
          </div>
          <div className="rounded-[9px] bg-(--bg-raise) border border-(--svf-border) px-4 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) mb-0.5">Admins</div>
            <div className="text-xl font-bold text-violet-400 tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{adminCount}</div>
          </div>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="ml-auto bg-red-600 hover:bg-red-500 text-white border-0 shadow-lg shadow-red-900/30 h-9 gap-1.5">
              <UserPlus className="h-3.5 w-3.5" /> Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-125 bg-(--panel-solid) border-(--svf-border)">
            <DialogHeader>
              <DialogTitle className="text-(--text)">Create New User</DialogTitle>
              <DialogDescription className="text-(--text-faint)">
                Create a new user account with a temporary password
              </DialogDescription>
            </DialogHeader>

            {createSuccess ? (
              <div className="py-8 text-center space-y-4">
                <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto" />
                <div>
                  <p className="font-medium text-(--text)">User Created Successfully!</p>
                  <p className="text-sm text-(--text-faint) mt-1">They will need to change their password on first login.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateUser} className="space-y-4">
                {createError && (
                  <div className="flex items-start gap-3 px-4 py-3 rounded-[9px] bg-red-500/10 border border-red-500/30">
                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-300">{createError}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <label className={labelCls}>Full Name <span className="text-red-400">*</span></label>
                  <Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    placeholder="John Doe" required className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>Employee ID <span className="text-red-400">*</span></label>
                  <Input value={newUser.employee_id} onChange={(e) => setNewUser({ ...newUser, employee_id: e.target.value })}
                    placeholder="EMP-001" required className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>Email <span className="text-red-400">*</span></label>
                  <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="john@company.com" required className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className={labelCls}>Role <span className="text-red-400">*</span></label>
                    <Select value={newUser.role} onValueChange={(v: UserRole) => setNewUser({ ...newUser, role: v })}>
                      <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="legal">Legal</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-(--text-faint)">{roleDescriptions[newUser.role]}</p>
                  </div>
                  <div className="space-y-2">
                    <label className={labelCls}>Department</label>
                    <Input value={newUser.department} onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                      placeholder="Legal & Rights" className={inputCls} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className={labelCls}>Temporary Password <span className="text-red-400">*</span></label>
                    <Button type="button" variant="ghost" size="sm"
                      className="h-6 text-xs text-(--text-faint) hover:text-(--text) hover:bg-(--hover)"
                      onClick={() => setNewUser({ ...newUser, password: generateTempPassword() })}>
                      Generate
                    </Button>
                  </div>
                  <Input type="text" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Enter or generate a temporary password" required minLength={8} className={inputCls} />
                  <p className="text-xs text-(--text-faint)">User will be required to change this on first login</p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setCreateDialogOpen(false)}
                    className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}
                    className="bg-red-600 hover:bg-red-500 text-white border-0">
                    {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : "Create User"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Table ── */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-(--svf-border)" style={{ background: "var(--bg-deep)" }}>
          <div className="p-1.5 rounded-[7px] bg-violet-500/15 border border-violet-500/30">
            <ShieldCheck className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <span className="text-sm font-semibold text-(--text)">All Users</span>
          <span className="ml-auto text-xs text-(--text-faint)">
            {loading ? "Loading…" : `${users.length} user${users.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--svf-accent)" }} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader style={{ background: "var(--bg-deep)" }}>
                <TableRow className="border-(--svf-border) hover:bg-transparent">
                  <SortableHeader column="full_name" label="Name" currentSort={sortConfig} onSort={requestSort}
                    className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9" />
                  <SortableHeader column="employee_id" label="Employee ID" currentSort={sortConfig} onSort={requestSort}
                    className="hidden sm:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9" />
                  <SortableHeader column="email" label="Email" currentSort={sortConfig} onSort={requestSort}
                    className="hidden md:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9" />
                  <SortableHeader column="role" label="Role" currentSort={sortConfig} onSort={requestSort}
                    className="text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9" />
                  <SortableHeader column="department" label="Department" currentSort={sortConfig} onSort={requestSort}
                    className="hidden lg:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9" />
                  <SortableHeader column="is_active" label="Status" currentSort={sortConfig} onSort={requestSort}
                    className="hidden sm:table-cell text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9" />
                  <TableHead className="text-right text-[10px] font-bold uppercase tracking-widest text-(--text-faint) h-9">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.map((user) => (
                  <TableRow key={user.id} className="border-(--svf-border) hover:bg-(--hover) transition-colors">
                    <TableCell>
                      <span className="font-medium text-(--text)">{user.full_name || "—"}</span>
                      <span className="text-xs text-(--text-faint) block md:hidden">{user.email}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="font-mono text-sm text-(--text-dim)">{user.employee_id || "—"}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-(--text-dim) text-sm">{user.email}</TableCell>
                    <TableCell>
                      <Select value={user.role} onValueChange={(v: UserRole) => handleRoleChange(user.id, v)}>
                        <SelectTrigger className="w-28 h-7 bg-(--bg-raise) border-(--svf-border) text-(--text) text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="legal">Legal</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-(--text-dim) text-sm">{user.department || "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${user.is_active ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-(--bg-raise) text-(--text-faint) border-(--svf-border)"}`}>
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" title="Reset Password"
                          className="h-7 w-7 p-0 text-(--text-faint) hover:text-amber-400 hover:bg-amber-500/10"
                          onClick={() => { setResetUser(user); setNewPassword(generateTempPassword()); setResetDialogOpen(true); }}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        {user.id !== profile?.id && (
                          <>
                            <Button variant="ghost" size="sm"
                              title={user.is_active ? "Deactivate User" : "Activate User"}
                              className={`h-7 w-7 p-0 ${user.is_active ? "text-(--text-faint) hover:text-red-400 hover:bg-red-500/10" : "text-(--text-faint) hover:text-emerald-400 hover:bg-emerald-500/10"}`}
                              onClick={() => handleToggleStatus(user)}>
                              {user.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="ghost" size="sm" title="Delete User"
                              className="h-7 w-7 p-0 text-(--text-faint) hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => { setDeleteUser(user); setDeleteError(null); setDeleteDialogOpen(true); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Delete User Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeleteError(null); }}>
        <DialogContent className="sm:max-w-100 bg-(--panel-solid) border-(--svf-border)">
          <DialogHeader>
            <DialogTitle className="text-(--text) flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-400" /> Delete User
            </DialogTitle>
            <DialogDescription className="text-(--text-faint)">
              This action is permanent. The user&apos;s profile will be deleted. Any movies or records they created will have their author ID removed but their name will be preserved.
            </DialogDescription>
          </DialogHeader>

          <div className="px-1 py-2">
            <div className="rounded-[9px] bg-red-500/10 border border-red-500/30 px-4 py-3">
              <p className="text-sm text-red-300 font-medium">{deleteUser?.full_name || deleteUser?.email}</p>
              <p className="text-xs text-red-400/70 mt-0.5">{deleteUser?.email}</p>
            </div>
          </div>

          {deleteError && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-[9px] bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{deleteError}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}
              className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
              Cancel
            </Button>
            <Button onClick={handleDeleteUser} disabled={deleting}
              className="bg-red-600 hover:bg-red-500 text-white border-0">
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-100 bg-(--panel-solid) border-(--svf-border)">
          <DialogHeader>
            <DialogTitle className="text-(--text)">Reset Password</DialogTitle>
            <DialogDescription className="text-(--text-faint)">
              Set a new temporary password for {resetUser?.full_name || resetUser?.email}
            </DialogDescription>
          </DialogHeader>

          {resetSuccess ? (
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto" />
              <div>
                <p className="font-medium text-(--text)">Password Reset Successfully!</p>
                <p className="text-sm text-(--text-faint) mt-1">The user will need to change it on their next login.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={labelCls}>New Temporary Password</label>
                  <Button type="button" variant="ghost" size="sm"
                    className="h-6 text-xs text-(--text-faint) hover:text-(--text) hover:bg-(--hover)"
                    onClick={() => setNewPassword(generateTempPassword())}>
                    Regenerate
                  </Button>
                </div>
                <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  required className={inputCls} />
                <p className="text-xs text-(--text-faint)">Share this password securely with the user</p>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setResetDialogOpen(false)}
                  className="text-(--text-faint) hover:text-(--text) hover:bg-(--hover)">
                  Cancel
                </Button>
                <Button onClick={handleResetPassword} disabled={resetting}
                  className="bg-amber-600 hover:bg-amber-500 text-white border-0">
                  {resetting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting...</> : "Reset Password"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
