export type ToolScheduleFallback = {
  id: number;
  toolId: string;
  toolName: string;
  openAt: string;
  closeAt: string | null;
  isActive: boolean;
  surpriseMessage?: string | null;
  customMessage?: string | null;
};

export type ToolTutorialFallback = {
  id: number;
  toolId: string;
  toolName: string;
  title: string;
  description: string;
  videoFileUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  displayOrder: number;
  isActive: boolean;
};

export const fallbackToolSchedules: Record<string, ToolScheduleFallback> = {
  "quote-generator": {
    id: 1001,
    toolId: "quote-generator",
    toolName: "Quote Generator",
    openAt: "2025-01-01T09:00:00.000Z",
    closeAt: null,
    isActive: true,
    customMessage: "Quote Generator stays unlocked in the development workspace.",
    surpriseMessage: 'Draft quotes auto-save every 30 seconds in dev mode.'
  },
  "inventory-management": {
    id: 1004,
    toolId: "inventory-management",
    toolName: "Inventory Management",
    openAt: "2025-01-01T09:00:00.000Z",
    closeAt: null,
    isActive: true,
    customMessage: 'Inventory Management stays open for Shopify sync testing.',
    surpriseMessage: 'Background jobs pause when the service stops - restart to resume.'
  },
  "gsheet-integration": {
    id: 1005,
    toolId: "gsheet-integration",
    toolName: "Google Sheets Integration",
    openAt: "2025-01-01T09:00:00.000Z",
    closeAt: null,
    isActive: true,
    customMessage: 'Google Sheets wizard uses live credentials only in production.'
  }
};

export const fallbackSurpriseMessages: Record<string, string[]> = {
  default: [
    'Running in development mode - all tools stay unlocked.',
    'Need help? Check documentation for setup instructions.'
  ],
  "quote-generator": [
    'Quotes save instantly; refresh if you want a clean slate.'
  ],
  "inventory-management": [
    'Background jobs wait for proper MongoDB connection.'
  ],
  "gsheet-integration": [
    'Use the configured credentials for Google Sheets automation.'
  ]
};

export const fallbackToolTutorials: Record<string, ToolTutorialFallback[]> = {
  "quote-generator": [
    {
      id: 2001,
      toolId: "quote-generator",
      toolName: "Quote Generator",
      title: "Creating your first quote",
      description: "Walk through the quote builder, add products, and export a PDF.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 180,
      displayOrder: 1,
      isActive: true
    },
    {
      id: 2002,
      toolId: "quote-generator",
      toolName: "Quote Generator",
      title: "Managing price rules",
      description: "Configure tiered pricing and automatic discounts for bulk orders.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 210,
      displayOrder: 2,
      isActive: true
    }
  ],
  "inventory-management": [
    {
      id: 2301,
      toolId: "inventory-management",
      toolName: "Inventory Management",
      title: "Processing Shopify orders",
      description: "Sync latest Shopify orders, update vendor assignments, and trigger reminders.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 240,
      displayOrder: 1,
      isActive: true
    },
    {
      id: 2302,
      toolId: "inventory-management",
      toolName: "Inventory Management",
      title: "Inventory dashboard overview",
      description: "Navigate low stock alerts, activities, and background sync status.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 180,
      displayOrder: 2,
      isActive: true
    }
  ],
  "gsheet-integration": [
    {
      id: 2401,
      toolId: "gsheet-integration",
      toolName: "Google Sheets Integration",
      title: "Uploading data exports",
      description: "Upload CSV exports and let the wizard detect the correct template for processing.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 190,
      displayOrder: 1,
      isActive: true
    }
  ]
};
