"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit, Tag, MessageSquare, Save, X } from "lucide-react";
import { projects } from "@/data/projects";

type ToolCustomization = {
  toolId: string;
  toolName: string | null;
  appName: string | null;
  customColors: Record<string, unknown> | null;
  customSettings: Record<string, unknown> | null;
  tags: string[];
  remarks: Array<{ id: number; remark: string; createdAt: string }>;
};

export function ToolManager() {
  const [tools, setTools] = useState<ToolCustomization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [editData, setEditData] = useState({
    toolName: "",
    appName: "",
    tags: [] as string[],
    newTag: "",
    newRemark: "",
    customColors: {} as Record<string, string>,
  });

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/account/tools");
      if (!response.ok) {
        setError("Failed to load tools");
        return;
      }
      const data = await response.json();
      setTools(data.tools || []);
    } catch (err) {
      console.error("Failed to load tools:", err);
      setError("Failed to load tools");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (tool: ToolCustomization) => {
    setEditingTool(tool.toolId);
    setEditData({
      toolName: tool.toolName || "",
      appName: tool.appName || "",
      tags: tool.tags || [],
      newTag: "",
      newRemark: "",
      customColors: (tool.customColors as Record<string, string>) || {},
    });
  };

  const handleSave = async (toolId: string) => {
    try {
      const response = await fetch("/api/account/tools", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolId,
          toolName: editData.toolName || null,
          appName: editData.appName || null,
          customColors: Object.keys(editData.customColors).length > 0 ? editData.customColors : null,
        }),
      });

      if (!response.ok) {
        setError("Failed to update tool");
        return;
      }

      // Save tags and remarks if provided
      if (editData.tags.length > 0 || editData.newRemark) {
        await fetch("/api/account/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolId,
            tags: editData.tags,
            remark: editData.newRemark || undefined,
          }),
        });
      }

      setEditingTool(null);
      await loadTools();
    } catch (err) {
      console.error("Failed to save tool:", err);
      setError("Failed to save tool");
    }
  };

  const addTag = () => {
    if (editData.newTag.trim() && !editData.tags.includes(editData.newTag.trim())) {
      setEditData({
        ...editData,
        tags: [...editData.tags, editData.newTag.trim()],
        newTag: "",
      });
    }
  };

  const removeTag = (tag: string) => {
    setEditData({
      ...editData,
      tags: editData.tags.filter((t) => t !== tag),
    });
  };

  const updateColor = (key: string, value: string) => {
    setEditData({
      ...editData,
      customColors: {
        ...editData.customColors,
        [key]: value,
      },
    });
  };

  // Get all available tools from projects
  const availableTools = projects.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
  }));

  // Merge with customizations
  const allTools = availableTools.map((tool) => {
    const customization = tools.find((t) => t.toolId === tool.id);
    return {
      ...tool,
      customization: customization || {
        toolId: tool.id,
        toolName: null,
        appName: null,
        customColors: null,
        customSettings: null,
        tags: [],
        remarks: [],
      },
    };
  });

  if (loading) {
    return <div className="text-muted-foreground">Loading tools...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool Management</CardTitle>
        <CardDescription>Preview, edit, and customize your tools</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {allTools.map((tool) => {
            const isEditing = editingTool === tool.id;
            const custom = tool.customization;

            return (
              <div key={tool.id} className="rounded-md border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">
                        {custom.toolName || tool.name}
                      </h3>
                      {custom.appName && (
                        <span className="text-sm text-muted-foreground">({custom.appName})</span>
                      )}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                        {tool.category}
                      </span>
                    </div>

                    {custom.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {custom.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {custom.remarks.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {custom.remarks.map((remark) => (
                          <p key={remark.id} className="text-sm text-muted-foreground">
                            {remark.remark}
                          </p>
                        ))}
                      </div>
                    )}

                    {isEditing && (
                      <div className="mt-4 space-y-3 rounded-md border p-3">
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input
                            placeholder="Tool Name"
                            value={editData.toolName}
                            onChange={(e) =>
                              setEditData({ ...editData, toolName: e.target.value })
                            }
                          />
                          <Input
                            placeholder="App Name"
                            value={editData.appName}
                            onChange={(e) =>
                              setEditData({ ...editData, appName: e.target.value })
                            }
                          />
                        </div>

                        <div className="flex gap-2">
                          <Input
                            placeholder="Add tag"
                            value={editData.newTag}
                            onChange={(e) =>
                              setEditData({ ...editData, newTag: e.target.value })
                            }
                            onKeyPress={(e) => e.key === "Enter" && addTag()}
                          />
                          <Button size="sm" onClick={addTag}>
                            <Tag className="size-3" />
                          </Button>
                        </div>

                        {editData.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {editData.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="rounded-full bg-muted px-2 py-0.5 text-xs"
                              >
                                {tag}
                                <button
                                  onClick={() => removeTag(tag)}
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
                          value={editData.newRemark}
                          onChange={(e) =>
                            setEditData({ ...editData, newRemark: e.target.value })
                          }
                        />

                        <div className="space-y-2">
                          <label className="text-sm font-medium">Custom Colors</label>
                          <div className="grid gap-2 md:grid-cols-2">
                            <div>
                              <label className="text-xs text-muted-foreground">Primary</label>
                              <Input
                                type="color"
                                value={editData.customColors.primary || "#000000"}
                                onChange={(e) => updateColor("primary", e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground">Background</label>
                              <Input
                                type="color"
                                value={editData.customColors.background || "#ffffff"}
                                onChange={(e) => updateColor("background", e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSave(tool.id)}>
                            <Save className="mr-1 size-3" />
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingTool(null)}
                          >
                            <X className="mr-1 size-3" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(custom)}
                    >
                      <Edit className="mr-1 size-3" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

