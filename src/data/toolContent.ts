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
  "order-extractor": {
    id: 1002,
    toolId: "order-extractor",
    toolName: "Order ID Extractor",
    openAt: "2025-01-01T09:00:00.000Z",
    closeAt: null,
    isActive: true,
    customMessage: 'Order extractor mirrors live behaviour for QA. No blackout windows configured.'
  },
  "file-merger": {
    id: 1003,
    toolId: "file-merger",
    toolName: "File Merger",
    openAt: "2025-01-01T09:00:00.000Z",
    closeAt: null,
    isActive: true,
    customMessage: 'File Merger is always available while running locally.',
    surpriseMessage: 'Tip: drag multiple CSVs together - we queue them in-memory.'
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
  },
  "data-extractor-pro": {
    id: 1006,
    toolId: "data-extractor-pro",
    toolName: "Data Extractor Pro",
    openAt: "2025-01-01T09:00:00.000Z",
    closeAt: null,
    isActive: true,
    customMessage: 'Data Extractor Pro is in "always on" lab mode for QA verification.',
    surpriseMessage: 'You can rerun the same upload - caches reset automatically here.'
  }
};

export const fallbackSurpriseMessages: Record<string, string[]> = {
  default: [
    'Running in development mode - all tools stay unlocked.',
    'Need help? Check Docs/FINAL_IMPLEMENTATION_PHASE2.md for launch notes.'
  ],
  "quote-generator": [
    'Quotes save instantly; refresh if you want a clean slate.'
  ],
  "inventory-management": [
    'Cron jobs wait for MongoDB, so keep that container running.'
  ],
  "gsheet-integration": [
    'Use the sample credentials.json while wiring Sheets automation.'
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
  "order-extractor": [
    {
      id: 2101,
      toolId: "order-extractor",
      toolName: "Order ID Extractor",
      title: "Bulk AWB lookup",
      description: "Paste AWB numbers from Excel and export the enriched Uniware dataset.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 160,
      displayOrder: 1,
      isActive: true
    }
  ],
  "file-merger": [
    {
      id: 2201,
      toolId: "file-merger",
      toolName: "File Merger",
      title: "Vertical merge mode",
      description: "Combine multiple CSVs row-wise and download a single cleaned file.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 140,
      displayOrder: 1,
      isActive: true
    },
    {
      id: 2202,
      toolId: "file-merger",
      toolName: "File Merger",
      title: "Horizontal merge tips",
      description: "Join Excel exports on a shared key to compare Shopify vs ERP numbers.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 200,
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
      title: "Uploading Uniware exports",
      description: "Drop CSV exports into the wizard and let it detect the correct template.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 190,
      displayOrder: 1,
      isActive: true
    }
  ],
  "data-extractor-pro": [
    {
      id: 2501,
      toolId: "data-extractor-pro",
      toolName: "Data Extractor Pro",
      title: "Cleaning product names",
      description: "Use the extractor to normalize catalog data and remove duplicates by phone.",
      videoFileUrl: null,
      thumbnailUrl: null,
      durationSeconds: 170,
      displayOrder: 1,
      isActive: true
    }
  ]
};
