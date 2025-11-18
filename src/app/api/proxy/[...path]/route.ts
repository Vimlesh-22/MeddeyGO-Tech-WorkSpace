import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDomainName } from '@/lib/domain-config';
import { getSessionUserFromRequest } from '@/lib/auth/session';
import { getDbPool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2/promise';

// Load ports dynamically from .ports.json and environment
// This function is called on each request to ensure we always have the latest port information
function loadBackendPorts(): Record<string, number> {
  const defaultPorts: Record<string, number> = {
    'data-extractor-pro': Number(process.env.EXTRACTOR_PORT ?? 4092),
    'file-merger': Number(process.env.FILE_MERGER_PORT ?? 4093),
    'quote-generator': Number(process.env.QUOTE_PORT ?? 4094),
    'gsheet-integration': Number(process.env.GSHEET_PORT ?? 4095),
    'inventory-management': Number(process.env.INVENTORY_PORT ?? 4096),
    'order-extractor': Number(process.env.ORDER_EXTRACTOR_PORT ?? 4097),
    'ai-seo-strategist': Number(process.env.AI_SEO_PORT ?? 4098),
  };

  // Try to load from .ports.json file (created by Python apps when they allocate ports)
  try {
    const portsFilePath = path.join(process.cwd(), '.ports.json');
    if (fs.existsSync(portsFilePath)) {
      const portsData = JSON.parse(fs.readFileSync(portsFilePath, 'utf-8'));
      
      // Map .ports.json keys to tool slugs
      // Python apps use different keys, so we map them
      if (portsData['data-extractor']?.port) {
        defaultPorts['data-extractor-pro'] = portsData['data-extractor'].port;
      }
      if (portsData['mer']?.port) {
        defaultPorts['file-merger'] = portsData['mer'].port;
      }
      if (portsData['gsheet']?.port) {
        defaultPorts['gsheet-integration'] = portsData['gsheet'].port;
      }
      if (portsData['quote-generator']?.port) {
        defaultPorts['quote-generator'] = portsData['quote-generator'].port;
      }
      if (portsData['order-extractor']?.port) {
        defaultPorts['order-extractor'] = portsData['order-extractor'].port;
      }
      if (portsData['inventory-management']?.port) {
        defaultPorts['inventory-management'] = portsData['inventory-management'].port;
      }
      
      console.log('[Proxy] Loaded ports from .ports.json:', portsData);
    }
  } catch (error) {
    console.warn('[Proxy] Could not load .ports.json, using defaults:', error);
  }

  return defaultPorts;
}

// Backend port mapping - reloaded on each request to handle dynamic port allocation
// Note: We reload on each request to catch port changes when services restart
let BACKEND_PORTS_CACHE: Record<string, number> | null = null;
let CACHE_TIMESTAMP = 0;
const CACHE_TTL = 5000; // 5 seconds cache

function getBackendPorts(): Record<string, number> {
  const now = Date.now();
  if (!BACKEND_PORTS_CACHE || (now - CACHE_TIMESTAMP) > CACHE_TTL) {
    BACKEND_PORTS_CACHE = loadBackendPorts();
    CACHE_TIMESTAMP = now;
  }
  return BACKEND_PORTS_CACHE;
}

// Cache for application login settings
let LOGIN_SETTINGS_CACHE: Record<string, boolean> | null = null;
let LOGIN_SETTINGS_CACHE_TIMESTAMP = 0;
const LOGIN_SETTINGS_CACHE_TTL = 30000; // 30 seconds cache

async function getApplicationLoginSettings(): Promise<Record<string, boolean>> {
  const now = Date.now();
  if (!LOGIN_SETTINGS_CACHE || (now - LOGIN_SETTINGS_CACHE_TIMESTAMP) > LOGIN_SETTINGS_CACHE_TTL) {
    try {
      const pool = getDbPool();
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT tool_slug, use_own_login FROM application_login_settings"
      );
      
      LOGIN_SETTINGS_CACHE = {};
      for (const row of rows) {
        LOGIN_SETTINGS_CACHE[row.tool_slug] = Boolean(row.use_own_login);
      }
      LOGIN_SETTINGS_CACHE_TIMESTAMP = now;
    } catch (error) {
      console.warn('[Proxy] Failed to load application login settings, defaulting to project-hub login:', error);
      // Default to requiring project-hub login if we can't load settings
      LOGIN_SETTINGS_CACHE = {};
    }
  }
  return LOGIN_SETTINGS_CACHE || {};
}

