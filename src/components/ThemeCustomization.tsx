"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Settings, Check, RefreshCw } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

type ThemePreset = {
  name: string;
  colors: {
    bg: string;
    text: string;
    cardBg: string;
    border: string;
    primary: string;
    hover: string;
    mutedBg: string;
    mutedText: string;
  };
};

const THEME_PRESETS: ThemePreset[] = [
  {
    name: "Ocean Blue",
    colors: {
      bg: "#0a1929",
      text: "#e3f2fd",
      cardBg: "#1e3a5f",
      border: "#2196f3",
      primary: "#2196f3",
      hover: "#1976d2",
      mutedBg: "#0d2847",
      mutedText: "#90caf9",
    },
  },
  {
    name: "Purple Dream",
    colors: {
      bg: "#1a0933",
      text: "#f3e5f5",
      cardBg: "#3d1f5c",
      border: "#9c27b0",
      primary: "#9c27b0",
      hover: "#7b1fa2",
      mutedBg: "#2d1245",
      mutedText: "#ce93d8",
    },
  },
  {
    name: "Forest Green",
    colors: {
      bg: "#0d2818",
      text: "#e8f5e9",
      cardBg: "#1e4d2b",
      border: "#4caf50",
      primary: "#4caf50",
      hover: "#388e3c",
      mutedBg: "#163420",
      mutedText: "#81c784",
    },
  },
  {
    name: "Sunset Orange",
    colors: {
      bg: "#2d1810",
      text: "#fff3e0",
      cardBg: "#5c3317",
      border: "#ff9800",
      primary: "#ff9800",
      hover: "#f57c00",
      mutedBg: "#3d2213",
      mutedText: "#ffb74d",
    },
  },
];

const FONT_FAMILIES = [
  { label: "Default (System)", value: "" },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Roboto", value: "Roboto, sans-serif" },
  { label: "Open Sans", value: "'Open Sans', sans-serif" },
  { label: "Lato", value: "Lato, sans-serif" },
  { label: "Montserrat", value: "Montserrat, sans-serif" },
  { label: "Poppins", value: "Poppins, sans-serif" },
  { label: "Source Sans Pro", value: "'Source Sans Pro', sans-serif" },
  { label: "Raleway", value: "Raleway, sans-serif" },
  { label: "Ubuntu", value: "Ubuntu, sans-serif" },
  { label: "Nunito", value: "Nunito, sans-serif" },
];

