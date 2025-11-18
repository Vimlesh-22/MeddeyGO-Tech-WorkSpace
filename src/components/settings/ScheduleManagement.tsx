"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, Upload, Calendar, MessageSquare, Image, Video, Settings } from "lucide-react";
import { projects } from "@/data/projects";

type ToolSchedule = {
  id: number;
  toolId: string;
  toolName: string;
  openAt: string;
  closeAt: string | null;
  isActive: boolean;
  surpriseMessage: string | null;
  customMessage: string | null;
};

type SurpriseMessage = {
  id: number;
  message: string;
  toolId: string | null;
};

type ScheduledBanner = {
  id: number;
  name: string;
  fileUrl: string;
  targetRole: string;
  scheduledAt: string;
  scheduledUntil: string | null;
  isActive: boolean;
};

type Tutorial = {
  id: number;
  toolId: string;
  toolName: string;
  title: string;
  description: string | null;
  videoFileUrl: string | null;
  displayOrder: number;
};

export function ScheduleManagement() {
  const [schedules, setSchedules] = useState<ToolSchedule[]>([]);
  const [surpriseMessages, setSurpriseMessages] = useState<SurpriseMessage[]>([]);
  const [scheduledBanners, setScheduledBanners] = useState<ScheduledBanner[]>([]);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [tutorialSettings, setTutorialSettings] = useState({ tutorialsEnabled: "true" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newSchedule, setNewSchedule] = useState({
    toolId: "",
    openAt: "",
    closeAt: "",
    surpriseMessage: "",
    customMessage: "",
    isActive: true,
  });

  const [newSurpriseMessage, setNewSurpriseMessage] = useState({
    message: "",
    toolId: "",
  });

  const [newBanner, setNewBanner] = useState<File | null>(null);
  const [bannerData, setBannerData] = useState({
    name: "",
    targetRole: "all",
    scheduledAt: "",
    scheduledUntil: "",
  });

  const [newTutorial, setNewTutorial] = useState({
    toolId: "",
    title: "",
    description: "",
    displayOrder: 0,
  });
  const [tutorialFile, setTutorialFile] = useState<File | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [schedulesRes, messagesRes, bannersRes, settingsRes] = await Promise.all([
        fetch("/api/settings/dev/schedules"),
        fetch("/api/settings/dev/surprise-messages"),
        fetch("/api/settings/dev/scheduled-banners"),
        fetch("/api/settings/dev/tutorial-settings"),
      ]);

      if (schedulesRes.ok) {
        const data = await schedulesRes.json();
        setSchedules(data.schedules || []);
      }

      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setSurpriseMessages(data.messages || []);
      }

      if (bannersRes.ok) {
        const data = await bannersRes.json();
        setScheduledBanners(data.banners || []);
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setTutorialSettings(data.settings || { tutorialsEnabled: "true" });
      }
    } catch (err) {
      console.error("Failed to load schedule data:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!newSchedule.toolId || !newSchedule.openAt) {
      setError("Tool and open time are required");
      return;
    }

    const tool = projects.find((p) => p.id === newSchedule.toolId);
    if (!tool) {
      setError("Invalid tool selected");
      return;
    }

    try {
      const response = await fetch("/api/settings/dev/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolId: newSchedule.toolId,
          toolName: tool.name,
          openAt: newSchedule.openAt,
          closeAt: newSchedule.closeAt || null,
          isActive: newSchedule.isActive,
          surpriseMessage: newSchedule.surpriseMessage || null,
          customMessage: newSchedule.customMessage || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to create schedule");
        return;
      }

      setNewSchedule({
        toolId: "",
        openAt: "",
        closeAt: "",
        surpriseMessage: "",
        customMessage: "",
        isActive: true,
      });
      await loadData();
      setError(null);
    } catch (err) {
      console.error("Failed to create schedule:", err);
      setError("Failed to create schedule");
    }
  };

  const handleCreateSurpriseMessage = async () => {
    if (!newSurpriseMessage.message) {
      setError("Message is required");
      return;
    }

    try {
      const response = await fetch("/api/settings/dev/surprise-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newSurpriseMessage.message,
          toolId: newSurpriseMessage.toolId || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to create message");
        return;
      }

      setNewSurpriseMessage({ message: "", toolId: "" });
      await loadData();
      setError(null);
    } catch (err) {
      console.error("Failed to create surprise message:", err);
      setError("Failed to create message");
    }
  };

  const handleUploadBanner = async () => {
    if (!newBanner || !bannerData.name || !bannerData.scheduledAt) {
      setError("Banner file, name, and schedule time are required");
      return;
    }

    const formData = new FormData();
    formData.append("file", newBanner);
    formData.append("name", bannerData.name);
    formData.append("targetRole", bannerData.targetRole);
    formData.append("scheduledAt", bannerData.scheduledAt);
    if (bannerData.scheduledUntil) {
      formData.append("scheduledUntil", bannerData.scheduledUntil);
    }

    try {
      const response = await fetch("/api/settings/dev/scheduled-banners", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to upload banner");
        return;
      }

      setNewBanner(null);
      setBannerData({ name: "", targetRole: "all", scheduledAt: "", scheduledUntil: "" });
      await loadData();
      setError(null);
    } catch (err) {
      console.error("Failed to upload banner:", err);
      setError("Failed to upload banner");
    }
  };

  const handleUploadTutorial = async () => {
    if (!tutorialFile || !newTutorial.toolId || !newTutorial.title) {
      setError("Video file, tool, and title are required");
      return;
    }

    const formData = new FormData();
    formData.append("file", tutorialFile);
    formData.append("title", newTutorial.title);
    formData.append("description", newTutorial.description);
    formData.append("displayOrder", String(newTutorial.displayOrder));

    try {
      const response = await fetch(`/api/tools/${newTutorial.toolId}/tutorials`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to upload tutorial");
        return;
      }

      setTutorialFile(null);
      setNewTutorial({ toolId: "", title: "", description: "", displayOrder: 0 });
      await loadData();
      setError(null);
    } catch (err) {
      console.error("Failed to upload tutorial:", err);
      setError("Failed to upload tutorial");
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    try {
      await fetch(`/api/settings/dev/schedules?id=${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError("Failed to delete schedule");
    }
  };

  const handleDeleteSurpriseMessage = async (id: number) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      await fetch(`/api/settings/dev/surprise-messages?id=${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError("Failed to delete message");
    }
  };

  const handleDeleteBanner = async (id: number) => {
    if (!confirm("Are you sure you want to delete this banner?")) return;
    try {
      await fetch(`/api/settings/dev/scheduled-banners?id=${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError("Failed to delete banner");
    }
  };

  const handleDeleteTutorial = async (toolId: string, tutorialId: number) => {
    if (!confirm("Are you sure you want to delete this tutorial?")) return;
    try {
      await fetch(`/api/tools/${toolId}/tutorials?tutorialId=${tutorialId}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError("Failed to delete tutorial");
    }
  };

  const handleToggleTutorials = async (enabled: boolean) => {
    try {
      await fetch("/api/settings/dev/tutorial-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "tutorialsEnabled",
          value: enabled ? "true" : "false",
        }),
      });
      setTutorialSettings({ ...tutorialSettings, tutorialsEnabled: enabled ? "true" : "false" });
    } catch (err) {
      setError("Failed to update tutorial settings");
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading schedule management...</div>;
  }

  return (
    <Tabs defaultValue="schedules" className="w-full">
      <TabsList>
        <TabsTrigger value="schedules">
          <Calendar className="mr-2 size-4" />
          Tool Schedules
        </TabsTrigger>
        <TabsTrigger value="surprise">
          <MessageSquare className="mr-2 size-4" />
          Surprise Messages
        </TabsTrigger>
        <TabsTrigger value="banners">
          <Image className="mr-2 size-4" />
          Scheduled Banners
        </TabsTrigger>
        <TabsTrigger value="tutorials">
          <Video className="mr-2 size-4" />
          Tutorials
        </TabsTrigger>
        <TabsTrigger value="settings">
          <Settings className="mr-2 size-4" />
          Tutorial Settings
        </TabsTrigger>
      </TabsList>

      {error && (
        <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <TabsContent value="schedules">
        <Card>
          <CardHeader>
            <CardTitle>Tool Schedules</CardTitle>
            <CardDescription>Schedule when tools should open/close</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">Create New Schedule</h3>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={newSchedule.toolId}
                onChange={(e) => setNewSchedule({ ...newSchedule, toolId: e.target.value })}
              >
                <option value="">Select Tool</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Input
                type="datetime-local"
                placeholder="Open At"
                value={newSchedule.openAt}
                onChange={(e) => setNewSchedule({ ...newSchedule, openAt: e.target.value })}
              />
              <Input
                type="datetime-local"
                placeholder="Close At (optional)"
                value={newSchedule.closeAt}
                onChange={(e) => setNewSchedule({ ...newSchedule, closeAt: e.target.value })}
              />
              <Input
                placeholder="Surprise Message (optional)"
                value={newSchedule.surpriseMessage}
                onChange={(e) => setNewSchedule({ ...newSchedule, surpriseMessage: e.target.value })}
              />
              <Input
                placeholder="Custom Message (optional)"
                value={newSchedule.customMessage}
                onChange={(e) => setNewSchedule({ ...newSchedule, customMessage: e.target.value })}
              />
              <Button onClick={handleCreateSchedule}>
                <Plus className="mr-2 size-4" />
                Create Schedule
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Existing Schedules</h3>
              {schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No schedules yet</p>
              ) : (
                schedules.map((schedule) => (
                  <div key={schedule.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{schedule.toolName}</h4>
                        <p className="text-sm text-muted-foreground">
                          Opens: {new Date(schedule.openAt).toLocaleString()}
                        </p>
                        {schedule.closeAt && (
                          <p className="text-sm text-muted-foreground">
                            Closes: {new Date(schedule.closeAt).toLocaleString()}
                          </p>
                        )}
                        {schedule.surpriseMessage && (
                          <p className="mt-1 text-sm">Surprise: {schedule.surpriseMessage}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteSchedule(schedule.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="surprise">
        <Card>
          <CardHeader>
            <CardTitle>Surprise Messages</CardTitle>
            <CardDescription>Create random messages for surprise cards</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">Create New Surprise Message</h3>
              <textarea
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Surprise message"
                rows={3}
                value={newSurpriseMessage.message}
                onChange={(e) =>
                  setNewSurpriseMessage({ ...newSurpriseMessage, message: e.target.value })
                }
              />
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={newSurpriseMessage.toolId}
                onChange={(e) =>
                  setNewSurpriseMessage({ ...newSurpriseMessage, toolId: e.target.value })
                }
              >
                <option value="">All Tools</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button onClick={handleCreateSurpriseMessage}>
                <Plus className="mr-2 size-4" />
                Create Message
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Existing Messages</h3>
              {surpriseMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet</p>
              ) : (
                surpriseMessages.map((msg) => (
                  <div key={msg.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between">
                      <p className="flex-1 text-sm">{msg.message}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteSurpriseMessage(msg.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="banners">
        <Card>
          <CardHeader>
            <CardTitle>Scheduled Banners</CardTitle>
            <CardDescription>Schedule banners for specific times and roles</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">Upload Scheduled Banner</h3>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setNewBanner(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <Input
                placeholder="Banner name"
                value={bannerData.name}
                onChange={(e) => setBannerData({ ...bannerData, name: e.target.value })}
              />
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={bannerData.targetRole}
                onChange={(e) => setBannerData({ ...bannerData, targetRole: e.target.value })}
              >
                <option value="all">All Users</option>
                <option value="user">Users Only</option>
                <option value="admin">Admins Only</option>
                <option value="dev">Devs Only</option>
              </select>
              <Input
                type="datetime-local"
                placeholder="Schedule At"
                value={bannerData.scheduledAt}
                onChange={(e) => setBannerData({ ...bannerData, scheduledAt: e.target.value })}
              />
              <Input
                type="datetime-local"
                placeholder="Schedule Until (optional)"
                value={bannerData.scheduledUntil}
                onChange={(e) => setBannerData({ ...bannerData, scheduledUntil: e.target.value })}
              />
              <Button onClick={handleUploadBanner} disabled={!newBanner}>
                <Upload className="mr-2 size-4" />
                Upload Banner
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="font-medium">Scheduled Banners</h3>
              {scheduledBanners.length === 0 ? (
                <p className="text-sm text-muted-foreground">No banners yet</p>
              ) : (
                scheduledBanners.map((banner) => (
                  <div key={banner.id} className="rounded-md border p-3">
                    <img src={banner.fileUrl} alt={banner.name} className="mb-2 h-24 w-full object-cover rounded-md" />
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{banner.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Scheduled: {new Date(banner.scheduledAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteBanner(banner.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tutorials">
        <Card>
          <CardHeader>
            <CardTitle>Tool Tutorials</CardTitle>
            <CardDescription>Upload tutorial videos for tools</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">Upload Tutorial Video</h3>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={newTutorial.toolId}
                onChange={(e) => setNewTutorial({ ...newTutorial, toolId: e.target.value })}
              >
                <option value="">Select Tool</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => setTutorialFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <Input
                placeholder="Tutorial title"
                value={newTutorial.title}
                onChange={(e) => setNewTutorial({ ...newTutorial, title: e.target.value })}
              />
              <Input
                placeholder="Description (optional)"
                value={newTutorial.description}
                onChange={(e) => setNewTutorial({ ...newTutorial, description: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Display Order"
                value={newTutorial.displayOrder}
                onChange={(e) =>
                  setNewTutorial({ ...newTutorial, displayOrder: parseInt(e.target.value) || 0 })
                }
              />
              <Button onClick={handleUploadTutorial} disabled={!tutorialFile}>
                <Upload className="mr-2 size-4" />
                Upload Tutorial
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="settings">
        <Card>
          <CardHeader>
            <CardTitle>Tutorial Settings</CardTitle>
            <CardDescription>Manage tutorial system settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-4">
              <div>
                <h3 className="font-medium">Enable Tutorials</h3>
                <p className="text-sm text-muted-foreground">
                  Show tutorial section on tool cards for all users
                </p>
              </div>
              <input
                type="checkbox"
                checked={tutorialSettings.tutorialsEnabled === "true"}
                onChange={(e) => handleToggleTutorials(e.target.checked)}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

