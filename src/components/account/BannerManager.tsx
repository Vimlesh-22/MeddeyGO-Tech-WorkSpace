"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Trash2, Eye, ArrowUp, ArrowDown } from "lucide-react";

type Banner = {
  id: number;
  name: string;
  fileUrl: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
};

export function BannerManager() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBanners();
  }, []);

  const loadBanners = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/account/banners");
      if (!response.ok) {
        setError("Failed to load banners");
        return;
      }
      const data = await response.json();
      setBanners(data.banners || []);
    } catch (err) {
      console.error("Failed to load banners:", err);
      setError("Failed to load banners");
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
      formData.append("type", "banner");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Failed to upload banner");
        return;
      }

      await loadBanners();
    } catch (err) {
      console.error("Failed to upload banner:", err);
      setError("Failed to upload banner");
    } finally {
      setUploading(false);
    }
  };

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    try {
      const response = await fetch("/api/account/banners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isActive: !currentActive }),
      });

      if (!response.ok) {
        setError("Failed to update banner");
        return;
      }

      await loadBanners();
    } catch (err) {
      console.error("Failed to update banner:", err);
      setError("Failed to update banner");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this banner?")) return;

    try {
      const response = await fetch(`/api/account/banners?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setError("Failed to delete banner");
        return;
      }

      await loadBanners();
    } catch (err) {
      console.error("Failed to delete banner:", err);
      setError("Failed to delete banner");
    }
  };

  const handleReorder = async (id: number, direction: "up" | "down") => {
    const banner = banners.find((b) => b.id === id);
    if (!banner) return;

    const currentIndex = banners.findIndex((b) => b.id === id);
    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= banners.length) return;

    const newOrder = banner.displayOrder;
    const targetBanner = banners[newIndex];
    const targetOrder = targetBanner.displayOrder;

    try {
      await Promise.all([
        fetch("/api/account/banners", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, displayOrder: targetOrder }),
        }),
        fetch("/api/account/banners", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: targetBanner.id, displayOrder: newOrder }),
        }),
      ]);

      await loadBanners();
    } catch (err) {
      console.error("Failed to reorder banner:", err);
      setError("Failed to reorder banner");
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading banners...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Banner Management</CardTitle>
        <CardDescription>Upload and manage your banners</CardDescription>
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
            <span className="text-sm">Upload Banner</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
        </div>

        <div className="space-y-2">
          <h3 className="font-medium">Your Banners</h3>
          {banners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No banners uploaded yet</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {banners.map((banner, index) => (
                <div key={banner.id} className="relative rounded-md border">
                  <img
                    src={banner.fileUrl}
                    alt={banner.name}
                    className="h-32 w-full object-cover rounded-t-md"
                  />
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{banner.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <button
                            onClick={() => handleToggleActive(banner.id, banner.isActive)}
                            className={`text-xs ${banner.isActive ? "text-green-600" : "text-muted-foreground"}`}
                          >
                            {banner.isActive ? "Active" : "Inactive"}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReorder(banner.id, "up")}
                          disabled={index === 0}
                        >
                          <ArrowUp className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleReorder(banner.id, "down")}
                          disabled={index === banners.length - 1}
                        >
                          <ArrowDown className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(banner.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
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