export function ThemeCustomization() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const [bgColor, setBgColor] = useState("");
  const [textColor, setTextColor] = useState("");
  const [cardBgColor, setCardBgColor] = useState("");
  const [borderColor, setBorderColor] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [hoverColor, setHoverColor] = useState("");
  const [mutedBgColor, setMutedBgColor] = useState("");
  const [mutedTextColor, setMutedTextColor] = useState("");
  const [fontFamily, setFontFamily] = useState("");

  // Track if component is mounted to prevent hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load theme preferences from API
  const loadPreferences = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/user/theme");
      if (response.ok) {
        const data = await response.json();
        setBgColor(data.bgColor || "");
        setTextColor(data.textColor || "");
        setCardBgColor(data.cardBgColor || "");
        setBorderColor(data.borderColor || "");
        setPrimaryColor(data.primaryColor || "");
        setHoverColor(data.hoverColor || "");
        setMutedBgColor(data.mutedBgColor || "");
        setMutedTextColor(data.mutedTextColor || "");
        setFontFamily(data.fontFamily || "");
        
        // Apply colors immediately
        applyColorsToCSS(data);
      }
    } catch (error) {
      console.error("Failed to load theme preferences:", error);
    } finally {
      setLoading(false);
    }
  };

  // Apply colors to CSS variables
  const applyColorsToCSS = (colors: {
    bgColor?: string;
    textColor?: string;
    cardBgColor?: string;
    borderColor?: string;
    primaryColor?: string;
    hoverColor?: string;
    mutedBgColor?: string;
    mutedTextColor?: string;
    fontFamily?: string;
  }) => {
    const root = document.documentElement;
    
    // Helper function to convert hex to HSL format for Tailwind
    const hexToHSL = (hex: string) => {
      if (!hex || !hex.startsWith('#')) return null;
      
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return null;
      
      const r = parseInt(result[1], 16) / 255;
      const g = parseInt(result[2], 16) / 255;
      const b = parseInt(result[3], 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      
      h = Math.round(h * 360);
      s = Math.round(s * 100);
      l = Math.round(l * 100);
      
      return `${h} ${s}% ${l}%`;
    };
    
    if (colors.bgColor) {
      const hsl = hexToHSL(colors.bgColor);
      if (hsl) root.style.setProperty("--background", hsl);
    }
    if (colors.textColor) {
      const hsl = hexToHSL(colors.textColor);
      if (hsl) root.style.setProperty("--foreground", hsl);
    }
    if (colors.cardBgColor) {
      const hsl = hexToHSL(colors.cardBgColor);
      if (hsl) root.style.setProperty("--card", hsl);
    }
    if (colors.borderColor) {
      const hsl = hexToHSL(colors.borderColor);
      if (hsl) root.style.setProperty("--border", hsl);
    }
    if (colors.primaryColor) {
      const hsl = hexToHSL(colors.primaryColor);
      if (hsl) root.style.setProperty("--primary", hsl);
    }
    if (colors.hoverColor) {
      const hsl = hexToHSL(colors.hoverColor);
      if (hsl) root.style.setProperty("--primary-foreground", hsl);
    }
    if (colors.mutedBgColor) {
      const hsl = hexToHSL(colors.mutedBgColor);
      if (hsl) root.style.setProperty("--muted", hsl);
    }
    if (colors.mutedTextColor) {
      const hsl = hexToHSL(colors.mutedTextColor);
      if (hsl) root.style.setProperty("--muted-foreground", hsl);
    }
    if (colors.fontFamily) {
      root.style.setProperty("font-family", colors.fontFamily);
    }
  };

  // Save theme preferences to API
  const savePreferences = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/user/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeMode: theme || "system",
          bgColor: bgColor || null,
          textColor: textColor || null,
          cardBgColor: cardBgColor || null,
          borderColor: borderColor || null,
          primaryColor: primaryColor || null,
          hoverColor: hoverColor || null,
          mutedBgColor: mutedBgColor || null,
          mutedTextColor: mutedTextColor || null,
          fontFamily: fontFamily || null,
        }),
      });

      if (response.ok) {
        // Apply immediately
        applyColorsToCSS({
          bgColor,
          textColor,
          cardBgColor,
          borderColor,
          primaryColor,
          hoverColor,
          mutedBgColor,
          mutedTextColor,
          fontFamily,
        });
      }
    } catch (error) {
      console.error("Failed to save theme preferences:", error);
    } finally {
      setSaving(false);
    }
  };

  // Apply a preset theme
  const applyPreset = (preset: ThemePreset) => {
    setBgColor(preset.colors.bg);
    setTextColor(preset.colors.text);
    setCardBgColor(preset.colors.cardBg);
    setBorderColor(preset.colors.border);
    setPrimaryColor(preset.colors.primary);
    setHoverColor(preset.colors.hover);
    setMutedBgColor(preset.colors.mutedBg);
    setMutedTextColor(preset.colors.mutedText);
    
    // Preview immediately
    applyColorsToCSS({
      bgColor: preset.colors.bg,
      textColor: preset.colors.text,
      cardBgColor: preset.colors.cardBg,
      borderColor: preset.colors.border,
      primaryColor: preset.colors.primary,
      hoverColor: preset.colors.hover,
      mutedBgColor: preset.colors.mutedBg,
      mutedTextColor: preset.colors.mutedText,
    });
  };

  // Reset to defaults
  const resetToDefaults = () => {
    setBgColor("");
    setTextColor("");
    setCardBgColor("");
    setBorderColor("");
    setPrimaryColor("");
    setHoverColor("");
    setMutedBgColor("");
    setMutedTextColor("");
    setFontFamily("");
    
    // Remove custom properties
    const root = document.documentElement;
    root.style.removeProperty("--background");
    root.style.removeProperty("--foreground");
    root.style.removeProperty("--card");
    root.style.removeProperty("--border");
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
    root.style.removeProperty("--muted");
    root.style.removeProperty("--muted-foreground");
    root.style.removeProperty("font-family");
  };

  // Load preferences when dialog opens
  useEffect(() => {
    if (open) {
      loadPreferences();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Don't render Dialog until mounted to prevent hydration errors
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" title="Theme Settings" onClick={() => setOpen(true)}>
        <Settings className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div suppressHydrationWarning>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" title="Theme Settings">
            <Settings className="h-5 w-5" />
          </Button>
        </DialogTrigger>
      </div>
        
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Theme Customization</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading preferences...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Theme Mode */}
            <div className="space-y-2">
              <Label htmlFor="themeMode">Theme Mode</Label>
              <select
                id="themeMode"
                value={theme}
                onChange={(e) => setTheme(e.target.value as "light" | "dark")}
                className="w-full px-3 py-2 rounded border bg-background"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <Label>Quick Presets</Label>
              <div className="grid grid-cols-2 gap-2">
                {THEME_PRESETS.map((preset) => (
                  <Button
                    key={preset.name}
                    variant="outline"
                    onClick={() => applyPreset(preset)}
                    className="justify-start"
                  >
                    <div
                      className="w-4 h-4 rounded-full mr-2"
                      style={{ backgroundColor: preset.colors.primary }}
                    />
                    {preset.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Background & Text Colors */}
            <div className="space-y-3">
              <Label className="text-lg font-semibold">Background & Text</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bgColor">Background Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="bgColor"
                      value={bgColor || "#000000"}
                      onChange={(e) => {
                        setBgColor(e.target.value);
                        applyColorsToCSS({ bgColor: e.target.value });
                      }}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={bgColor}
                      onChange={(e) => {
                        setBgColor(e.target.value);
                        applyColorsToCSS({ bgColor: e.target.value });
                      }}
                      placeholder="#000000"
                      className="flex-1 px-3 py-2 rounded border bg-background"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="textColor">Text Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="textColor"
                      value={textColor || "#ffffff"}
                      onChange={(e) => {
                        setTextColor(e.target.value);
                        applyColorsToCSS({ textColor: e.target.value });
                      }}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={textColor}
                      onChange={(e) => {
                        setTextColor(e.target.value);
                        applyColorsToCSS({ textColor: e.target.value });
                      }}
                      placeholder="#ffffff"
                      className="flex-1 px-3 py-2 rounded border bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Card & Components */}
            <div className="space-y-3">
              <Label className="text-lg font-semibold">Card & Components</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cardBgColor">Card Background</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="cardBgColor"
                      value={cardBgColor || "#1a1a1a"}
                      onChange={(e) => {
                        setCardBgColor(e.target.value);
                        applyColorsToCSS({ cardBgColor: e.target.value });
                      }}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={cardBgColor}
                      onChange={(e) => {
                        setCardBgColor(e.target.value);
                        applyColorsToCSS({ cardBgColor: e.target.value });
                      }}
                      placeholder="#1a1a1a"
                      className="flex-1 px-3 py-2 rounded border bg-background"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="borderColor">Border Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="borderColor"
                      value={borderColor || "#333333"}
                      onChange={(e) => {
                        setBorderColor(e.target.value);
                        applyColorsToCSS({ borderColor: e.target.value });
                      }}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={borderColor}
                      onChange={(e) => {
                        setBorderColor(e.target.value);
                        applyColorsToCSS({ borderColor: e.target.value });
                      }}
                      placeholder="#333333"
                      className="flex-1 px-3 py-2 rounded border bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Accent Colors */}
            <div className="space-y-3">
              <Label className="text-lg font-semibold">Accent Colors</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="primaryColor"
                      value={primaryColor || "#3b82f6"}
                      onChange={(e) => {
                        setPrimaryColor(e.target.value);
                        applyColorsToCSS({ primaryColor: e.target.value });
                      }}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => {
                        setPrimaryColor(e.target.value);
                        applyColorsToCSS({ primaryColor: e.target.value });
                      }}
                      placeholder="#3b82f6"
                      className="flex-1 px-3 py-2 rounded border bg-background"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="hoverColor">Hover Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="hoverColor"
                      value={hoverColor || "#2563eb"}
                      onChange={(e) => {
                        setHoverColor(e.target.value);
                        applyColorsToCSS({ hoverColor: e.target.value });
                      }}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={hoverColor}
                      onChange={(e) => {
                        setHoverColor(e.target.value);
                        applyColorsToCSS({ hoverColor: e.target.value });
                      }}
                      placeholder="#2563eb"
                      className="flex-1 px-3 py-2 rounded border bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Secondary/Muted Colors */}
            <div className="space-y-3">
              <Label className="text-lg font-semibold">Secondary/Muted Colors</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="mutedBgColor">Muted Background</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="mutedBgColor"
                      value={mutedBgColor || "#262626"}
                      onChange={(e) => {
                        setMutedBgColor(e.target.value);
                        applyColorsToCSS({ mutedBgColor: e.target.value });
                      }}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={mutedBgColor}
                      onChange={(e) => {
                        setMutedBgColor(e.target.value);
                        applyColorsToCSS({ mutedBgColor: e.target.value });
                      }}
                      placeholder="#262626"
                      className="flex-1 px-3 py-2 rounded border bg-background"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="mutedTextColor">Muted Text</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      id="mutedTextColor"
                      value={mutedTextColor || "#a3a3a3"}
                      onChange={(e) => {
                        setMutedTextColor(e.target.value);
                        applyColorsToCSS({ mutedTextColor: e.target.value });
                      }}
                      className="w-12 h-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={mutedTextColor}
                      onChange={(e) => {
                        setMutedTextColor(e.target.value);
                        applyColorsToCSS({ mutedTextColor: e.target.value });
                      }}
                      placeholder="#a3a3a3"
                      className="flex-1 px-3 py-2 rounded border bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Typography */}
            <div className="space-y-2">
              <Label className="text-lg font-semibold">Typography</Label>
              <div className="space-y-2">
                <Label htmlFor="fontFamily">Font Family</Label>
                <select
                  id="fontFamily"
                  value={fontFamily}
                  onChange={(e) => {
                    setFontFamily(e.target.value);
                    applyColorsToCSS({ fontFamily: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded border bg-background"
                >
                  {FONT_FAMILIES.map((font) => (
                    <option key={font.value} value={font.value}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={savePreferences}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Save Theme
                  </>
                )}
              </Button>
              
              <Button
                onClick={resetToDefaults}
                variant="outline"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
