'use client';

import React, { useState } from 'react';
import { Settings, Palette, Type, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme, type CustomTheme } from '@/contexts/ThemeContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const fontOptions = [
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Poppins', value: 'Poppins, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, sans-serif' },
  { label: 'Open Sans', value: 'Open Sans, sans-serif' },
  { label: 'Lato', value: 'Lato, sans-serif' },
  { label: 'Nunito', value: 'Nunito, sans-serif' },
  { label: 'Raleway', value: 'Raleway, sans-serif' },
];

const presetThemes: { name: string; theme: CustomTheme }[] = [
  {
    name: 'Ocean Blue',
    theme: {
      background: '#0a192f',
      foreground: '#e6f1ff',
      card: '#112240',
      cardForeground: '#e6f1ff',
      primary: '#64ffda',
      primaryForeground: '#0a192f',
      secondary: '#1d3557',
      secondaryForeground: '#e6f1ff',
      muted: '#233554',
      mutedForeground: '#8892b0',
      accent: '#1d3557',
      accentForeground: '#64ffda',
      border: '#233554',
      hoverColor: '#64ffda',
      fontFamily: 'Inter, sans-serif',
    },
  },
  {
    name: 'Purple Dream',
    theme: {
      background: '#1a0b2e',
      foreground: '#f8f8ff',
      card: '#2d1b4e',
      cardForeground: '#f8f8ff',
      primary: '#a78bfa',
      primaryForeground: '#1a0b2e',
      secondary: '#3730a3',
      secondaryForeground: '#f8f8ff',
      muted: '#4c1d95',
      mutedForeground: '#c4b5fd',
      accent: '#6d28d9',
      accentForeground: '#f8f8ff',
      border: '#4c1d95',
      hoverColor: '#c084fc',
      fontFamily: 'Poppins, sans-serif',
    },
  },
  {
    name: 'Forest Green',
    theme: {
      background: '#0d1b2a',
      foreground: '#e0e1dd',
      card: '#1b263b',
      cardForeground: '#e0e1dd',
      primary: '#10b981',
      primaryForeground: '#0d1b2a',
      secondary: '#415a77',
      secondaryForeground: '#e0e1dd',
      muted: '#415a77',
      mutedForeground: '#8a9eb5',
      accent: '#0d9488',
      accentForeground: '#e0e1dd',
      border: '#415a77',
      hoverColor: '#34d399',
      fontFamily: 'Montserrat, sans-serif',
    },
  },
  {
    name: 'Sunset Orange',
    theme: {
      background: '#1c1917',
      foreground: '#fef3c7',
      card: '#292524',
      cardForeground: '#fef3c7',
      primary: '#fb923c',
      primaryForeground: '#1c1917',
      secondary: '#78350f',
      secondaryForeground: '#fef3c7',
      muted: '#44403c',
      mutedForeground: '#d6d3d1',
      accent: '#ea580c',
      accentForeground: '#fef3c7',
      border: '#44403c',
      hoverColor: '#fdba74',
      fontFamily: 'Nunito, sans-serif',
    },
  },
];

