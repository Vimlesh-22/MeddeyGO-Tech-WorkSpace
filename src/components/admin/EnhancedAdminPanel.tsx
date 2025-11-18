"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Settings, Users, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminUnlockForm } from "@/components/admin/AdminUnlockForm";
import { UserManagement } from "@/components/admin/UserManagement";
import { ActivityLogs } from "@/components/admin/ActivityLogs";
import { AdminConfirmationForm } from "@/components/admin/AdminConfirmationForm";
import { ApplicationLoginManagement } from "@/components/admin/ApplicationLoginManagement";

type User = {
  id: number;
  email: string;
  displayName: string | null;
  role: string;
  emailVerified: boolean;
  adminConfirmed: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export function EnhancedAdminPanel({ adminEmail }: { adminEmail: string }) {
  const [unlocked, setUnlocked] = useState(false);
  const [disableTour, setDisableTour] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPreferences = useCallback(async () => {
    try {
      const response = await fetch('/api/user/preferences');
      if (response.ok) {
        const data = await response.json();
        setDisableTour(data.preferences?.disableWelcomeTour || false);
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!unlocked) return;
    
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/admin/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [unlocked]);

  const filterUsers = useCallback(() => {
    const filtered = users.filter(user => {
      // Search filter
      const matchesSearch = 
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.displayName && user.displayName.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Role filter
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      
      // Status filter
      const matchesStatus = 
        statusFilter === "all" ||
        (statusFilter === "verified" && user.emailVerified) ||
        (statusFilter === "unverified" && !user.emailVerified) ||
        (statusFilter === "confirmed" && user.adminConfirmed) ||
        (statusFilter === "pending" && !user.adminConfirmed);
      
      return matchesSearch && matchesRole && matchesStatus;
    });
    
    setFilteredUsers(filtered);
  }, [users, searchTerm, roleFilter, statusFilter]);

  useEffect(() => {
    fetchPreferences();
    if (unlocked) {
      fetchUsers();
    }
  }, [unlocked, fetchPreferences, fetchUsers]);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter, statusFilter, filterUsers]);

  const handleToggleTour = async () => {
    setSaving(true);
    try {
      const newValue = !disableTour;
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disableWelcomeTour: newValue }),
      });
      if (response.ok) {
        setDisableTour(newValue);
      }
    } catch (error) {
      console.error('Error updating preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkAction = async (action: string, userIds: number[]) => {
    try {
      const response = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userIds }),
      });
      
      if (response.ok) {
        fetchUsers(); // Refresh the user list
      }
    } catch (error) {
      console.error('Error performing bulk action:', error);
    }
  };

  const handleSendNotification = async (userIds: number[], notification: { title: string; content: string; type: string }) => {
    try {
      const response = await fetch('/api/admin/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, notification }),
      });
      
      if (response.ok) {
        alert('Notification sent successfully!');
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  const getStatusStats = () => {
    const total = users.length;
    const verified = users.filter(u => u.emailVerified).length;
    const confirmed = users.filter(u => u.adminConfirmed).length;
    const pending = users.filter(u => !u.adminConfirmed).length;
    const unverified = users.filter(u => !u.emailVerified).length;
    
    return { total, verified, confirmed, pending, unverified };
  };

  const stats = getStatusStats();

  return (
    <div className="space-y-6">
      {/* Admin Unlock Card */}
      <Card className="border-border/80 bg-card/70 backdrop-blur">
        <CardHeader className="flex flex-row items-center gap-3">
          <ShieldCheck className="size-6 text-primary" />
          <div>
            <CardTitle>Admin Console</CardTitle>
            <CardDescription>
              Verify your admin credentials to manage Meddey Tech Workspace users and audit activity logs.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <AdminUnlockForm
            adminEmail={adminEmail}
            unlocked={unlocked}
            onUnlocked={() => setUnlocked(true)}
          />
        </CardContent>
      </Card>

      {unlocked && (
        <div className="space-y-6">
          {/* User Statistics */}
          <Card className="border-border/80 bg-card/70 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" />
                User Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <div className="text-sm text-muted-foreground">Total Users</div>
                </div>
                <div className="text-center p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                  <div className="text-2xl font-bold text-green-800 dark:text-green-200">{stats.verified}</div>
                  <div className="text-sm text-green-600 dark:text-green-400">Verified</div>
                </div>
                <div className="text-center p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <div className="text-2xl font-bold text-blue-800 dark:text-blue-200">{stats.confirmed}</div>
                  <div className="text-sm text-blue-600 dark:text-blue-400">Confirmed</div>
                </div>
                <div className="text-center p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-800 dark:text-yellow-200">{stats.pending}</div>
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Pending</div>
                </div>
                <div className="text-center p-3 bg-red-100 dark:bg-red-900 rounded-lg">
                  <div className="text-2xl font-bold text-red-800 dark:text-red-200">{stats.unverified}</div>
                  <div className="text-sm text-red-600 dark:text-red-400">Unverified</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* User Management with Search and Filters */}
          <Card className="border-border/80 bg-card/70 backdrop-blur">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-5" />
                  User Management
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchUsers}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`size-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search and Filter Controls */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users by email or name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 border rounded-md bg-background"
                >
                  <option value="all">All Roles</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="dev">Developer</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border rounded-md bg-background"
                >
                  <option value="all">All Status</option>
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              
              <p className="text-sm text-muted-foreground">
                Showing {filteredUsers.length} of {users.length} users
              </p>
              
              <UserManagement 
                users={filteredUsers}
                onUsersChange={fetchUsers}
                onSendNotification={handleSendNotification}
                onBulkAction={handleBulkAction}
              />
            </CardContent>
          </Card>

          {/* Enhanced Admin Confirmation */}
          <AdminConfirmationForm adminEmail={adminEmail} onUsersChange={fetchUsers} />

          {/* Application Login Management */}
          <ApplicationLoginManagement />

          {/* Activity Logs */}
          <ActivityLogs />

          {/* Admin Preferences */}
          <Card className="border-border/80 bg-card/70 backdrop-blur">
            <CardHeader className="flex flex-row items-center gap-3">
              <Settings className="size-6 text-primary" />
              <div>
                <CardTitle>Admin Preferences</CardTitle>
                <CardDescription>
                  Manage your personal preferences and settings.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Disable Welcome Tour</p>
                  <p className="text-sm text-muted-foreground">
                    When enabled, the welcome tour will not be shown on first login or when new tools are added.
                  </p>
                </div>
                <Button
                  onClick={handleToggleTour}
                  disabled={loading || saving}
                  variant={disableTour ? "default" : "outline"}
                >
                  {loading ? "Loading..." : saving ? "Saving..." : disableTour ? "Enabled" : "Disabled"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}