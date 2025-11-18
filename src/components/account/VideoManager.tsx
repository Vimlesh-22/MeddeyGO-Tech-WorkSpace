"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Trash2, Play, Tag, MessageSquare } from "lucide-react";

type Video = {
  id: number;
  name: string;
  fileUrl: string;
  description: string | null;
  createdAt: string;
};

export function VideoManager() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingVideo, setEditingVideo] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [newRemark, setNewRemark] = useState("");

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/account/videos");
      if (!response.ok) {
        setError("Failed to load videos");
        return;
      }
      const data = await response.json();
      setVideos(data.videos || []);
    } catch (err) {
      console.error("Failed to load videos:", err);
      setError("Failed to load videos");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "video");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to upload video");
        return;
      }

      await loadVideos();
    } catch (err) {
      console.error("Failed to upload video:", err);
      setError("Failed to upload video");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (video: Video) => {
    setEditingVideo(video.id);
    setEditDescription(video.description || "");
    setEditTags([]);
    setNewTag("");
    setNewRemark("");
  };

  const handleSaveEdit = async (videoId: number) => {
    try {
      const response = await fetch("/api/account/videos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: videoId,
          description: editDescription,
          tags: editTags.length > 0 ? editTags : undefined,
          remarks: newRemark || undefined,
        }),
      });

      if (!response.ok) {
        setError("Failed to update video");
        return;
      }

      setEditingVideo(null);
      await loadVideos();
    } catch (err) {
      console.error("Failed to update video:", err);
      setError("Failed to update video");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this video?")) return;

    try {
      const response = await fetch(`/api/account/videos?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("Failed to delete video");
        return;
      }

      await loadVideos();
    } catch (err) {
      console.error("Failed to delete video:", err);
      setError("Failed to delete video");
    }
  };

  const addTag = () => {
    if (newTag.trim() && !editTags.includes(newTag.trim())) {
      setEditTags([...editTags, newTag.trim()]);
      setNewTag("");
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading videos...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video Management</CardTitle>
        <CardDescription>Upload, preview, and manage your videos</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4 rounded-md border p-4">
          <label className="flex cursor-pointer items-center gap-2">
            <Upload className="size-4" />
            <span className="text-sm">Upload Video</span>
            <input
              type="file"
              accept="video/*"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
        </div>

        <div className="space-y-4">
          <h3 className="font-medium">Your Videos</h3>
          {videos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No videos uploaded yet</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {videos.map((video) => (
                <div key={video.id} className="relative rounded-md border">
                  <video
                    src={video.fileUrl}
                    controls
                    className="h-48 w-full object-cover rounded-t-md"
                  />
                  <div className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{video.name}</p>
                        {video.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{video.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(video)}
                        >
                          <MessageSquare className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(video.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>

                    {editingVideo === video.id && (
                      <div className="mt-3 space-y-2 rounded-md border p-3">
                        <Input
                          placeholder="Description"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Input
                            placeholder="Add tag"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && addTag()}
                            className="text-sm"
                          />
                          <Button size="sm" onClick={addTag}>
                            <Tag className="size-3" />
                          </Button>
                        </div>
                        {editTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {editTags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="rounded-full bg-muted px-2 py-0.5 text-xs"
                              >
                                {tag}
                                <button
                                  onClick={() => setEditTags(editTags.filter((_, i) => i !== idx))}
                                  className="ml-1"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <Input
                          placeholder="Add remark"
                          value={newRemark}
                          onChange={(e) => setNewRemark(e.target.value)}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveEdit(video.id)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingVideo(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