async function usesOwnLogin(toolSlug: string): Promise<boolean> {
  const settings = await getApplicationLoginSettings();
  return settings[toolSlug] === true;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return handleProxy(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return handleProxy(request, path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return handleProxy(request, path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return handleProxy(request, path);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return handleProxy(request, path);
}

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return handleProxy(request, path);
}

async function handleProxy(request: NextRequest, pathSegments: string[]) {
  try {
    // Get ports dynamically (cached for 5 seconds to handle port changes)
    const currentPorts = getBackendPorts();
    
    // Handle special case: static assets might come as /_proxy/static/...
    // We need to find which tool is making the request by checking the referer
    const referer = request.headers.get('referer') || '';
    const url = new URL(request.url);
    
    // Extract tool slug from path or referer
    let toolSlug = pathSegments[0];
    let remainingPath = pathSegments.slice(1).join('/');
    
    // Handle empty path segments (root proxy request)
    if (!toolSlug || toolSlug === '') {
      return NextResponse.json(
        { error: 'Invalid proxy path', message: 'Tool slug is required in the proxy path', path: pathSegments.join('/') },
        { status: 400 }
      );
    }
    
    // SECURITY: Check authentication before proxying (except for static assets)
    // Allow static assets (CSS, JS, images) to be accessed without auth for login page
    // Also allow Vite dev server paths (@vite/client, @react-refresh, etc.)
    const isStaticAsset = remainingPath.match(/\.(css|js|jsx|ts|tsx|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json)$/i) ||
                         toolSlug === 'static' ||
                         remainingPath.startsWith('static/') ||
                         remainingPath.startsWith('assets/') ||
                         remainingPath.startsWith('_next/') ||
                         remainingPath.startsWith('@vite/') ||
                         remainingPath.startsWith('@react-refresh') ||
                         remainingPath.startsWith('@id/') ||
                         remainingPath === '@vite/client' ||
                         remainingPath.startsWith('node_modules/') ||
                         remainingPath.includes('@vite/client') ||
                         remainingPath.includes('@react-refresh');
    
    // If path starts with 'static', '_stcore', or '_streamlit', try to extract tool from referer
    if (toolSlug === 'static' || toolSlug === '_stcore' || toolSlug === '_streamlit' || toolSlug?.startsWith('static') || toolSlug === 'assets' || toolSlug?.startsWith('assets')) {
      // Try both /tools/ and /_proxy/ patterns for backward compatibility
      const refererMatch = referer.match(/\/(?:tools|_proxy)\/([^\/]+)/);
      if (refererMatch) {
        const extractedSlug = refererMatch[1];
        toolSlug = extractedSlug;
        // Reconstruct the full path including 'static', '_stcore', or '_streamlit'
        remainingPath = pathSegments.join('/');
        console.log(`[Proxy] Extracted tool slug "${toolSlug}" from referer for static asset: ${remainingPath}`);
      }
    }
    
    // If still no tool slug, try to get from URL path
    if (!toolSlug || !currentPorts[toolSlug]) {
      // Try to extract from the full path
      const fullPath = pathSegments.join('/');
      for (const [slug] of Object.entries(currentPorts)) {
        if (fullPath.startsWith(slug + '/') || fullPath === slug) {
          toolSlug = slug;
          remainingPath = fullPath.substring(slug.length + 1);
          console.log(`[Proxy] Extracted tool slug "${toolSlug}" from path: ${remainingPath}`);
          break;
        }
      }
    }
    
    const backendPort = currentPorts[toolSlug];
    
    if (!backendPort) {
      return NextResponse.json(
        { error: `Unknown tool: ${toolSlug || 'unknown'}. Path: ${pathSegments.join('/')}` },
        { status: 404 }
      );
    }
    
    // Check authentication for non-static requests AFTER tool slug is resolved
    // Skip authentication if the application uses its own login OR if it's a login/register endpoint
    if (!isStaticAsset) {
      const appUsesOwnLogin = await usesOwnLogin(toolSlug);
      
      // Allow login/register endpoints to pass through without project-hub auth
      // These endpoints handle their own authentication
      // Check both with and without leading slash, and also check if path ends with login/register
      const normalizedPath = remainingPath.startsWith('/') ? remainingPath : `/${remainingPath}`;
      const isLoginEndpoint = normalizedPath.includes('/api/users/login') || 
                              normalizedPath.includes('/api/users/register') ||
                              normalizedPath.includes('/api/auth/login') ||
                              normalizedPath.includes('/api/auth/register') ||
                              remainingPath.endsWith('/login') ||
                              remainingPath.endsWith('/register') ||
                              remainingPath === 'api/users/login' ||
                              remainingPath === 'api/users/register' ||
                              remainingPath === 'api/auth/login' ||
                              remainingPath === 'api/auth/register';
      
      if (!appUsesOwnLogin && !isLoginEndpoint) {
        // Application uses project-hub login, require authentication
        const user = await getSessionUserFromRequest(request);
        
        if (!user) {
          // Log authentication failure for debugging
          const cookieHeader = request.headers.get('cookie');
          console.log(`[Proxy Auth] ${toolSlug}: Authentication failed for ${remainingPath || '/'}`);
          console.log(`[Proxy Auth] Cookie header present: ${!!cookieHeader}, Method: ${request.method}`);
          if (cookieHeader) {
            console.log(`[Proxy Auth] Cookie header length: ${cookieHeader.length}, Contains session: ${cookieHeader.includes('project_hub_session') || cookieHeader.includes('project_hub_fallback_token')}`);
          }
          
          // Check if this is a browser request (HTML) or API request (JSON)
          const acceptHeader = request.headers.get('accept') || '';
          const isBrowserRequest = acceptHeader.includes('text/html') || 
                                   acceptHeader.includes('application/xhtml+xml') || 
                                   (!acceptHeader.includes('application/json') && request.method === 'GET');
          
          if (isBrowserRequest) {
            // Redirect to login page for browser requests
            const loginUrl = new URL('/login', request.url);
            loginUrl.searchParams.set('redirect', request.url);
            return NextResponse.redirect(loginUrl);
          } else {
            // Return 401 for API requests
            return NextResponse.json(
              { error: 'Authentication required', message: 'Please log in to access this resource' },
              { status: 401 }
            );
          }
        }
        
        // Log authenticated access for security monitoring
        console.log(`[Proxy Auth] ${toolSlug}: Authenticated user ${user.email} (${user.role}) accessing ${remainingPath || '/'}`);
      } else {
        // Application uses its own login OR it's a login endpoint, skip project-hub authentication
        if (isLoginEndpoint) {
          console.log(`[Proxy Auth] ${toolSlug}: Login/register endpoint detected, skipping project-hub authentication for ${remainingPath || '/'}`);
        } else {
          console.log(`[Proxy Auth] ${toolSlug}: Using own login, skipping project-hub authentication for ${remainingPath || '/'}`);
        }
      }
    }

    // Handle root path - if no remaining path, it's the root
    if (!remainingPath && pathSegments.length === 1) {
      remainingPath = '';
    }
    
    // Build backend URL - ensure we don't have double slashes
    const pathPart = remainingPath ? `/${remainingPath}` : '';
    // For Streamlit root, ensure we're requesting the root path correctly
    const backendPath = pathPart || '/';
    const backendUrl = `http://127.0.0.1:${backendPort}${backendPath}${request.nextUrl.search}`;
    
    console.log(`[Proxy] ${toolSlug}: Proxying ${request.method} ${request.url} -> ${backendUrl}`);
    console.log(`[Proxy] ${toolSlug}: Path segments: [${pathSegments.join(', ')}], Remaining: "${remainingPath}", Backend path: "${backendPath}"`);
    
    // Forward the request
    const headers = new Headers(request.headers);
    headers.delete('host'); // Remove host header to avoid conflicts
    
    // Ensure cookies are forwarded (they should be in the cookie header already)
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      headers.set('cookie', cookieHeader);
    }
    
    // Forward authenticated user info to backend (for quote-generator and other tools that need it)
    if (!isStaticAsset) {
      const appUsesOwnLogin = await usesOwnLogin(toolSlug);
      if (!appUsesOwnLogin) {
        // Application uses project-hub login, forward user info
        const user = await getSessionUserFromRequest(request);
        if (user) {
          headers.set('X-Proxy-Authenticated', 'true');
          headers.set('X-Proxy-User', JSON.stringify({
            id: user.id,
            userId: user.id,
            email: user.email,
            role: user.role,
            displayName: user.displayName
          }));
        }
      }
    }
    
    const domain = getDomainName();
    headers.set('X-Forwarded-Host', request.headers.get('host') || domain);
    headers.set('X-Forwarded-Proto', url.protocol.slice(0, -1)); // Remove trailing :
    
    const body = request.method !== 'GET' && request.method !== 'HEAD'
      ? await request.arrayBuffer()
      : undefined;

    let backendResponse: Response;
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      
      // Use longer timeout for PDF generation endpoints (5 minutes) and refresh-fulfillment (2 minutes)
      const isPdfEndpoint = remainingPath.includes('vendor-pdf') || remainingPath.includes('pdf');
      const isRefreshFulfillment = remainingPath.includes('refresh-fulfillment');
      const timeoutDuration = isPdfEndpoint ? 300000 : (isRefreshFulfillment ? 120000 : 30000); // 5 minutes for PDF, 2 minutes for refresh-fulfillment, 30 seconds for others
      
      timeoutId = setTimeout(() => controller.abort(), timeoutDuration);
      
      // Log the exact request we're making
      console.log(`[Proxy] ${toolSlug}: Fetching from ${backendUrl}`);
      console.log(`[Proxy] ${toolSlug}: Method: ${request.method}, Headers:`, Object.fromEntries(headers.entries()));
      
      backendResponse = await fetch(backendUrl, {
        method: request.method,
        headers,
        body,
        signal: controller.signal,
        redirect: 'follow', // Follow redirects
      });
      
      // Log response details
      console.log(`[Proxy] ${toolSlug}: Response status: ${backendResponse.status} ${backendResponse.statusText}`);
      console.log(`[Proxy] ${toolSlug}: Response headers:`, Object.fromEntries(backendResponse.headers.entries()));
      
      if (timeoutId) clearTimeout(timeoutId);
    } catch (fetchError) {
      if (timeoutId) clearTimeout(timeoutId);
      console.error(`Proxy fetch error for ${toolSlug}:`, fetchError);
      
      // Check if it's a connection error
      if (fetchError instanceof TypeError && fetchError.message.includes('fetch failed')) {
        // Check if this is a browser request (HTML) or API request (JSON)
        const acceptHeader = request.headers.get('accept') || '';
        const isBrowserRequest = acceptHeader.includes('text/html') || 
                                 acceptHeader.includes('application/xhtml+xml') ||
                                 !acceptHeader.includes('application/json');
        
        if (isBrowserRequest) {
          // Return HTML error page for browser requests
          const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Unavailable - ${toolSlug}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
    }
    .error-container {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      max-width: 600px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }
    .error-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #e74c3c;
      margin: 0 0 1rem 0;
      font-size: 1.5rem;
    }
    .error-details {
      background: #f8f9fa;
      border-left: 4px solid #e74c3c;
      padding: 1rem;
      margin: 1rem 0;
      text-align: left;
      border-radius: 4px;
    }
    .error-details p {
      margin: 0.5rem 0;
      font-size: 0.9rem;
    }
    .error-details strong {
      color: #e74c3c;
    }
    .instructions {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #e8f5e9;
      border-radius: 4px;
      text-align: left;
    }
    .instructions h3 {
      margin-top: 0;
      color: #2e7d32;
    }
    .instructions ol {
      margin: 0.5rem 0;
      padding-left: 1.5rem;
    }
    .instructions li {
      margin: 0.5rem 0;
      font-size: 0.9rem;
    }
    code {
      background: #f4f4f4;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">⚠️</div>
    <h1>Service Unavailable</h1>
    <p>The <strong>${toolSlug}</strong> backend is not running.</p>
    <div class="error-details">
      <p><strong>Tool:</strong> ${toolSlug}</p>
      <p><strong>Expected Port:</strong> ${backendPort}</p>
      <p><strong>Backend URL:</strong> <code>${backendUrl}</code></p>
    </div>
    <div class="instructions">
      <h3>To fix this issue:</h3>
      <ol>
        <li>Check if the backend is started (look for startup messages in the console)</li>
        <li>Verify the port is correct in <code>project-hub/.env</code></li>
        <li>For Quote Generator: Ensure MongoDB is running and <code>QUOTE_MONGODB_URI</code> is set</li>
        <li>Restart the workspace: <code>cd "E:\\Web Auto\\extr\\project-hub" && npm run dev</code></li>
      </ol>
    </div>
  </div>
</body>
</html>`;
          
          return new NextResponse(errorHtml, {
            status: 503,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
            },
          });
        } else {
          // Return JSON for API requests with detailed error message
          const errorMessage = toolSlug === 'data-extractor-pro' 
            ? `The Data Extractor Pro backend server is not running on port ${backendPort}. Please ensure the server is started with: npm run dev:extractor`
            : `The ${toolSlug} backend is not running on port ${backendPort}. Please ensure the tool is started.`;
          
          return NextResponse.json(
            { 
              status: 'error',
              error: `Failed to connect to ${toolSlug}`,
              message: errorMessage,
              details: `The tool backend is not running on port ${backendPort}. Please ensure the tool is started.`,
              tool: toolSlug,
              port: backendPort,
              url: backendUrl
            },
            { status: 503 } // Service Unavailable
          );
        }
      }
      
      // Check if it's a timeout (abort signal)
      if (fetchError instanceof Error && (fetchError.name === 'AbortError' || fetchError.message.includes('aborted'))) {
        const isPdfEndpoint = remainingPath.includes('vendor-pdf') || remainingPath.includes('pdf');
        const isRefreshFulfillment = remainingPath.includes('refresh-fulfillment');
        const timeoutDuration = isPdfEndpoint ? '5 minutes' : (isRefreshFulfillment ? '2 minutes' : '30 seconds');
        return NextResponse.json(
          { 
            error: `Request timeout for ${toolSlug}`,
            details: `The tool backend did not respond within ${timeoutDuration}.`,
            tool: toolSlug,
            port: backendPort,
            endpoint: remainingPath
          },
          { status: 504 } // Gateway Timeout
        );
      }
      
      // Generic error
      return NextResponse.json(
        { 
          error: `Failed to proxy request to ${toolSlug}`,
          details: fetchError instanceof Error ? fetchError.message : String(fetchError),
          tool: toolSlug,
          port: backendPort
        },
        { status: 502 } // Bad Gateway
      );
    }

    // Get response body - ensure we read the complete response
    // CRITICAL: Always read as ArrayBuffer first to preserve binary data
    // fetch() automatically handles decompression, so we get the decompressed content
    const contentType = backendResponse.headers.get('content-type') || '';
    const contentEncoding = backendResponse.headers.get('content-encoding');
    
    // Log encoding info for debugging
    if (contentEncoding) {
      console.log(`[Proxy] ${toolSlug}: Response is compressed with ${contentEncoding} (will be auto-decompressed by fetch)`);
    }
    
    // Always read as ArrayBuffer first to preserve binary data (JS, CSS, images, etc.)
    const responseBody: ArrayBuffer = await backendResponse.arrayBuffer();
    let responseText: string | null = null;
    
    // Only decode to text if it's actually text content (HTML, CSS, JS as text)
    // Also check for HTML-like content even if content-type isn't set correctly
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      // For HTML, decode to text for rewriting
      responseText = new TextDecoder().decode(responseBody);
      console.log(`[Proxy] ${toolSlug}: Read as HTML text - ${responseText.length} chars, ${responseBody.byteLength} bytes`);
    } else if (contentType.includes('text/') && !contentType.includes('javascript') && !contentType.includes('application/javascript')) {
      // For other text types (but not JS), decode to text
      responseText = new TextDecoder().decode(responseBody);
      console.log(`[Proxy] ${toolSlug}: Read as text - ${responseText.length} chars, ${responseBody.byteLength} bytes`);
    } else if (!contentType || contentType === '' || contentType.includes('application/octet-stream')) {
      // If no content-type or generic binary, check if it looks like HTML
      const textPreview = new TextDecoder('utf-8', { fatal: false }).decode(responseBody.slice(0, 1024));
      if (textPreview.trim().startsWith('<!DOCTYPE') || textPreview.trim().startsWith('<html') || textPreview.trim().startsWith('<head')) {
        // Looks like HTML, decode fully
        responseText = new TextDecoder().decode(responseBody);
        console.log(`[Proxy] ${toolSlug}: Detected HTML content (no content-type), read as text - ${responseText.length} chars`);
      } else {
        // For binary responses (JS, CSS, images, etc.), keep as ArrayBuffer
        console.log(`[Proxy] ${toolSlug}: Read as binary - ${responseBody.byteLength} bytes, Content-Type: ${contentType || 'none'}`);
      }
    } else {
      // For binary responses (JS, CSS, images, etc.), keep as ArrayBuffer
      console.log(`[Proxy] ${toolSlug}: Read as binary - ${responseBody.byteLength} bytes, Content-Type: ${contentType}`);
    }
    
    // Log for debugging
    console.log(`[Proxy] ${toolSlug}: ${backendResponse.status} ${backendResponse.statusText}, Content-Type: ${contentType}, Size: ${responseBody.byteLength} bytes`);
    
    let finalBody = responseBody;
    
    // Check if response is empty or error
    if (responseBody.byteLength === 0 && backendResponse.status >= 400) {
      console.error(`[Proxy] ${toolSlug}: Empty error response from backend`);
      return NextResponse.json(
        { 
          error: `Backend returned empty response`,
          details: `Status: ${backendResponse.status} ${backendResponse.statusText}`,
          tool: toolSlug,
          port: backendPort,
          url: backendUrl
        },
        { status: backendResponse.status }
      );
    }
    
    // Check if this is HTML content (either by content-type or by content)
    // Also check if we have text that looks like HTML
    let isHtmlContent = contentType.includes('text/html') || contentType.includes('application/xhtml');
    
    // If we don't have text yet but might have HTML, decode it
    if (!isHtmlContent && !responseText && (contentType === '' || !contentType || contentType.includes('application/octet-stream'))) {
      const textPreview = new TextDecoder('utf-8', { fatal: false }).decode(responseBody.slice(0, 1024));
      if (textPreview.trim().startsWith('<!DOCTYPE') || textPreview.trim().startsWith('<html') || textPreview.trim().startsWith('<head')) {
        responseText = new TextDecoder().decode(responseBody);
        isHtmlContent = true;
        console.log(`[Proxy] ${toolSlug}: Detected HTML content by content inspection`);
      }
    }
    
    // Also check if we already have text that looks like HTML
    if (!isHtmlContent && responseText) {
      isHtmlContent = responseText.trim().startsWith('<!DOCTYPE') || 
                      responseText.trim().startsWith('<html') || 
                      responseText.trim().startsWith('<head');
    }
    
    if (isHtmlContent) {
      try {
        // Use the text we already read, or decode if we read as binary
        const text = responseText || new TextDecoder().decode(responseBody);
        
        // Log HTML snippet for debugging (not full content to avoid log spam)
        console.log(`[Proxy] ${toolSlug}: HTML content (${text.length} chars), first 500 chars: ${text.substring(0, 500)}...`);
        
        // Check if we actually have HTML content
        if (!text.includes('<html') && !text.includes('<!DOCTYPE') && !text.includes('<head')) {
          console.warn(`[Proxy] ${toolSlug}: Response claims to be HTML but doesn't contain HTML tags`);
          console.log(`[Proxy] ${toolSlug}: This might be an error page or redirect`);
        }
        
        // Check if it's just a comment (Streamlit sometimes returns minimal HTML)
        if (text.trim().startsWith('<!--') && text.length < 2000) {
          console.error(`[Proxy] ${toolSlug}: WARNING - HTML appears to be just a comment, not full page!`);
          console.error(`[Proxy] ${toolSlug}: This suggests Streamlit returned an error or minimal response`);
        }
        
        // For Streamlit, we need to be more careful with the base tag
        // Streamlit's JavaScript expects specific paths, so we'll rewrite paths instead of using base tag
        let rewritten = text;
        
        // Only add base tag if it's not Streamlit (Streamlit handles paths differently)
        const isStreamlit = text.includes('streamlit') || text.includes('_stcore');
        
        if (!isStreamlit) {
          // Remove any existing base tags that might interfere
          rewritten = rewritten.replace(/<base[^>]*>/gi, '');
          
          // Add base tag after <head> to set the correct base path
          const baseTag = `<base href="/_proxy/${toolSlug}/">`;
          
          // Inject proxy mode detection script BEFORE base tag
          const proxyDetectionScript = `
<script>
  // Inject proxy mode detection - set before page loads
  (function() {
    window.__PROXY_MODE__ = true;
    window.__TOOL_SLUG__ = '${toolSlug}';
    window.__PROXY_BASE__ = '/_proxy/${toolSlug}';
    window.__TOOL_PROXY__ = '/_proxy/${toolSlug}';
    window.__TOOL_BASE__ = '/tools/${toolSlug}';
    console.log('[Proxy] Injected proxy mode detection:', {
      proxyMode: window.__PROXY_MODE__,
      toolSlug: window.__TOOL_SLUG__,
      proxyBase: window.__PROXY_BASE__,
      toolProxy: window.__TOOL_PROXY__,
      toolBase: window.__TOOL_BASE__
    });
  })();
</script>`;
          
          if (rewritten.includes('<head')) {
            rewritten = rewritten.replace(/<head[^>]*>/i, `$&${proxyDetectionScript}${baseTag}`);
          } else if (rewritten.includes('<html')) {
            // If no head tag but has html tag, add head with script and base
            rewritten = rewritten.replace(/<html[^>]*>/i, `$&<head>${proxyDetectionScript}${baseTag}</head>`);
          } else {
            // Last resort: add at the beginning
            rewritten = proxyDetectionScript + baseTag + '\n' + rewritten;
          }
        } else {
          // For Streamlit, remove any existing base tags (they interfere with Streamlit's routing)
          // Streamlit uses relative paths and constructs URLs dynamically, so base tags cause issues
          rewritten = rewritten.replace(/<base[^>]*>/gi, '');
          
            // Still inject proxy detection for Streamlit
            // Also inject WebSocket proxy configuration
            const wsProxyPort = process.env.WS_PROXY_PORT || '4099';
            const domain = getDomainName();
            const wsProxyHost = request.headers.get('host')?.split(':')[0] || domain;
            // const protocol = getProtocol(); // Not used in this context
            const proxyDetectionScript = `
    <script>
      // Inject proxy mode detection for Streamlit
      (function() {
        window.__PROXY_MODE__ = true;
        window.__TOOL_SLUG__ = '${toolSlug}';
        window.__PROXY_BASE__ = '/_proxy/${toolSlug}';
        window.__WS_PROXY_HOST__ = '${wsProxyHost}';
        window.__WS_PROXY_PORT__ = '${wsProxyPort}';
        
        // Override WebSocket constructor to route through WebSocket proxy
        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
          // If URL contains _stcore, _streamlit, or /_proxy/ (proxied Streamlit URLs), rewrite to use WebSocket proxy
          if (typeof url === 'string' && (url.includes('_stcore') || url.includes('_streamlit') || url.includes('/_proxy/'))) {
            try {
              // Extract the path from the URL
              let path = url;
              if (url.startsWith('ws://') || url.startsWith('wss://')) {
                try {
                  const urlObj = new URL(url);
                  path = urlObj.pathname;
                } catch (e) {
                  // If URL parsing fails, try regex extraction
                  const match = url.match(/\/[^\/]+(\/_stcore\/[^"']+|\/_streamlit\/[^"']+)/);
                  if (match) {
                    path = match[1];
                  } else {
                    path = url.replace(/^wss?:\/\/[^\/]+/, '');
                  }
                }
              } else if (url.startsWith('/')) {
                path = url;
              }
              
              // Remove /_proxy/gsheet-integration prefix if present
              path = path.replace(/^\/_proxy\/[^\/]+\//, '/');
              
              // Ensure path starts with /
              if (!path.startsWith('/')) {
                path = '/' + path;
              }
              
              // Construct new URL with WebSocket proxy
              const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
              const wsHost = window.__WS_PROXY_HOST__ || window.location.hostname || '${wsProxyHost}';
              const wsPort = window.__WS_PROXY_PORT__ || '4099';
              const newUrl = \`\${protocol}//\${wsHost}:\${wsPort}\${path}\`;
              console.log('[Streamlit] Rewriting WebSocket URL:', url, '->', newUrl);
              return new OriginalWebSocket(newUrl, protocols);
            } catch (error) {
              console.error('[Streamlit] Error rewriting WebSocket URL:', error, url);
              // Fallback: try original URL
              return new OriginalWebSocket(url, protocols);
            }
          }
          // For non-Streamlit WebSocket URLs, use original constructor
          return new OriginalWebSocket(url, protocols);
        };
      })();
    </script>`;
          
          // Inject WebSocket override BEFORE any other scripts
          // This ensures it runs before Streamlit's code
          if (rewritten.includes('<head')) {
            // Insert at the very beginning of <head> to ensure it runs first
            rewritten = rewritten.replace(/<head[^>]*>/i, `$&${proxyDetectionScript}`);
          } else if (rewritten.includes('<html')) {
            rewritten = rewritten.replace(/<html[^>]*>/i, `$&<head>${proxyDetectionScript}</head>`);
          } else if (rewritten.includes('<!DOCTYPE')) {
            // Insert right after DOCTYPE
            rewritten = rewritten.replace(/<!DOCTYPE[^>]*>/i, `$&\n${proxyDetectionScript}`);
          } else {
            // Last resort: prepend to the entire document
            rewritten = proxyDetectionScript + '\n' + rewritten;
          }
        }
        
        // Rewrite absolute paths to include proxy prefix (but not if already has _proxy or http)
        rewritten = rewritten
          .replace(/href="\/(?!\/|_proxy|http|https)/g, `href="/_proxy/${toolSlug}/`)
          .replace(/src="\/(?!\/|_proxy|http|https)/g, `src="/_proxy/${toolSlug}/`)
          .replace(/url\(["']?\/(?!\/|_proxy|http|https)/g, `url("/_proxy/${toolSlug}/`)
          .replace(/action="\/(?!\/|_proxy|http|https)/g, `action="/_proxy/${toolSlug}/`)
          .replace(/\/_proxy\/_proxy\//g, '/_proxy/'); // Fix double prefixes
        
        // For Streamlit, also handle relative paths (./static/, ./favicon.png)
        if (isStreamlit) {
          // Rewrite relative paths in all attributes - use more flexible regex
          rewritten = rewritten
            .replace(/(href\s*=\s*["']?)\.\/(static\/[^"'\s>]+)/gi, `$1/_proxy/${toolSlug}/$2`)
            .replace(/(src\s*=\s*["']?)\.\/(static\/[^"'\s>]+)/gi, `$1/_proxy/${toolSlug}/$2`)
            .replace(/(href\s*=\s*["']?)\.\/(favicon\.png)/gi, `$1/_proxy/${toolSlug}/$2`)
            .replace(/(src\s*=\s*["']?)\.\/(favicon\.png)/gi, `$1/_proxy/${toolSlug}/$2`)
            .replace(/url\(["']?\.\/(static\/[^"'\s>]+)/gi, `url("/_proxy/${toolSlug}/$1`);
        }
        
        // Also handle JavaScript fetch/XMLHttpRequest paths (basic cases)
        rewritten = rewritten
          .replace(/(fetch|XMLHttpRequest|axios)\(["']\/(?!\/|_proxy)/g, `$1("/_proxy/${toolSlug}/`)
          .replace(/['"]\/(static|_stcore|_streamlit)\//g, `"/_proxy/${toolSlug}/$1/`);
        
        // Handle Streamlit-specific paths (more comprehensive)
        // Streamlit uses /_stcore/ for WebSocket and static assets
        const domain = getDomainName();
        const host = request.headers.get('host') || domain;
        const protocol = url.protocol.replace(':', '');
        const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
        
        // For Streamlit, rewrite ALL paths more aggressively
        if (isStreamlit) {
          console.log(`[Proxy] ${toolSlug}: Applying Streamlit-specific path rewriting`);
          
          // CRITICAL: Streamlit uses RELATIVE paths (./static/, ./favicon.png) not absolute paths
          // We need to rewrite relative paths to include the proxy prefix
          
          // First, rewrite relative paths in script and link tags (./static/ -> /_proxy/tool/static/)
          // Use more flexible regex to match with or without quotes
          rewritten = rewritten
            // Handle relative paths in script src (./static/...) - match with single, double, or no quotes
            .replace(/(<script[^>]*src\s*=\s*["']?)\.\/(static\/[^"'\s>]+)/gi, (match, prefix, path) => {
              return `${prefix}/_proxy/${toolSlug}/${path}`;
            })
            // Handle relative paths in link href (./static/..., ./favicon.png) - match with single, double, or no quotes
            .replace(/(<link[^>]*href\s*=\s*["']?)\.\/(static\/[^"'\s>]+)/gi, (match, prefix, path) => {
              return `${prefix}/_proxy/${toolSlug}/${path}`;
            })
            .replace(/(<link[^>]*href\s*=\s*["']?)\.\/(favicon\.png)/gi, (match, prefix) => {
              return `${prefix}/_proxy/${toolSlug}/favicon.png`;
            })
            // Handle relative paths in preload links
            .replace(/(<link[^>]*rel\s*=\s*["']preload["'][^>]*href\s*=\s*["']?)\.\/(static\/[^"'\s>]+)/gi, (match, prefix, path) => {
              return `${prefix}/_proxy/${toolSlug}/${path}`;
            })
            // Also handle any remaining ./static/ or ./favicon.png patterns anywhere in the HTML (catch-all)
            // This is a final pass to catch anything we might have missed
            .replace(/\.\/(static\/[^"'\s<>\)]+)/g, `/_proxy/${toolSlug}/$1`)
            .replace(/\.\/(favicon\.png)/g, `/_proxy/${toolSlug}/$1`);
          
          // Log the rewritten HTML snippet to verify paths are being rewritten
          const staticMatches = rewritten.match(/\.\/(static|favicon)/g);
          if (staticMatches && staticMatches.length > 0) {
            console.warn(`[Proxy] ${toolSlug}: WARNING - Still found ${staticMatches.length} relative paths after rewriting:`, staticMatches.slice(0, 5));
          } else {
            console.log(`[Proxy] ${toolSlug}: All relative paths successfully rewritten`);
          }
          
          // Then rewrite all _stcore and _streamlit paths (most important for Streamlit)
          rewritten = rewritten
            // Rewrite all occurrences of /_stcore/ and /_streamlit/ in the entire document
            .replace(/\/_stcore\//g, `/_proxy/${toolSlug}/_stcore/`)
            .replace(/\/_streamlit\//g, `/_proxy/${toolSlug}/_streamlit/`)
            // Handle script and link tags specifically
            .replace(/(<script[^>]*src=["'])(\/_stcore\/)/g, `$1/_proxy/${toolSlug}/$2`)
            .replace(/(<link[^>]*href=["'])(\/_stcore\/)/g, `$1/_proxy/${toolSlug}/$2`)
            .replace(/(<script[^>]*src=["'])(\/_streamlit\/)/g, `$1/_proxy/${toolSlug}/$2`)
            .replace(/(<link[^>]*href=["'])(\/_streamlit\/)/g, `$1/_proxy/${toolSlug}/$2`);
          
          // Handle WebSocket URLs in JavaScript code (Streamlit's config)
          // Streamlit uses window.location to build WebSocket URLs, so we need to inject our proxy path
          const hostname = host.split(':')[0];
          // const port = host.includes(':') ? host.split(':')[1] : (protocol === 'https' ? '443' : '80'); // Not used in this context
          
          // Replace Streamlit's WebSocket URL construction
          // WebSocket connections must go through the separate WebSocket proxy (port 4099)
          // because Next.js API routes cannot handle WebSocket upgrades
          const wsProxyPort = process.env.WS_PROXY_PORT || '4099';
          const domain = getDomainName();
          const wsProxyHost = hostname || domain;
          
          rewritten = rewritten
            // Handle cases where Streamlit constructs WebSocket URLs
            // Rewrite to use WebSocket proxy on port 4099
            .replace(/new WebSocket\(["']([^"']+)["']\)/g, (match, url) => {
              if (url.includes('_stcore') || url.includes('_streamlit')) {
                // Extract the path from the URL (remove protocol, host, and /_proxy/gsheet-integration prefix)
                let cleanPath = url;
                if (url.startsWith('ws://') || url.startsWith('wss://')) {
                  try {
                    const urlObj = new URL(url);
                    cleanPath = urlObj.pathname;
                  } catch {
                    // If URL parsing fails, try regex
                    cleanPath = url.replace(/^wss?:\/\/[^\/]+/, '');
                  }
                } else if (url.startsWith('/')) {
                  cleanPath = url;
                }
                // Remove /_proxy/gsheet-integration prefix if present
                cleanPath = cleanPath.replace(/^\/_proxy\/[^\/]+\//, '/');
                // Ensure path starts with /
                if (!cleanPath.startsWith('/')) {
                  cleanPath = '/' + cleanPath;
                }
                return `new WebSocket("${wsProtocol}://${wsProxyHost}:${wsProxyPort}${cleanPath}")`;
              }
              return match;
            })
            // Also handle WebSocket URLs in strings (full URLs)
            .replace(/["']ws:\/\/[^"']+\/_proxy\/[^"']+\/(_stcore\/[^"']+)["']/g, (match, path) => {
              return `"${wsProtocol}://${wsProxyHost}:${wsProxyPort}/${path}"`;
            })
            .replace(/["']wss:\/\/[^"']+\/_proxy\/[^"']+\/(_stcore\/[^"']+)["']/g, (match, path) => {
              return `"wss://${wsProxyHost}:${wsProxyPort}/${path}"`;
            })
            // Handle WebSocket URLs with _streamlit
            .replace(/["']ws:\/\/[^"']+\/_proxy\/[^"']+\/(_streamlit\/[^"']+)["']/g, (match, path) => {
              return `"${wsProtocol}://${wsProxyHost}:${wsProxyPort}/${path}"`;
            })
            .replace(/["']wss:\/\/[^"']+\/_proxy\/[^"']+\/(_streamlit\/[^"']+)["']/g, (match, path) => {
              return `"wss://${wsProxyHost}:${wsProxyPort}/${path}"`;
            })
            // Handle relative WebSocket URLs that might be constructed dynamically
            .replace(/["']\/_proxy\/[^"']+\/(_stcore\/[^"']+)["']/g, (match, path) => {
              return `"${wsProtocol}://${wsProxyHost}:${wsProxyPort}/${path}"`;
            })
            .replace(/["']\/_proxy\/[^"']+\/(_streamlit\/[^"']+)["']/g, (match, path) => {
              return `"${wsProtocol}://${wsProxyHost}:${wsProxyPort}/${path}"`;
            })
            // Handle fetch calls with _stcore paths
            .replace(/fetch\(["']\/_stcore\//g, `fetch("/_proxy/${toolSlug}/_stcore/`)
            .replace(/fetch\(["']\/_streamlit\//g, `fetch("/_proxy/${toolSlug}/_streamlit/`)
            // Handle XMLHttpRequest
            .replace(/\.open\(["'](GET|POST|PUT|DELETE)["'],\s*["']\/_stcore\//g, `.open("$1", "/_proxy/${toolSlug}/_stcore/`)
            .replace(/\.open\(["'](GET|POST|PUT|DELETE)["'],\s*["']\/_streamlit\//g, `.open("$1", "/_proxy/${toolSlug}/_streamlit/`)
            // Handle any remaining absolute paths (but not http/https)
            .replace(/href=["']\/(?!\/|_proxy|http)/g, `href="/_proxy/${toolSlug}/`)
            .replace(/src=["']\/(?!\/|_proxy|http)/g, `src="/_proxy/${toolSlug}/`)
            // Handle CSS url() references
            .replace(/url\(["']?\/(?!\/|_proxy|http)/g, `url("/_proxy/${toolSlug}/`);
          
          console.log(`[Proxy] ${toolSlug}: Streamlit paths rewritten`);
        } else {
          // For non-Streamlit apps (like Quote Generator, Inventory Management, etc.)
          // Rewrite paths to go through proxy
          rewritten = rewritten
            .replace(/href=["']\/_stcore\//g, `href="/_proxy/${toolSlug}/_stcore/`)
            .replace(/src=["']\/_stcore\//g, `src="/_proxy/${toolSlug}/_stcore/`)
            .replace(/href=["']\/_streamlit\//g, `href="/_proxy/${toolSlug}/_streamlit/`)
            .replace(/src=["']\/_streamlit\//g, `src="/_proxy/${toolSlug}/_streamlit/`)
            .replace(/href=["']\/static\//g, `href="/_proxy/${toolSlug}/static/`)
            .replace(/src=["']\/static\//g, `src="/_proxy/${toolSlug}/static/`)
            .replace(/href=["']\/assets\//g, `href="/_proxy/${toolSlug}/assets/`)
            .replace(/src=["']\/assets\//g, `src="/_proxy/${toolSlug}/assets/`)
            // Rewrite Vite dev server paths (@vite/client, @react-refresh, etc.)
            .replace(/src=["']\/@vite\//g, `src="/_proxy/${toolSlug}/@vite/`)
            .replace(/src=["']\/@react-refresh/g, `src="/_proxy/${toolSlug}/@react-refresh`)
            .replace(/src=["']\/@id\//g, `src="/_proxy/${toolSlug}/@id/`)
            // Rewrite module script sources
            .replace(/(<script[^>]*type=["']module["'][^>]*src=["'])(\/src\/)/g, `$1/_proxy/${toolSlug}/$2`)
            // Rewrite any remaining relative paths in script/link tags (but not absolute URLs)
            .replace(/(<script[^>]*src=["'])(\/[^"']+)(["'])/g, (match, prefix, path, suffix) => {
              // Don't rewrite if it's already a proxy path, absolute URL, or CDN
              if (path.startsWith('/_proxy/') || path.startsWith('http://') || path.startsWith('https://')) {
                return match;
              }
              return `${prefix}/_proxy/${toolSlug}${path}${suffix}`;
            })
            .replace(/(<link[^>]*href=["'])(\/[^"']+)(["'])/g, (match, prefix, path, suffix) => {
              // Don't rewrite if it's already a proxy path, absolute URL, or CDN
              if (path.startsWith('/_proxy/') || path.startsWith('http://') || path.startsWith('https://')) {
                return match;
              }
              return `${prefix}/_proxy/${toolSlug}${path}${suffix}`;
            })
            .replace(/url\(["']?\/_stcore\//g, `url("/_proxy/${toolSlug}/_stcore/`)
            .replace(/url\(["']?\/_streamlit\//g, `url("/_proxy/${toolSlug}/_streamlit/`)
            .replace(/url\(["']?\/static\//g, `url("/_proxy/${toolSlug}/static/`)
            .replace(/url\(["']?\/assets\//g, `url("/_proxy/${toolSlug}/assets/`)
            // Handle WebSocket connections
            .replace(/ws:\/\/[^\/'"]+\/_stcore\//g, `${wsProtocol}://${host}/_proxy/${toolSlug}/_stcore/`)
            .replace(/wss:\/\/[^\/'"]+\/_stcore\//g, `wss://${host}/_proxy/${toolSlug}/_stcore/`)
            // Handle fetch/XMLHttpRequest with _stcore paths
            .replace(/fetch\(["']\/_stcore\//g, `fetch("/_proxy/${toolSlug}/_stcore/`)
            .replace(/XMLHttpRequest.*["']\/_stcore\//g, `XMLHttpRequest("/_proxy/${toolSlug}/_stcore/`);
        }
        
        const encoded = new TextEncoder().encode(rewritten);
        // TextEncoder().encode() returns a Uint8Array, and its .buffer is an ArrayBuffer
        finalBody = encoded.buffer;
        console.log(`[Proxy] ${toolSlug}: HTML rewritten, size: ${finalBody.byteLength} bytes`);
      } catch (rewriteError) {
        console.error(`[Proxy] ${toolSlug}: Error rewriting HTML:`, rewriteError);
        console.error(`[Proxy] ${toolSlug}: Error stack:`, rewriteError instanceof Error ? rewriteError.stack : 'No stack trace');
        // Return original body if rewriting fails
        finalBody = responseBody;
      }
    }

    // Forward response headers
    const responseHeaders = new Headers(backendResponse.headers);
    
    // CRITICAL: Remove Content-Encoding header - fetch() automatically decompresses
    // If we keep it, browser will try to decompress already-decompressed content
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('Content-Encoding');
    
    // Remove headers that might block iframe embedding
    responseHeaders.delete('X-Frame-Options'); // Let middleware handle this
    responseHeaders.delete('Content-Security-Policy'); // Let middleware handle this
    responseHeaders.delete('frame-ancestors'); // Remove if present
    
    // Remove Transfer-Encoding header (not needed for HTTP/1.1 responses)
    responseHeaders.delete('transfer-encoding');
    responseHeaders.delete('Transfer-Encoding');
    
    // Set CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    
    // Remove or update content-length if we modified the body
    if (contentType.includes('text/html') && finalBody.byteLength !== responseBody.byteLength) {
      responseHeaders.delete('content-length');
      responseHeaders.delete('Content-Length');
    } else if (finalBody.byteLength !== responseBody.byteLength) {
      // Update content-length for any modified response
      responseHeaders.delete('content-length');
      responseHeaders.delete('Content-Length');
      responseHeaders.set('Content-Length', finalBody.byteLength.toString());
    }

    // Handle 304 Not Modified - Next.js Response doesn't accept 304 directly
    // Convert to 200 with appropriate headers
    let status = backendResponse.status;
    if (status === 304) {
      status = 200;
      // For 304, we should return the cached content or empty body
      if (finalBody.byteLength === 0) {
        // If no body, return empty response with 304 headers
        return new NextResponse(null, {
          status: 304,
          statusText: 'Not Modified',
          headers: responseHeaders,
        });
      }
    }

    // Ensure status is valid (between 200-599)
    if (status < 200 || status >= 600) {
      status = 500;
    }

    return new NextResponse(finalBody, {
      status,
      statusText: backendResponse.statusText || 'OK',
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