export function ThemeSettings() {
  const { customTheme, setCustomTheme, setTheme } = useTheme();
  const [localTheme, setLocalTheme] = useState<CustomTheme>(customTheme || presetThemes[0].theme);
  const [open, setOpen] = useState(false);

  const handleColorChange = (key: keyof CustomTheme, value: string) => {
    setLocalTheme((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    setCustomTheme(localTheme);
    setTheme('custom');
    setOpen(false);
  };

  const handlePresetApply = (preset: CustomTheme) => {
    setLocalTheme(preset);
    setCustomTheme(preset);
    setTheme('custom');
    setOpen(false);
  };

  const handleReset = () => {
    const defaultTheme = presetThemes[0].theme;
    setLocalTheme(defaultTheme);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <motion.button
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/80 backdrop-blur-sm transition-colors hover:bg-muted"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Theme Settings"
          title="Customize Theme"
        >
          <Settings className="h-5 w-5 text-foreground" />
        </motion.button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Palette className="h-6 w-6 text-primary" />
            Theme Customization
          </DialogTitle>
          <DialogDescription>
            Create your own custom theme with personalized colors and fonts. Changes are saved to your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Preset Themes */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Quick Presets
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {presetThemes.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetApply(preset.theme)}
                  className="rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary hover:bg-muted"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{preset.name}</span>
                    <div className="flex gap-1">
                      <div
                        className="h-4 w-4 rounded-full border border-border"
                        style={{ backgroundColor: preset.theme.primary }}
                      />
                      <div
                        className="h-4 w-4 rounded-full border border-border"
                        style={{ backgroundColor: preset.theme.background }}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Background & Text Colors */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Background & Text</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="background" className="text-sm">Background Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="background"
                    value={localTheme.background}
                    onChange={(e) => handleColorChange('background', e.target.value)}
                    className="h-10 w-20 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={localTheme.background}
                    onChange={(e) => handleColorChange('background', e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="foreground" className="text-sm">Text Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="foreground"
                    value={localTheme.foreground}
                    onChange={(e) => handleColorChange('foreground', e.target.value)}
                    className="h-10 w-20 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={localTheme.foreground}
                    onChange={(e) => handleColorChange('foreground', e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card Colors */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Card & Components</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="card" className="text-sm">Card Background</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="card"
                    value={localTheme.card}
                    onChange={(e) => handleColorChange('card', e.target.value)}
                    className="h-10 w-20 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={localTheme.card}
                    onChange={(e) => handleColorChange('card', e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="border" className="text-sm">Border Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="border"
                    value={localTheme.border}
                    onChange={(e) => handleColorChange('border', e.target.value)}
                    className="h-10 w-20 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={localTheme.border}
                    onChange={(e) => handleColorChange('border', e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Primary & Secondary Colors */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Accent Colors</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="primary" className="text-sm">Primary Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="primary"
                    value={localTheme.primary}
                    onChange={(e) => handleColorChange('primary', e.target.value)}
                    className="h-10 w-20 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={localTheme.primary}
                    onChange={(e) => handleColorChange('primary', e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hoverColor" className="text-sm">Hover/Link Color</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="hoverColor"
                    value={localTheme.hoverColor}
                    onChange={(e) => handleColorChange('hoverColor', e.target.value)}
                    className="h-10 w-20 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={localTheme.hoverColor}
                    onChange={(e) => handleColorChange('hoverColor', e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Muted Colors */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Secondary/Muted Colors</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="muted" className="text-sm">Muted Background</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="muted"
                    value={localTheme.muted}
                    onChange={(e) => handleColorChange('muted', e.target.value)}
                    className="h-10 w-20 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={localTheme.muted}
                    onChange={(e) => handleColorChange('muted', e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mutedForeground" className="text-sm">Muted Text</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    id="mutedForeground"
                    value={localTheme.mutedForeground}
                    onChange={(e) => handleColorChange('mutedForeground', e.target.value)}
                    className="h-10 w-20 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={localTheme.mutedForeground}
                    onChange={(e) => handleColorChange('mutedForeground', e.target.value)}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Typography */}
          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" />
              Typography
            </Label>
            <div className="space-y-2">
              <Label htmlFor="fontFamily" className="text-sm">Font Family</Label>
              <select
                id="fontFamily"
                value={localTheme.fontFamily}
                onChange={(e) => handleColorChange('fontFamily', e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {fontOptions.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Preview</Label>
            <div
              className="rounded-lg border p-6 space-y-4"
              style={{
                backgroundColor: localTheme.background,
                color: localTheme.foreground,
                borderColor: localTheme.border,
                fontFamily: localTheme.fontFamily,
              }}
            >
              <h3 className="text-xl font-bold" style={{ color: localTheme.foreground }}>
                Sample Heading
              </h3>
              <div
                className="rounded-lg border p-4"
                style={{
                  backgroundColor: localTheme.card,
                  borderColor: localTheme.border,
                }}
              >
                <p style={{ color: localTheme.cardForeground }}>
                  This is a sample card with your custom theme.
                </p>
                <button
                  className="mt-3 rounded-md px-4 py-2 font-medium transition"
                  style={{
                    backgroundColor: localTheme.primary,
                    color: localTheme.primaryForeground,
                  }}
                >
                  Primary Button
                </button>
              </div>
              <p style={{ color: localTheme.mutedForeground }}>
                This is muted text for descriptions and secondary information.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button onClick={handleReset} variant="outline" className="flex-1">
              Reset to Default
            </Button>
            <Button onClick={handleApply} className="flex-1 bg-gradient-to-r from-sky-500 to-blue-600 text-white">
              Apply Custom Theme
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

