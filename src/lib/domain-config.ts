/**
 * Domain Configuration Utility for MeddeyGo Workspace
 * 
 * Priority Order:
 * 1. Production: DOMAIN/NEXT_PUBLIC_BASE_URL from env (VERCEL_URL fallback allowed)
 * 2. Development: DOMAIN from env (if set)
 * 3. Development Fallback: localhost or network IP (automatically enabled in dev mode)
 * 
 * Behavior:
 * - Development mode (NODE_ENV=development): Automatically uses localhost/IP if no domain set
 * - Production mode (NODE_ENV=production): Requires configured domain, allows VERCEL_URL fallback, NEVER allows localhost/IP
 * 
 * Usage:
 * - Always use getBaseUrl() to get the current base URL
 * - Use isProduction() to check environment
 * - Use getDomainConfig() to get full configuration
 */

export interface DomainConfig {
  baseUrl: string;
  domain: string | null;
  isProduction: boolean;
  isDevelopment: boolean;
  enableLocalFallback: boolean;
  protocol: 'http' | 'https';
  host: string;
  port: number | null;
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}

/**
 * Check if localhost fallback is enabled
 * In development mode, localhost fallback is automatically enabled
 * In production mode, localhost fallback is NEVER enabled
 */
export function isLocalFallbackEnabled(): boolean {
  // Production mode: NEVER allow localhost fallback
  if (isProduction()) {
    return false;
  }
  
  // Development mode: Automatically enable localhost fallback
  // Unless explicitly disabled
  if (isDevelopment()) {
    return process.env.ENABLE_LOCALHOST_FALLBACK !== 'false';
  }
  
  // Default: enable for safety in development
  return true;
}

/**
 * Get the base URL for the application
 * 
 * Priority:
 * 1. DOMAIN env variable (production always requires this)
 * 2. NEXT_PUBLIC_BASE_URL env variable
 * 3. Localhost/Network fallback (only if enabled in development)
 * 
 * @throws Error if no valid URL found in production mode
 */
export function getBaseUrl(): string {
  const domain = process.env.DOMAIN;
  const nextPublicUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const vercelUrl = process.env.VERCEL_URL;

  const getVercelFallback = () => {
    if (!vercelUrl) return null;
    const withProtocol = /^https?:\/\//.test(vercelUrl)
      ? vercelUrl
      : `https://${vercelUrl}`;
    console.warn(
      "[DOMAIN] DOMAIN/NEXT_PUBLIC_BASE_URL not set. Using VERCEL_URL fallback:",
      withProtocol,
    );
    return withProtocol;
  };
  
  // Production mode: MUST have domain
  if (isProduction()) {
    if (!domain && !nextPublicUrl && !vercelUrl) {
      throw new Error(
        'Production mode requires DOMAIN or NEXT_PUBLIC_BASE_URL environment variable'
      );
    }
    return domain || nextPublicUrl || getVercelFallback()!;
  }

  // Development mode: Check domain first, then fallback to localhost/IP
  if (domain) {
    return domain;
  }

  if (nextPublicUrl) {
    return nextPublicUrl;
  }

  // Development mode: Automatically fallback to localhost/network IP
  // This is the default behavior in development
  const localHost = process.env.LOCAL_HOST || 'localhost';
  const localPort = process.env.LOCAL_PORT || process.env.PORT || '4090';
  const networkIp = process.env.NETWORK_IP;

  // Prefer network IP if available
  if (networkIp) {
    return `http://${networkIp}:${localPort}`;
  }

  return `http://${localHost}:${localPort}`;
}

/**
 * Get the domain name without protocol
 */
