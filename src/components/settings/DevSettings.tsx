"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Upload, Image as ImageIcon, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScheduleManagement } from "./ScheduleManagement";

type DevMessage = {
  id: number;
  title: string;
  content: string;
  targetRole: "user" | "admin" | "dev" | "all";
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
};

type DevImage = {
  id: number;
  name: string;
  fileUrl: string;
  description: string | null;
  createdAt: string;
};

export function DevSettings() {
  const [messages, setMessages] = useState<DevMessage[]>([]);
  const [images, setImages] = useState<DevImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newMessage, setNewMessage] = useState({
    title: "",
    content: "",
    targetRole: "all" as "user" | "admin" | "dev" | "all",
    isActive: true,
    expiresAt: "",
  });

  const [newImage, setNewImage] = useState<File | null>(null);
  const [imageDescription, setImageDescription] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [messagesRes, imagesRes] = await Promise.all([
        fetch("/api/settings/dev/messages"),
        fetch("/api/settings/dev/images"),
      ]);

      if (messagesRes.ok) {
        const messagesData = await messagesRes.json();
        setMessages(messagesData.messages || []);
      }

      if (imagesRes.ok) {
        const imagesData = await imagesRes.json();
        setImages(imagesData.images || []);
      }
    } catch (err) {
      console.error("Failed to load dev settings:", err);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMessage = async () => {
    if (!newMessage.title || !newMessage.content) {
      setError("Title and content are required");
      return;
    }

    try {
      const response = await fetch("/api/settings/dev/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newMessage,
          expiresAt: newMessage.expiresAt || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to create message");
        return;
      }

      setNewMessage({
        title: "",
        content: "",
        targetRole: "all",
        isActive: true,
        expiresAt: "",
      });
      await loadData();
      setError(null);
    } catch (err) {
      console.error("Failed to create message:", err);
      setError("Failed to create message");
    }
  };

  const handleDeleteMessage = async (id: number) => {
    if (!confirm("Are you sure you want to delete this message?")) return;

    try {
      const response = await fetch(`/api/settings/dev/messages?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("Failed to delete message");
        return;
      }

      await loadData();
    } catch (err) {
      console.error("Failed to delete message:", err);
      setError("Failed to delete message");
    }
  };

  const handleUploadImage = async () => {
    if (!newImage) {
      setError("Please select an image file");
      return;
    }

    const formData = new FormData();
    formData.append("file", newImage);
    formData.append("description", imageDescription);

    try {
      const response = await fetch("/api/upload?type=dev-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to upload image");
        return;
      }

      setNewImage(null);
      setImageDescription("");
      await loadData();
      setError(null);
    } catch (err) {
      console.error("Failed to upload image:", err);
      setError("Failed to upload image");
    }
  };

  const handleDeleteImage = async (id: number) => {
    if (!confirm("Are you sure you want to delete this image?")) return;

    try {
      const response = await fetch(`/api/settings/dev/images?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("Failed to delete image");
        return;
      }

      await loadData();
    } catch (err) {
      console.error("Failed to delete image:", err);
      setError("Failed to delete image");
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading dev settings...</div>;
  }

  return (
    <Tabs defaultValue="messages" className="w-full">
      <TabsList>
        <TabsTrigger value="messages">Messages</TabsTrigger>
        <TabsTrigger value="images">Images</TabsTrigger>
        <TabsTrigger value="schedules">
          <Calendar className="mr-2 size-4" />
          Schedules
        </TabsTrigger>
      </TabsList>

      {error && (
        <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <TabsContent value="messages">
      {/* Messages Section */}
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>Create and manage messages for role-based users</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-md border p-4">
            <h3 className="font-medium">Create New Message</h3>
            <Input
              placeholder="Message title"
              value={newMessage.title}
              onChange={(e) => setNewMessage({ ...newMessage, title: e.target.value })}
            />
            <textarea
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Message content"
              rows={4}
              value={newMessage.content}
              onChange={(e) => setNewMessage({ ...newMessage, content: e.target.value })}
            />
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm text-muted-foreground">Target Role</label>
                <select
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={newMessage.targetRole}
                  onChange={(e) =>
                    setNewMessage({
                      ...newMessage,
                      targetRole: e.target.value as "user" | "admin" | "dev" | "all",
                    })
                  }
                >
                  <option value="all">All Users</option>
                  <option value="user">Users Only</option>
                  <option value="admin">Admins Only</option>
                  <option value="dev">Devs Only</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={newMessage.isActive}
                  onChange={(e) => setNewMessage({ ...newMessage, isActive: e.target.checked })}
                />
                <label htmlFor="isActive" className="text-sm">
                  Active
                </label>
              </div>
            </div>
            <Button onClick={handleCreateMessage}>
              <Plus className="mr-2 size-4" />
              Create Message
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Existing Messages</h3>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{msg.title}</h4>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {msg.targetRole}
                        </span>
                        {msg.isActive && (
                          <span className="rounded-full bg-green-500/10 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{msg.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Created: {new Date(msg.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteMessage(msg.id)}
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

      <TabsContent value="images">
      {/* Images Section */}
      <Card>
        <CardHeader>
          <CardTitle>Media Library</CardTitle>
          <CardDescription>Upload images, videos, or provide YouTube links for user content</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-md border p-4">
            <h3 className="font-medium">Upload New Media</h3>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Upload Image or Video</label>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setNewImage(e.target.files?.[0] || null)}
                  className="w-full text-sm border border-border rounded-md p-2"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Or Provide YouTube URL</label>
                <Input
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={imageDescription}
                  onChange={(e) => setImageDescription(e.target.value)}
                />
              </div>
            </div>
            
            <Input
              placeholder="Description (optional)"
              value={imageDescription}
              onChange={(e) => setImageDescription(e.target.value)}
            />
            
            <div className="flex gap-2">
              <Button onClick={handleUploadImage} disabled={!newImage}>
                <Upload className="mr-2 size-4" />
                Upload File
              </Button>
              {imageDescription && imageDescription.includes('youtube') && (
                <Button onClick={handleUploadImage} variant="outline">
                  <ImageIcon className="mr-2 size-4" />
                  Save YouTube Link
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium">Uploaded Images</h3>
            {images.length === 0 ? (
              <p className="text-sm text-muted-foreground">No images yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {images.map((img) => (
                  <div key={img.id} className="relative rounded-md border">
                    <img
                      src={img.fileUrl}
                      alt={img.name}
                      className="h-32 w-full object-cover rounded-t-md"
                    />
                    <div className="p-2">
                      <p className="text-sm font-medium">{img.name}</p>
                      {img.description && (
                        <p className="text-xs text-muted-foreground">{img.description}</p>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2"
                        onClick={() => handleDeleteImage(img.id)}
                      >
                        <Trash2 className="mr-1 size-3" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="schedules">
        <ScheduleManagement />
      </TabsContent>
    </Tabs>
  );
}

