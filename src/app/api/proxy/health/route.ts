import { NextRequest, NextResponse } from 'next/server';

// Backend port mapping
const BACKEND_PORTS: Record<string, number> = {
  'data-extractor-pro': 4092,
  'file-merger': 4093,
  'quote-generator': 4094,
  'gsheet-integration': 4095,
  'inventory-management': 4096,
  'order-extractor': 4097,
  'ai-seo-strategist': 4098,
};

export async function GET() {
  const healthChecks: Record<string, { status: string; port: number; error?: string }> = {};
  
  for (const [toolSlug, port] of Object.entries(BACKEND_PORTS)) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`http://127.0.0.1:${port}`, {
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      healthChecks[toolSlug] = {
        status: response.ok ? 'running' : 'error',
        port,
      };
    } catch (error) {
      healthChecks[toolSlug] = {
        status: 'not_running',
        port,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  return NextResponse.json({ healthChecks });
}