export function getDomainName(): string {
  const baseUrl = getBaseUrl();
  try {
    const url = new URL(baseUrl);
    return url.hostname;
  } catch {
    return baseUrl.replace(/^https?:\/\//, '').split(':')[0];
  }
}

/**
 * Get the protocol (http or https)
 */
export function getProtocol(): 'http' | 'https' {
  const baseUrl = getBaseUrl();
  return baseUrl.startsWith('https') ? 'https' : 'http';
}

/**
 * Get the port number if specified
 */
export function getPort(): number | null {
  const baseUrl = getBaseUrl();
  try {
    const url = new URL(baseUrl);
    return url.port ? parseInt(url.port, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Get full domain configuration
 */
export function getDomainConfig(): DomainConfig {
  const baseUrl = getBaseUrl();
  const domain =
    process.env.DOMAIN ||
    (process.env.VERCEL_URL
      ? process.env.VERCEL_URL.replace(/^https?:\/\//, "")
      : null);
  
  return {
    baseUrl,
    domain,
    isProduction: isProduction(),
    isDevelopment: isDevelopment(),
    enableLocalFallback: isLocalFallbackEnabled(),
    protocol: getProtocol(),
    host: getDomainName(),
    port: getPort(),
  };
}

/**
 * Build a full URL with the current domain
 * 
 * @param path - Path to append (e.g., '/inventory-management')
 * @returns Full URL (e.g., 'https://meddeygo.com/inventory-management')
 */
export function buildUrl(path: string): string {
  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Build an API URL
 * 
 * @param endpoint - API endpoint (e.g., '/api/users')
 * @returns Full API URL
 */
export function buildApiUrl(endpoint: string): string {
  return buildUrl(endpoint.startsWith('/api') ? endpoint : `/api/${endpoint}`);
}

/**
 * Get tool-specific route URL
 * 
 * @param toolSlug - Tool slug from env (e.g., TOOL_INVENTORY_ROUTE)
 * @returns Full tool URL
 */
export function getToolUrl(toolSlug: string): string {
  const envKey = `TOOL_${toolSlug.toUpperCase().replace(/-/g, '_')}_ROUTE`;
  const route = process.env[envKey];
  
  if (!route) {
    console.warn(`Tool route not found for ${toolSlug}, using /tools/${toolSlug}`);
    const defaultPath =
      toolSlug === 'project-hub' ? '/' : `/tools/${toolSlug}`;
    return buildUrl(defaultPath);
  }
  
  return buildUrl(route.startsWith('/') ? route : `/${route}`);
}

/**
 * Log domain configuration (for debugging)
 */
export function logDomainConfig(): void {
  const config = getDomainConfig();
  console.log('='.repeat(60));
  console.log('MEDDEYGO WORKSPACE - DOMAIN CONFIGURATION');
  console.log('='.repeat(60));
  console.log(`Base URL:          ${config.baseUrl}`);
  console.log(`Domain:            ${config.domain || 'Not set (using fallback)'}`);
  console.log(`Environment:       ${config.isProduction ? 'Production' : 'Development'}`);
  console.log(`Protocol:          ${config.protocol}`);
  console.log(`Host:              ${config.host}`);
  console.log(`Port:              ${config.port || 'Default (80/443)'}`);
  console.log(`Local Fallback:    ${config.enableLocalFallback ? 'Enabled' : 'Disabled'}`);
  console.log('='.repeat(60));
}

/**
 * Validate domain configuration on startup
 * Throws error if configuration is invalid
 */
export function validateDomainConfig(): void {
  try {
    const config = getDomainConfig();
    
    // Production mode: MUST have domain, NO localhost fallback
    if (config.isProduction) {
      if (!config.domain && !process.env.NEXT_PUBLIC_BASE_URL && !process.env.VERCEL_URL) {
        throw new Error('Production mode requires DOMAIN or NEXT_PUBLIC_BASE_URL environment variable. Localhost/IP fallback is not allowed in production.');
      }

      // Ensure production URL is not localhost
      const baseUrl = config.baseUrl.toLowerCase();
      if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes('0.0.0.0')) {
        throw new Error('Production mode cannot use localhost or IP addresses. Use a proper domain (e.g., https://meddey.co.in)');
      }
    }

    if (!config.baseUrl) {
      throw new Error('No base URL could be determined');
    }

    // Validate URL format
    new URL(config.baseUrl);
    
    console.log('✓ Domain configuration validated successfully');
  } catch (error) {
    console.error('✗ Domain configuration validation failed:');
    console.error(error);
    throw error;
  }
}
