type LaunchStep = {
  label: string;
  command?: string;
  description?: string;
};

type ResourceLink = {
  label: string;
  href?: string;  // Full URL for external links or integrated tool routes
  note?: string;
  route?: string; // Internal Next.js route for integrated tools
  port?: number;  // Port number for standalone tools
};

export type Project = {
  id: string;
  name: string;
  headline: string;
  summary: string;
  category: "automation" | "data" | "quotations" | "ai";
  highlights: string[];
  tags: string[];
  icon: "sheet" | "sparkles" | "database" | "waypoints";
  accent: string;
  repoPath: string;
  resources: ResourceLink[];
  launchSteps: LaunchStep[];
};

export const projects: Project[] = [
  {
    id: 'ai-seo-strategist',
    name: 'AI SEO Strategist',
    headline: 'Plan, Improve, and Optimize Content with AI',
    summary: 'Chat-driven keyword research, content improvement, image edits, and strategy planning — all in one tool.',
    category: 'ai',
    highlights: [
      'Keyword research',
      'Content strategist & improver',
      'Image edits',
      'AI chatbot assistance'
    ],
    tags: ['seo', 'content', 'ai', 'strategy'],
    icon: 'sparkles',
    accent: 'teal',
    repoPath: 'ai-seo-strategist (4)',
    resources: [
      { label: 'Launch Tool', route: '/tools/ai-seo-strategist', note: 'Access AI SEO Strategist' }
    ],
    launchSteps: [
      { label: 'Start AI SEO Strategist', description: 'The tool backend will start automatically on port 4098' }
    ]
  },
  {
    id: 'quote-generator',
    name: 'Quote Generator',
    headline: 'Professional Quote Management System',
    summary: 'Create, manage, and track quotations with pricing rules, product management, and template customization.',
    category: 'quotations',
    highlights: [
      'Create and manage quotations',
      'Pricing rules and product management',
      'Template customization',
      'User management and authentication',
      'PDF export functionality'
    ],
    tags: ['quotes', 'pricing', 'management', 'pdf'],
    icon: 'sparkles',
    accent: 'blue',
    repoPath: 'quote_app',
    resources: [
      {
        label: 'Launch Tool',
        route: '/tools/quote-generator',
        note: 'Access the Quote Generator application'
      }
    ],
    launchSteps: [
      {
        label: 'Start Quote Generator',
        description: 'The Quote Generator backend will start automatically on port 4094'
      }
    ]
  },
  {
    id: 'order-extractor',
    name: 'Order ID Extractor',
    headline: 'Uniware & Shopify Order Details Extractor',
    summary: 'Extract order details from Uniware and Shopify by AWB numbers or Order IDs. Supports bulk processing and CSV/Excel export.',
    category: 'data',
    highlights: [
      'AWB number lookup',
      'Order ID lookup',
      'Uniware integration',
      'Shopify integration',
      'Bulk processing',
      'CSV/Excel export'
    ],
    tags: ['orders', 'extraction', 'uniware', 'shopify'],
    icon: 'database',
    accent: 'green',
    repoPath: 'tools/order-id-extractor',
    resources: [
      {
        label: 'Launch Tool',
        route: '/tools/order-extractor',
        note: 'Access the Order ID Extractor application'
      }
    ],
    launchSteps: [
      {
        label: 'Start Order Extractor',
        description: 'The Order Extractor backend will start automatically on port 4097'
      }
    ]
  },
  {
    id: 'file-merger',
    name: 'File Merger',
    headline: 'Excel & CSV File Merger',
    summary: 'Merge multiple Excel and CSV files into a single master file. Supports vertical and horizontal merging options.',
    category: 'data',
    highlights: [
      'Excel file merging',
      'CSV file merging',
      'Vertical and horizontal merge options',
      'Bulk file processing',
      'Session-based file management'
    ],
    tags: ['merge', 'excel', 'csv', 'files'],
    icon: 'database',
    accent: 'purple',
    repoPath: 'tools/mer',
    resources: [
      {
        label: 'Launch Tool',
        route: '/tools/file-merger',
        note: 'Access the File Merger application'
      }
    ],
    launchSteps: [
      {
        label: 'Start File Merger',
        description: 'The File Merger will start automatically on port 4093'
      }
    ]
  },
  {
    id: 'inventory-management',
    name: 'Inventory Management',
    headline: 'Shopify Order & Inventory Management System',
    summary: 'Comprehensive inventory management system with Shopify integration, Google Sheets sync, vendor management, and automated reminders.',
    category: 'automation',
    highlights: [
      'Shopify order management',
      'Inventory tracking',
      'Google Sheets integration',
      'Vendor management',
      'Automated reminders',
      'PDF generation',
      'Background sync'
    ],
    tags: ['inventory', 'shopify', 'orders', 'management'],
    icon: 'sheet',
    accent: 'orange',
    repoPath: 'tools/inventory-management',
    resources: [
      {
        label: 'Launch Tool',
        route: '/tools/inventory-management',
        note: 'Access the Inventory Management application'
      }
    ],
    launchSteps: [
      {
        label: 'Start Inventory Management',
        description: 'The Inventory Management backend will start automatically on port 4096'
      }
    ]
  },
  {
    id: 'gsheet-integration',
    name: 'Google Sheets Integration',
    headline: 'Google Sheets Automation Wizard',
    summary: 'Automate Google Sheets updates with intelligent data matching, company detection, and date preservation. Streamlit-based wizard interface.',
    category: 'automation',
    highlights: [
      'Google Sheets automation',
      'Intelligent data matching',
      'Company detection',
      'Date preservation',
      'Bulk updates',
      'Streamlit wizard interface'
    ],
    tags: ['google-sheets', 'automation', 'data', 'matching'],
    icon: 'sheet',
    accent: 'red',
    repoPath: 'tools/GSHEET',
    resources: [
      {
        label: 'Launch Tool',
        route: '/tools/gsheet-integration',
        note: 'Access the Google Sheets Integration wizard'
      }
    ],
    launchSteps: [
      {
        label: 'Start Google Sheets Integration',
        description: 'The Google Sheets Integration will start automatically on port 4095'
      }
    ]
  },
  {
    id: 'data-extractor-pro',
    name: 'Data Extractor Pro',
    headline: 'Advanced Product Data Extractor',
    summary: 'Extract product names from CSV files with intelligent pattern matching, duplicate removal, and company-based file grouping.',
    category: 'data',
    highlights: [
      'Product name extraction',
      'Intelligent pattern matching',
      'Duplicate removal by phone',
      'Company-based file grouping',
      'CSV processing',
      'Bulk file processing'
    ],
    tags: ['extraction', 'products', 'csv', 'data'],
    icon: 'database',
    accent: 'teal',
    repoPath: 'tools/extractor-pro-v2',
    resources: [
      {
        label: 'Launch Tool',
        route: '/tools/data-extractor-pro',
        note: 'Access the Data Extractor Pro application'
      }
    ],
    launchSteps: [
      {
        label: 'Start Data Extractor Pro',
        description: 'The Data Extractor Pro will start automatically on port 4092'
      }
    ]
  }
];
