"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, Eye, EyeOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUserSummary } from "@/lib/auth/types";

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

type CreateUserForm = {
  email: string;
  password: string;
  role: "admin" | "user" | "dev";
  displayName: string;
  isActive: boolean;
};

const initialForm: CreateUserForm = {
  email: "",
  password: "",
  role: "user",
  displayName: "",
  isActive: true,
};

type UserFilter = "all" | "unverified" | "email_pending" | "admin_pending" | "verified";

export function UserManagement() {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateUserForm>(initialForm);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [filter, setFilter] = useState<UserFilter>("all");
  const usersPerPage = 10;

  const filterUsers = useCallback((userList: AdminUserSummary[], filterType: UserFilter) => {
    switch (filterType) {
      case "unverified":
        // Users who are missing either email verification OR admin confirmation
        return userList.filter((u) => !u.emailVerified || !u.adminConfirmed);
      case "email_pending":
        // Users who haven't verified their email yet
        return userList.filter((u) => !u.emailVerified);
      case "admin_pending":
        // Users who have verified email but awaiting admin confirmation
        return userList.filter((u) => u.emailVerified && !u.adminConfirmed);
      case "verified":
        // Fully verified users (both email and admin confirmed)
        return userList.filter((u) => u.emailVerified && u.adminConfirmed);
      case "all":
      default:
        return userList;
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to load users");
        return;
      }

      const body = (await response.json()) as { users: AdminUserSummary[] };
      setError(null);
      
      // Apply filter
      const filtered = filterUsers(body.users, filter);
      setTotalUsers(filtered.length);
      
      // Calculate pagination
      const startIndex = (currentPage - 1) * usersPerPage;
      const endIndex = startIndex + usersPerPage;
      setUsers(filtered.slice(startIndex, endIndex));
    } catch (loadError) {
      console.error("Load users error", loadError);
      setError("Unable to load users");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, filter, filterUsers]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleFormChange = (key: keyof CreateUserForm, value: string | boolean) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          role: form.role,
          displayName: form.displayName || null,
          isActive: form.isActive,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to create user");
        return;
      }

      setForm(initialForm);
      setCurrentPage(1); // Reset to first page after creating user
      await loadUsers();
    } catch (createError) {
      console.error("Create user error", createError);
      setError("Unable to create user");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const userToDelete = users.find(u => u.id === id);
    
    // Check if this is the last admin
    if (userToDelete?.role === "admin") {
      const adminCount = users.filter(u => u.role === "admin").length;
      if (adminCount <= 1) {
        setError("Cannot delete the last admin user. At least one admin must remain in the system.");
        return;
      }
    }
    
    if (!window.confirm("Remove this user?")) {
      return;
    }

    try {
      const response = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to delete user");
        return;
      }

      await loadUsers();
    } catch (deleteError) {
      console.error("Delete user error", deleteError);
      setError("Unable to delete user");
    }
  };

  const getFilterLabel = (filterType: UserFilter) => {
    switch (filterType) {
      case "unverified":
        return "Unverified Users (Need Finalization)";
      case "email_pending":
        return "Email Verification Pending";
      case "admin_pending":
        return "Admin Confirmation Pending";
      case "verified":
        return "Fully Verified Users";
      case "all":
      default:
        return "All Users";
    }
  };

  const handleFilterChange = (newFilter: UserFilter) => {
    setFilter(newFilter);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/70 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          User management
          {totalUsers > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({totalUsers} {filter === "all" ? "total" : "filtered"})
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => handleFilterChange(e.target.value as UserFilter)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="all">All Users</option>
            <option value="unverified">⚠️ Unverified (Need Finalization)</option>
            <option value="email_pending">📧 Email Pending</option>
            <option value="admin_pending">👤 Admin Pending</option>
            <option value="verified">✅ Fully Verified</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => loadUsers()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {filter !== "all" && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-300">
          <strong>Filter Active:</strong> {getFilterLabel(filter)}
          {filter === "unverified" && (
            <div className="mt-1 text-xs">
              Showing users who need finalization (missing email verification or admin confirmation)
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="new-email">
            Email
          </label>
          <Input
            id="new-email"
            type="email"
            required
            value={form.email}
            onChange={(event) => handleFormChange("email", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="new-password">
            Password
          </label>
          <Input
            id="new-password"
            type="password"
            required
            value={form.password}
            onChange={(event) => handleFormChange("password", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="new-display-name">
            Display name (optional)
          </label>
          <Input
            id="new-display-name"
            value={form.displayName}
            onChange={(event) => handleFormChange("displayName", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="new-role">
            Role
          </label>
          <select
            id="new-role"
            value={form.role}
            onChange={(event) => handleFormChange("role", event.target.value as "admin" | "user")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="new-active"
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => handleFormChange("isActive", event.target.checked)}
          />
          <label htmlFor="new-active" className="text-sm">
            Active user
          </label>
        </div>
      </div>

      <Button onClick={handleCreate} disabled={saving}>
        {saving ? "Creating…" : "Create user"}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : users.length === 0 && totalUsers === 0 ? (
        <p className="text-sm text-muted-foreground">No users found.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Display name</th>
                  <th className="px-3 py-2">Password</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Email verified</th>
                  <th className="px-3 py-2">Admin confirmed</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <UserRow key={user.id} user={user} onUpdated={loadUsers} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalUsers > usersPerPage && (
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * usersPerPage + 1} to{" "}
                {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} users
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || refreshing}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((prev) =>
                      Math.min(Math.ceil(totalUsers / usersPerPage), prev + 1),
                    )
                  }
                  disabled={currentPage >= Math.ceil(totalUsers / usersPerPage) || refreshing}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

type UserRowProps = {
  user: AdminUserSummary;
  onUpdated: () => Promise<void> | void;
  onDelete: (id: number) => void;
};

function UserRow({ user, onUpdated, onDelete }: UserRowProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [role, setRole] = useState<"admin" | "user" | "dev">(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [newPassword, setNewPassword] = useState("");
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [adminConfirmed, setAdminConfirmed] = useState(user.adminConfirmed);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [viewedPassword, setViewedPassword] = useState<string | null>(null);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDisplayName(user.displayName ?? "");
    setRole(user.role);
    setIsActive(user.isActive);
    setEmailVerified(user.emailVerified);
    setAdminConfirmed(user.adminConfirmed);
    setNewPassword("");
  }, [user.id, user.displayName, user.role, user.isActive, user.emailVerified, user.adminConfirmed]);

  const handleSave = async () => {
    const payload: Record<string, unknown> = { id: user.id };
    if (newPassword) {
      payload.password = newPassword;
    }
    const normalizedDisplayName = displayName.trim();
    if (normalizedDisplayName !== (user.displayName ?? "")) {
      payload.displayName = normalizedDisplayName || null;
    }
    if (role !== user.role) {
      payload.role = role;
    }
    if (isActive !== user.isActive) {
      payload.isActive = isActive;
    }
    if (emailVerified !== user.emailVerified) {
      payload.emailVerified = emailVerified;
    }
    if (adminConfirmed !== user.adminConfirmed) {
      payload.adminConfirmed = adminConfirmed;
    }

    if (Object.keys(payload).length === 1) {
      setError("No changes to save");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Unable to update user");
        return;
      }

  setNewPassword("");
  setError(null);
      await onUpdated();
    } catch (updateError) {
      console.error("Update user error", updateError);
      setError("Unable to update user");
    } finally {
      setSaving(false);
    }
  };

  const getVerificationStatus = (user: AdminUserSummary) => {
    if (user.emailVerified && user.adminConfirmed) {
      return { label: "Verified", className: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20" };
    }
    if (!user.emailVerified && !user.adminConfirmed) {
      return { label: "Needs Finalization", className: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20" };
    }
    if (!user.emailVerified) {
      return { label: "Email Pending", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/20" };
    }
    if (!user.adminConfirmed) {
      return { label: "Admin Pending", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20" };
    }
    return { label: "Unknown", className: "bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/20" };
  };

  return (
    <tr className="text-sm">
      <td className="px-3 py-2 align-top">
        {(() => {
          const status = getVerificationStatus(user);
          return (
            <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
          );
        })()}
      </td>
      <td className="px-3 py-2 align-top font-medium">{user.email}</td>
      <td className="px-3 py-2 align-top">
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2">
          {passwordVisible && viewedPassword ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">{viewedPassword}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(viewedPassword);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch (err) {
                    console.error("Failed to copy:", err);
                  }
                }}
                className="h-6 w-6 p-0"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPasswordVisible(false);
                  setViewedPassword(null);
                }}
                className="h-6 w-6 p-0"
              >
                <EyeOff className="size-3" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                setLoadingPassword(true);
                try {
                  const response = await fetch(`/api/users/${user.id}/password`);
                  if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    setError(body?.error ?? "Unable to view password");
                    return;
                  }
                  const data = await response.json();
                  setViewedPassword(data.password || "Not set");
                  setPasswordVisible(true);
                } catch (err) {
                  console.error("Failed to fetch password:", err);
                  setError("Unable to view password");
                } finally {
                  setLoadingPassword(false);
                }
              }}
              disabled={loadingPassword}
              className="h-8"
            >
              <Eye className="mr-1 size-3" />
              {loadingPassword ? "Loading..." : "View Password"}
            </Button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as "admin" | "user" | "dev")}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
          <option value="dev">Dev</option>
        </select>
      </td>
      <td className="px-3 py-2 align-top">
        <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
      </td>
      <td className="px-3 py-2 align-top">
        <input
          type="checkbox"
          checked={emailVerified}
          onChange={(event) => setEmailVerified(event.target.checked)}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <input
          type="checkbox"
          checked={adminConfirmed}
          onChange={(event) => setAdminConfirmed(event.target.checked)}
        />
      </td>
      <td className="px-3 py-2 align-top text-muted-foreground">{formatDate(user.createdAt)}</td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-2">
          <Input
            placeholder="New password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            type="password"
          />
          {error && <span className="text-xs text-destructive">{error}</span>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onDelete(user.id)}
              type="button"
            >
              <Trash2 className="mr-1 size-4" />
              Remove
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
