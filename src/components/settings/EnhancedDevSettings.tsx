"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Upload, Image as ImageIcon, Calendar, Mail, Bell, Users, Info, Eye, EyeOff, X, MessageSquare, Video, BarChart3 } from "lucide-react";
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
  deliveryMethod: "in-app" | "email" | "both";
  priority: "low" | "medium" | "high";
  imageUrl?: string;
  videoUrl?: string;
  type: "message" | "banner" | "video";
};

type DevImage = {
  id: number;
  name: string;
  fileUrl: string;
  description: string | null;
  createdAt: string;
};

type PollOption = {
  id: string;
  text: string;
  votes: number;
};

type Poll = {
  id: number;
  title: string;
  description: string | null;
  options: PollOption[];
  isActive: boolean;
  allowMultipleVotes: boolean;
  targetRole: "user" | "admin" | "dev" | "all";
  createdAt: string;
  expiresAt: string | null;
  totalVotes: number;
};

export function EnhancedDevSettings() {
  const [messages, setMessages] = useState<DevMessage[]>([]);
  const [images, setImages] = useState<DevImage[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [tutorialSettings, setTutorialSettings] = useState<Record<string, string | null>>({});

  const [newMessage, setNewMessage] = useState({
    title: "",
    content: "",
    targetRole: "all" as "user" | "admin" | "dev" | "all",
    isActive: true,
    expiresAt: "",
    deliveryMethod: "in-app" as "in-app" | "email" | "both",
    priority: "medium" as "low" | "medium" | "high",
    imageUrl: "",
    videoUrl: "",
    type: "message" as "message" | "banner" | "video",
  });

  const [newImage, setNewImage] = useState<File | null>(null);
  const [imageDescription, setImageDescription] = useState("");

  const [newPoll, setNewPoll] = useState({
    title: "",
    description: "",
    options: ["", ""],
    isActive: true,
    allowMultipleVotes: false,
    targetRole: "all" as "user" | "admin" | "dev" | "all",
    expiresAt: "",
  });

  useEffect(() => {
    loadData();
    loadTutorialSettings();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [messagesRes, imagesRes, pollsRes] = await Promise.all([
        fetch("/api/settings/dev/messages"),
        fetch("/api/settings/dev/images"),
        fetch("/api/settings/dev/polls"),
      ]);

      if (messagesRes.ok) {
        const messagesData = await messagesRes.json();
        setMessages(messagesData.messages || []);
      }

      if (imagesRes.ok) {
        const imagesData = await imagesRes.json();
        setImages(imagesData.images || []);
      }

      if (pollsRes.ok) {
        const pollsData = await pollsRes.json();
        setPolls(pollsData.polls || []);
      }
    } catch (err) {
      console.error("Failed to load dev settings:", err);
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const loadTutorialSettings = async () => {
    try {
      const settingsRes = await fetch("/api/settings/dev/tutorial-settings");
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setTutorialSettings(settingsData.settings || {});
      }
    } catch (err) {
      console.error("Failed to load tutorial settings:", err);
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
          imageUrl: newMessage.imageUrl || null,
          videoUrl: newMessage.videoUrl || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to create message");
        return;
      }

      // Reset form
      setNewMessage({
        title: "",
        content: "",
        targetRole: "all",
        isActive: true,
        expiresAt: "",
        deliveryMethod: "in-app",
        priority: "medium",
        imageUrl: "",
        videoUrl: "",
        type: "message",
      });
      
      await loadData();
      setError(null);
      
      // Show success message
      alert("Message created successfully!");
    } catch (err) {
      console.error("Failed to create message:", err);
      setError("Failed to create message");
    }
  };

  const handlePreviewMessage = () => {
    if (!newMessage.title || !newMessage.content) {
      setError("Title and content are required for preview");
      return;
    }
    setPreviewMode(true);
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

  const handleTutorialSettingChange = async (key: string, value: string) => {
    try {
      const response = await fetch("/api/settings/dev/tutorial-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });

      if (!response.ok) {
        setError("Failed to update tutorial setting");
        return;
      }

      setTutorialSettings(prev => ({ ...prev, [key]: value }));
    } catch (err) {
      console.error("Failed to update tutorial setting:", err);
      setError("Failed to update tutorial setting");
    }
  };

  const handleCreatePoll = async () => {
    if (!newPoll.title || newPoll.options.filter(opt => opt.trim()).length < 2) {
      setError("Title and at least 2 options are required");
      return;
    }

    try {
      const response = await fetch("/api/settings/dev/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newPoll,
          options: newPoll.options.filter(opt => opt.trim()),
          expiresAt: newPoll.expiresAt || null,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to create poll");
        return;
      }

      // Reset form
      setNewPoll({
        title: "",
        description: "",
        options: ["", ""],
        isActive: true,
        allowMultipleVotes: false,
        targetRole: "all",
        expiresAt: "",
      });
      
      await loadData();
      setError(null);
      
      // Show success message
      alert("Poll created successfully!");
    } catch (err) {
      console.error("Failed to create poll:", err);
      setError("Failed to create poll");
    }
  };

  const handleDeletePoll = async (id: number) => {
    if (!confirm("Are you sure you want to delete this poll? This will also delete all votes.")) return;

    try {
      const response = await fetch(`/api/settings/dev/polls?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("Failed to delete poll");
        return;
      }

      await loadData();
    } catch (err) {
      console.error("Failed to delete poll:", err);
      setError("Failed to delete poll");
    }
  };

  const addPollOption = () => {
    setNewPoll(prev => ({ ...prev, options: [...prev.options, ""] }));
  };

  const removePollOption = (index: number) => {
    if (newPoll.options.length <= 2) {
      setError("Poll must have at least 2 options");
      return;
    }
    setNewPoll(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const updatePollOption = (index: number, value: string) => {
    setNewPoll(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => i === index ? value : opt)
    }));
  };

  const getDeliveryMethodIcon = (method: string) => {
    switch (method) {
      case "in-app": return <Bell className="size-3" />;
      case "email": return <Mail className="size-3" />;
      case "both": return <Users className="size-3" />;
      default: return <Bell className="size-3" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "low": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "message": return <MessageSquare className="size-3" />;
      case "banner": return <ImageIcon className="size-3" />;
      case "video": return <Video className="size-3" />;
      default: return <MessageSquare className="size-3" />;
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading dev settings...</div>;
  }

  return (
    <>
      {/* Preview Modal */}
      {previewMode && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Message Preview</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewMode(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {getTypeIcon(newMessage.type)}
                  <span className="font-medium">{newMessage.title}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(newMessage.priority)}`}>
                    {newMessage.priority}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{newMessage.content}</p>
                {newMessage.imageUrl && (
                  <img src={newMessage.imageUrl} alt="Preview" className="w-full h-32 object-cover rounded" />
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Delivery: {newMessage.deliveryMethod}</span>
                  <span>•</span>
                  <span>Target: {newMessage.targetRole}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="messages" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="messages">
            <Bell className="mr-2 size-4" />
            Messages
          </TabsTrigger>
          <TabsTrigger value="images">
            <ImageIcon className="mr-2 size-4" />
            Media
          </TabsTrigger>
          <TabsTrigger value="polls">
            <BarChart3 className="mr-2 size-4" />
            Polls
          </TabsTrigger>
          <TabsTrigger value="schedules">
            <Calendar className="mr-2 size-4" />
            Schedules
          </TabsTrigger>
          <TabsTrigger value="tutorials">
            <Eye className="mr-2 size-4" />
            Tutorials
          </TabsTrigger>
        </TabsList>

        {error && (
          <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <TabsContent value="messages">
          <Card>
            <CardHeader>
              <CardTitle>Developer Messages</CardTitle>
              <CardDescription>
                Create and manage messages for role-based users with delivery method selection. 
                Choose between in-app notifications, email, or both.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Create New Message Form */}
              <div className="space-y-4 rounded-md border p-4 bg-gradient-to-br from-muted/30 to-muted/50">
                <h3 className="font-medium flex items-center gap-2 text-lg">
                  <Plus className="size-5" />
                  Create New Message
                </h3>
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <Input
                      placeholder="Message title"
                      value={newMessage.title}
                      onChange={(e) => setNewMessage({ ...newMessage, title: e.target.value })}
                      className="border-2"
                    />
                    <textarea
                      className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm min-h-[100px]"
                      placeholder="Message content"
                      rows={4}
                      value={newMessage.content}
                      onChange={(e) => setNewMessage({ ...newMessage, content: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1 block">Message Type</label>
                      <select
                        className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm"
                        value={newMessage.type}
                        onChange={(e) =>
                          setNewMessage({
                            ...newMessage,
                            type: e.target.value as "message" | "banner" | "video",
                          })
                        }
                      >
                        <option value="message">💬 Text Message</option>
                        <option value="banner">🖼️ Banner with Image</option>
                        <option value="video">🎥 Video Message</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1 block">Target Role</label>
                      <select
                        className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm"
                        value={newMessage.targetRole}
                        onChange={(e) =>
                          setNewMessage({
                            ...newMessage,
                            targetRole: e.target.value as "user" | "admin" | "dev" | "all",
                          })
                        }
                      >
                        <option value="all">👥 All Users</option>
                        <option value="user">👤 Users Only</option>
                        <option value="admin">🔧 Admins Only</option>
                        <option value="dev">💻 Devs Only</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1 block">
                        Delivery Method
                      </label>
                      <select
                        className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm"
                        value={newMessage.deliveryMethod}
                        onChange={(e) =>
                          setNewMessage({
                            ...newMessage,
                            deliveryMethod: e.target.value as "in-app" | "email" | "both",
                          })
                        }
                      >
                        <option value="in-app">
                          🔔 In-App Notification Only
                        </option>
                        <option value="email">
                          📧 Email Only
                        </option>
                        <option value="both">
                          📧🔔 Both In-App & Email
                        </option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1 block">Priority Level</label>
                      <select
                        className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm"
                        value={newMessage.priority}
                        onChange={(e) =>
                          setNewMessage({
                            ...newMessage,
                            priority: e.target.value as "low" | "medium" | "high",
                          })
                        }
                      >
                        <option value="low">🟢 Low Priority</option>
                        <option value="medium">🟡 Medium Priority</option>
                        <option value="high">🔴 High Priority</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                {/* Media URLs */}
                {(newMessage.type === "banner" || newMessage.type === "video") && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      placeholder="Image URL (for banner messages)"
                      value={newMessage.imageUrl}
                      onChange={(e) => setNewMessage({ ...newMessage, imageUrl: e.target.value })}
                      className="border-2"
                    />
                    <Input
                      placeholder="Video URL (for video messages)"
                      value={newMessage.videoUrl}
                      onChange={(e) => setNewMessage({ ...newMessage, videoUrl: e.target.value })}
                      className="border-2"
                    />
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={newMessage.isActive}
                      onChange={(e) => setNewMessage({ ...newMessage, isActive: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="isActive" className="text-sm font-medium">
                      Active immediately
                    </label>
                  </div>
                  
                  <Input
                    type="datetime-local"
                    placeholder="Expires at (optional)"
                    value={newMessage.expiresAt}
                    onChange={(e) => setNewMessage({ ...newMessage, expiresAt: e.target.value })}
                    className="flex-1 min-w-[200px] border-2"
                  />
                  
                  <div className="flex gap-2 ml-auto">
                    <Button 
                      variant="outline" 
                      onClick={handlePreviewMessage}
                      disabled={!newMessage.title || !newMessage.content}
                    >
                      <Eye className="mr-2 size-4" />
                      Preview
                    </Button>
                    <Button onClick={handleCreateMessage}>
                      <Plus className="mr-2 size-4" />
                      Create Message
                    </Button>
                  </div>
                </div>
              </div>

              {/* Existing Messages */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-lg">Existing Messages</h3>
                  <span className="text-sm text-muted-foreground">
                    {messages.length} message{messages.length !== 1 ? 's' : ''}
                  </span>
                </div>
                
                {messages.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <Bell className="mx-auto size-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                    <p className="text-xs text-muted-foreground">Create your first message above</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => (
                      <div key={msg.id} className="rounded-lg border-2 p-4 hover:bg-muted/30 transition-all">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            {/* Message Header */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1">
                                {getTypeIcon(msg.type)}
                                <h4 className="font-semibold">{msg.title}</h4>
                              </div>
                              
                              <div className="flex items-center gap-1">
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                  {msg.targetRole}
                                </span>
                                
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getPriorityColor(msg.priority)}`}>
                                  {msg.priority}
                                </span>
                                
                                <span className="rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 text-xs font-medium flex items-center gap-1">
                                  {getDeliveryMethodIcon(msg.deliveryMethod)}
                                  {msg.deliveryMethod}
                                </span>
                                
                                {msg.isActive ? (
                                  <span className="rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 text-xs font-medium">
                                    ✓ Active
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 px-2 py-0.5 text-xs font-medium">
                                    ✗ Inactive
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Message Content */}
                            <p className="text-sm text-muted-foreground leading-relaxed">{msg.content}</p>
                            
                            {/* Media Indicators */}
                            {(msg.imageUrl || msg.videoUrl) && (
                              <div className="flex gap-2">
                                {msg.imageUrl && (
                                  <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-1 rounded font-medium flex items-center gap-1">
                                    <ImageIcon className="size-3" />
                                    Has Image
                                  </span>
                                )}
                                {msg.videoUrl && (
                                  <span className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 px-2 py-1 rounded font-medium flex items-center gap-1">
                                    <Video className="size-3" />
                                    Has Video
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {/* Message Metadata */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Created: {new Date(msg.createdAt).toLocaleString()}</span>
                              {msg.expiresAt && (
                                <span className="text-orange-600 dark:text-orange-400">
                                  Expires: {new Date(msg.expiresAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Delete Button */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <Trash2 className="size-4" />
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

        <TabsContent value="images">
          <Card>
            <CardHeader>
              <CardTitle>Media Library</CardTitle>
              <CardDescription>Upload and manage images for dev messages and banners</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-md border-2 p-4 bg-muted/30">
                <h3 className="font-medium">Upload New Image</h3>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewImage(e.target.files?.[0] || null)}
                  className="w-full text-sm border rounded-md p-2"
                />
                <Input
                  placeholder="Image description (optional)"
                  value={imageDescription}
                  onChange={(e) => setImageDescription(e.target.value)}
                  className="border-2"
                />
                <Button onClick={handleUploadImage} disabled={!newImage}>
                  <Upload className="mr-2 size-4" />
                  Upload Image
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Uploaded Images</h3>
                  <span className="text-sm text-muted-foreground">
                    {images.length} image{images.length !== 1 ? 's' : ''}
                  </span>
                </div>
                
                {images.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <ImageIcon className="mx-auto size-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No images uploaded yet</p>
                    <p className="text-xs text-muted-foreground">Upload images above to use in messages</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {images.map((img) => (
                      <div key={img.id} className="relative rounded-lg border-2 overflow-hidden hover:shadow-lg transition-shadow">
                        <img
                          src={img.fileUrl}
                          alt={img.name}
                          className="h-40 w-full object-cover"
                        />
                        <div className="p-3 space-y-2">
                          <p className="text-sm font-medium truncate">{img.name}</p>
                          {img.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{img.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {new Date(img.createdAt).toLocaleDateString()}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteImage(img.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="polls">
          <Card>
            <CardHeader>
              <CardTitle>Poll Management</CardTitle>
              <CardDescription>
                Create and manage polls for user engagement and feedback collection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Create New Poll Form */}
              <div className="space-y-4 rounded-md border-2 p-4 bg-muted/30">
                <h3 className="font-medium flex items-center gap-2 text-lg">
                  <Plus className="size-5" />
                  Create New Poll
                </h3>
                
                <div className="grid gap-4">
                  <Input
                    placeholder="Poll title"
                    value={newPoll.title}
                    onChange={(e) => setNewPoll({ ...newPoll, title: e.target.value })}
                    className="border-2"
                  />
                  
                  <textarea
                    className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm min-h-[80px]"
                    placeholder="Poll description (optional)"
                    rows={3}
                    value={newPoll.description}
                    onChange={(e) => setNewPoll({ ...newPoll, description: e.target.value })}
                  />
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Poll Options</label>
                    {newPoll.options.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          placeholder={`Option ${index + 1}`}
                          value={option}
                          onChange={(e) => updatePollOption(index, e.target.value)}
                          className="border-2"
                        />
                        {newPoll.options.length > 2 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removePollOption(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addPollOption}
                      className="w-full"
                    >
                      <Plus className="mr-1 size-3" />
                      Add Option
                    </Button>
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-1 block">Target Role</label>
                      <select
                        className="w-full rounded-md border-2 border-border bg-background px-3 py-2 text-sm"
                        value={newPoll.targetRole}
                        onChange={(e) =>
                          setNewPoll({
                            ...newPoll,
                            targetRole: e.target.value as "user" | "admin" | "dev" | "all",
                          })
                        }
                      >
                        <option value="all">👥 All Users</option>
                        <option value="user">👤 Users Only</option>
                        <option value="admin">🔧 Admins Only</option>
                        <option value="dev">💻 Devs Only</option>
                      </select>
                    </div>
                    
                    <Input
                      type="datetime-local"
                      placeholder="Expires at (optional)"
                      value={newPoll.expiresAt}
                      onChange={(e) => setNewPoll({ ...newPoll, expiresAt: e.target.value })}
                      className="border-2"
                    />
                  </div>
                  
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isActive"
                        checked={newPoll.isActive}
                        onChange={(e) => setNewPoll({ ...newPoll, isActive: e.target.checked })}
                        className="rounded"
                      />
                      <label htmlFor="isActive" className="text-sm font-medium">
                        Active immediately
                      </label>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="allowMultipleVotes"
                        checked={newPoll.allowMultipleVotes}
                        onChange={(e) => setNewPoll({ ...newPoll, allowMultipleVotes: e.target.checked })}
                        className="rounded"
                      />
                      <label htmlFor="allowMultipleVotes" className="text-sm font-medium">
                        Allow multiple votes
                      </label>
                    </div>
                    
                    <Button onClick={handleCreatePoll} className="ml-auto">
                      <Plus className="mr-2 size-4" />
                      Create Poll
                    </Button>
                  </div>
                </div>
              </div>

              {/* Existing Polls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-lg">Existing Polls</h3>
                  <span className="text-sm text-muted-foreground">
                    {polls.length} poll{polls.length !== 1 ? 's' : ''}
                  </span>
                </div>
                
                {polls.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg">
                    <BarChart3 className="mx-auto size-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No polls yet</p>
                    <p className="text-xs text-muted-foreground">Create your first poll above</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {polls.map((poll) => (
                      <div key={poll.id} className="rounded-lg border-2 p-4 hover:bg-muted/30 transition-all">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold">{poll.title}</h4>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                                {poll.targetRole}
                              </span>
                              {poll.isActive ? (
                                <span className="rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 text-xs font-medium">
                                  ✓ Active
                                </span>
                              ) : (
                                <span className="rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 px-2 py-0.5 text-xs font-medium">
                                  ✗ Inactive
                                </span>
                              )}
                              {poll.allowMultipleVotes && (
                                <span className="rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 text-xs font-medium">
                                  Multiple votes
                                </span>
                              )}
                            </div>
                            
                            {poll.description && (
                              <p className="text-sm text-muted-foreground">{poll.description}</p>
                            )}
                            
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">Options:</p>
                              <div className="grid gap-1">
                                {poll.options.map((option) => (
                                  <div key={option.id} className="flex items-center justify-between rounded-md bg-muted/50 p-2">
                                    <span className="text-sm">{option.text}</span>
                                    <Badge variant="secondary" className="text-xs">
                                      {option.votes} vote{option.votes !== 1 ? 's' : ''}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Total votes: {poll.totalVotes}</span>
                              <span>Created: {new Date(poll.createdAt).toLocaleString()}</span>
                              {poll.expiresAt && (
                                <span className="text-orange-600 dark:text-orange-400">
                                  Expires: {new Date(poll.expiresAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeletePoll(poll.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            <Trash2 className="size-4" />
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

        <TabsContent value="tutorials">
          <Card>
            <CardHeader>
              <CardTitle>Tutorial Button Visibility</CardTitle>
              <CardDescription>
                Control whether tutorial buttons are visible to users across the platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4 rounded-md border-2 p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="font-medium">Tutorial Buttons</h4>
                    <p className="text-sm text-muted-foreground">
                      Show or hide tutorial buttons on project cards
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={tutorialSettings.tutorialsEnabled === "true" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTutorialSettingChange("tutorialsEnabled", "true")}
                      className="flex items-center gap-2"
                    >
                      <Eye className="size-3" />
                      Show
                    </Button>
                    <Button
                      variant={tutorialSettings.tutorialsEnabled !== "true" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTutorialSettingChange("tutorialsEnabled", "false")}
                      className="flex items-center gap-2"
                    >
                      <EyeOff className="size-3" />
                      Hide
                    </Button>
                  </div>
                </div>
                
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Info className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Current status: <span className={tutorialSettings.tutorialsEnabled === "true" ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                        {tutorialSettings.tutorialsEnabled === "true" ? "Visible" : "Hidden"}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Available Tutorial Settings</h4>
                <div className="grid gap-2">
                  {Object.entries(tutorialSettings).length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed rounded-lg">
                      <Info className="mx-auto size-6 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No tutorial settings configured yet</p>
                      <p className="text-xs text-muted-foreground">Use the controls above to set tutorial visibility</p>
                    </div>
                  ) : (
                    Object.entries(tutorialSettings).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between rounded-md border p-3">
                        <div className="space-y-1">
                          <span className="font-medium text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <p className="text-xs text-muted-foreground">Setting key: {key}</p>
                        </div>
                        <Badge variant={value === "true" ? "default" : "secondary"} className="text-xs">
                          {value}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}