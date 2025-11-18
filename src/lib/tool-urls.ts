/**
 * Tool URL Resolution Utility
 *
 * ALL tools are accessed through the Meddey Tech Workspace on port 4090.
 * No direct backend port access - everything goes through /tools/* routes.
 */

export interface ToolConfig {
  name: string;
  slug: string;
  icon: string;
  description: string;
}

export const TOOLS: Record<string, ToolConfig> = {
  'project-hub': {
    name: 'Meddey Tech Workspace',
    slug: 'project-hub',
    icon: '🚀',
    description: 'Main dashboard and control center',
  },
  'inventory-management': {
    name: 'Inventory Management',
    slug: 'inventory-management',
    icon: '📦',
    description: 'Manage inventory and stock levels',
  },
  'quote-generator': {
    name: 'Quote Generator',
    slug: 'quote-generator',
    icon: '💸',
    description: 'Generate and manage customer quotes',
  },
  'order-extractor': {
    name: 'Order ID Extractor',
    slug: 'order-extractor',
    icon: '📑',
    description: 'Extract order IDs from various sources',
  },
  'gsheet-integration': {
    name: 'Google Sheets Integration',
    slug: 'gsheet-integration',
    icon: '🗂️',
    description: 'Sync data with Google Sheets',
  },
  'data-extractor-pro': {
    name: 'Data Extractor Pro',
    slug: 'data-extractor-pro',
    icon: '🧮',
    description: 'Advanced data extraction tools',
  },
  'file-merger': {
    name: 'File Merger',
    slug: 'file-merger',
    icon: '🗃️',
    description: 'Merge and process multiple files',
  },
};

type NetworkInfoResponse = {
  ip?: string | null;
};

let networkIpPromise: Promise<string | null> | null = null;

async function fetchServerNetworkIP(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!networkIpPromise) {
    networkIpPromise = fetch('/api/system/network-ip', {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const data = (await response.json()) as NetworkInfoResponse;
        return data?.ip ?? null;
      })
      .catch(() => null);
  }

  return networkIpPromise;
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function buildBase(protocol: string, host: string, port?: string | number | null): string {
  const normalizedProtocol = protocol.replace(/:$/, '');
  const portString = port?.toString() ?? '';

  const omitPort =
    !portString ||
    (normalizedProtocol === 'https' && (portString === '443' || portString === '8443')) ||
    (normalizedProtocol === 'http' && portString === '80');

  return `${normalizedProtocol}://${host}${omitPort ? '' : `:${portString}`}`;
}

/**
 * Try to determine the best base URL for the current runtime.
 * ALWAYS returns port 4090 - the single unified port.
 */
async function resolveBaseUrl(preferNetworkIP: boolean): Promise<string> {
  const explicitDomain =
    process.env.NEXT_PUBLIC_DOMAIN ||
    process.env.DOMAIN ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    null;

  if (explicitDomain) {
    return stripTrailingSlash(explicitDomain);
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    let resolvedHost = hostname;
    const UNIFIED_PORT = '4090'; // Single port for everything

    if (preferNetworkIP && isLoopback(resolvedHost)) {
      const networkIP = await fetchServerNetworkIP();
      if (networkIP) {
        resolvedHost = networkIP;
      }
    }

    return buildBase(
      protocol.replace(/:$/, ''),
      resolvedHost,
      UNIFIED_PORT,
    );
  }

  const serverProtocol =
    process.env.TOOL_PUBLIC_PROTOCOL ||
    process.env.NEXT_PUBLIC_TOOL_PROTOCOL ||
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');

  const serverHost =
    process.env.TOOL_PUBLIC_HOST ||
    process.env.NEXT_PUBLIC_TOOL_HOST ||
    process.env.DOMAIN ||
    process.env.HOST ||
    'localhost';

  const UNIFIED_PORT = '4090'; // Single port for everything

  return buildBase(serverProtocol, serverHost, UNIFIED_PORT);
}

/**
 * Get network IP from browser with server-assist fallback.
 */
export async function getNetworkIP(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const serverIP = await fetchServerNetworkIP();
  if (serverIP) {
    return serverIP;
  }

  try {
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return await new Promise<string | null>((resolve) => {
      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) {
          resolve(null);
          return;
        }

        const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
        const match = ipRegex.exec(ice.candidate.candidate);

        if (match && match[1]) {
          const ip = match[1];
          if (!ip.startsWith('127.') && !ip.startsWith('0.')) {
            pc.close();
            resolve(ip);
            return;
          }
        }
      };

      setTimeout(() => {
        pc.close();
        resolve(null);
      }, 2000);
    });
  } catch (error) {
    console.error('Failed to detect network IP:', error);
    return null;
  }
}

function buildToolPath(toolSlug: string): string {
  return toolSlug === 'project-hub' ? '' : `/tools/${toolSlug}`;
}

/**
 * Get tool URL based on priority.
 */
export async function getToolUrl(
  toolSlug: string,
  preferNetworkIP: boolean = true,
): Promise<string> {
  const tool = TOOLS[toolSlug];

  if (!tool) {
    throw new Error(`Unknown tool: ${toolSlug}`);
  }

  const base = await resolveBaseUrl(preferNetworkIP);
  const toolPath = buildToolPath(tool.slug);

  return `${base}${toolPath}`;
}

/**
 * Get all tool URLs (client-side helper).
 */
export async function getAllToolUrls(
  preferNetworkIP: boolean = true,
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};

  for (const slug of Object.keys(TOOLS)) {
    urls[slug] = await getToolUrl(slug, preferNetworkIP);
  }

  return urls;
}

/**
 * Check if a tool is running.
 */
export async function isToolRunning(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-detect best URL for a tool.
 */
export async function detectBestToolUrl(toolSlug: string): Promise<string> {
  return getToolUrl(toolSlug, true);
}

/**
 * Open tool in browser (client-side only).
 */
export async function openToolInBrowser(
  toolSlug: string,
  preferNetworkIP: boolean = true,
): Promise<void> {
  if (typeof window === 'undefined') {
    console.error('openToolInBrowser can only be called on client-side');
    return;
  }

  const url = await getToolUrl(toolSlug, preferNetworkIP);
  window.open(url, '_blank', 'noopener,noreferrer');
}
