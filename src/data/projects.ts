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
    repoPath: 'tools/quote-app',
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
    summary: 'Automate Google Sheets updates with intelligent data matching, company detection, and date preservation.',
    category: 'automation',
    highlights: [
      'Google Sheets automation',
      'Intelligent data matching',
      'Company detection',
      'Date preservation',
      'Bulk updates',
      'Web-based wizard interface'
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
  }
];
