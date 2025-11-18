'use client';

import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, RefreshCw, Home, Maximize2, Minimize2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ToolFrameProps {
  toolName: string;
  toolSlug: string;
  description?: string;
  icon?: React.ReactNode;
  autoRedirect?: boolean;
}

export function ToolFrame({ toolName, toolSlug, description, icon, autoRedirect = false }: ToolFrameProps) {
  const router = useRouter();
  const [toolUrl, setToolUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeTool = async () => {
      try {
        // ALL tools are accessed through the dashboard proxy route
        // Use /_proxy/ for actual proxying, /tools/ for dashboard wrapper
        const toolBase = `/tools/${toolSlug}/`;
        const proxyUrl = `/_proxy/${toolSlug}/`;
        
        if (!isMounted) return;
        
        console.log(`[ToolFrame] Initializing ${toolName}`);
        console.log(`[ToolFrame]   Tool Base: ${toolBase}`);
        console.log(`[ToolFrame]   Proxy URL: ${proxyUrl}`);
        
        // Expose tool paths to the global window context
        // These are used by the embedded tool to construct API URLs
        (window as { __TOOL_BASE__?: string; __TOOL_PROXY__?: string; __TOOL_SLUG__?: string; __PROXY_MODE__?: boolean; __PROXY_BASE__?: string; }).__TOOL_BASE__ = toolBase;
        (window as { __TOOL_BASE__?: string; __TOOL_PROXY__?: string; __TOOL_SLUG__?: string; __PROXY_MODE__?: boolean; __PROXY_BASE__?: string; }).__TOOL_PROXY__ = proxyUrl;
        (window as { __TOOL_BASE__?: string; __TOOL_PROXY__?: string; __TOOL_SLUG__?: string; __PROXY_MODE__?: boolean; __PROXY_BASE__?: string; }).__TOOL_SLUG__ = toolSlug;
        (window as { __TOOL_BASE__?: string; __TOOL_PROXY__?: string; __TOOL_SLUG__?: string; __PROXY_MODE__?: boolean; __PROXY_BASE__?: string; }).__PROXY_MODE__ = true;
        (window as { __TOOL_BASE__?: string; __TOOL_PROXY__?: string; __TOOL_SLUG__?: string; __PROXY_MODE__?: boolean; __PROXY_BASE__?: string; }).__PROXY_BASE__ = proxyUrl;
        
        setToolUrl(proxyUrl);

        // If auto-redirect is enabled, open immediately
        if (autoRedirect) {
          setIsLoading(false);
          // Open the proxied URL
          window.open(proxyUrl, '_blank', 'noopener,noreferrer');
          return;
        }

        setIsLoading(false);
      } catch (err) {
        if (!isMounted) return;
        console.error(`Failed to initialize ${toolName}:`, err);
        setError(`Failed to connect to ${toolName}. Please make sure all tools are running.`);
        setIsLoading(false);
      }
    };

    initializeTool();

    return () => {
      isMounted = false;
    };
  }, [toolName, toolSlug, autoRedirect]);

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    setIframeKey(prev => prev + 1);
    
    // Reset to proxy URL
    const proxyUrl = `/_proxy/${toolSlug}/`;
    setToolUrl(proxyUrl);
    
    setTimeout(() => setIsLoading(false), 1000);
  };

  const handleOpenExternal = () => {
    if (toolUrl) {
      window.open(toolUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleGoHome = () => {
    router.push('/');
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={`h-screen flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          {icon && <div className="text-primary">{icon}</div>}
          <div>
            <h1 className="text-2xl font-bold">{toolName}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoHome}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="gap-2"
          >
            {isFullscreen ? (
              <><Minimize2 className="h-4 w-4" />Exit Fullscreen</>
            ) : (
              <><Maximize2 className="h-4 w-4" />Fullscreen</>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenExternal}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open in New Tab
          </Button>
        </div>
      </div>

      {/* Tool Content */}
      <div className="flex-1 relative">
        {autoRedirect ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <Card className="p-8 max-w-md mx-auto text-center space-y-4">
              <div className="text-primary text-5xl mb-4">🚀</div>
              <h2 className="text-xl font-bold">Opening {toolName}</h2>
              <p className="text-muted-foreground">
                The tool has been opened in a new browser tab.
              </p>
              {toolUrl && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Tool URL:
                  </p>
                  <code className="block bg-muted p-2 rounded text-xs break-all">
                    {toolUrl}
                  </code>
                </div>
              )}
              <div className="space-y-2 pt-4">
                <p className="text-sm text-muted-foreground">
                  Didn&apos;t open? Click below:
                </p>
                <div className="flex gap-2 justify-center">
                  <Button onClick={handleOpenExternal} variant="default" disabled={!toolUrl}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Tool
                  </Button>
                  <Button onClick={handleGoHome} variant="outline">
                    <Home className="h-4 w-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <>
            {isLoading && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-10">
              <div className="text-center space-y-4">
                <RefreshCw className="h-12 w-12 animate-spin mx-auto text-primary" />
                <p className="text-lg font-medium">Loading {toolName}...</p>
                <p className="text-sm text-muted-foreground">Loading integrated tool...</p>
              </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
                <Card className="p-8 max-w-md mx-auto text-center space-y-4">
                  <div className="text-destructive text-5xl mb-4">⚠️</div>
                  <h2 className="text-xl font-bold">Connection Error</h2>
                  <p className="text-muted-foreground">{error}</p>
                  {toolUrl && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Attempted to connect to:
                      </p>
                      <code className="block bg-muted p-2 rounded text-xs break-all">
                        {toolUrl}
                      </code>
                    </div>
                  )}
                  <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    To start all tools, run:
                  </p>
                  <code className="block bg-muted p-3 rounded text-sm">
                    cd &quot;E:\Web Auto\extr\project-hub&quot;<br />
                    npm run dev
                  </code>
                  <p className="text-xs text-muted-foreground mt-2">
                    All tools are integrated into the project hub
                  </p>
                  </div>
                  <div className="flex gap-2 justify-center pt-4">
                    <Button onClick={handleRefresh} variant="default">
                      Try Again
                    </Button>
                    <Button onClick={handleOpenExternal} variant="outline" disabled={!toolUrl}>
                      Open in Browser
                    </Button>
                    <Button onClick={handleGoHome} variant="outline">
                      Back to Dashboard
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {toolUrl ? (
              <iframe
                ref={iframeRef}
                key={iframeKey}
                src={toolUrl}
                className="w-full h-full border-0"
                title={toolName}
                allow="fullscreen"
                onLoad={(e) => {
                  console.log(`[ToolFrame] ${toolName} iframe loaded`);
                  setIsLoading(false);
                  
                  // For GSheet, inject __TOOL_PROXY__ into iframe contentWindow
                  if (toolSlug === 'gsheet-integration' && iframeRef.current?.contentWindow) {
                    try {
                      (iframeRef.current.contentWindow as { __TOOL_PROXY__?: string; __TOOL_BASE__?: string; __TOOL_SLUG__?: string; __PROXY_MODE__?: boolean; }).__TOOL_PROXY__ = `/_proxy/${toolSlug}/`;
                      (iframeRef.current.contentWindow as { __TOOL_PROXY__?: string; __TOOL_BASE__?: string; __TOOL_SLUG__?: string; __PROXY_MODE__?: boolean; }).__TOOL_BASE__ = `/tools/${toolSlug}/`;
                      (iframeRef.current.contentWindow as { __TOOL_PROXY__?: string; __TOOL_BASE__?: string; __TOOL_SLUG__?: string; __PROXY_MODE__?: boolean; }).__TOOL_SLUG__ = toolSlug;
                      (iframeRef.current.contentWindow as { __TOOL_PROXY__?: string; __TOOL_BASE__?: string; __TOOL_SLUG__?: string; __PROXY_MODE__?: boolean; }).__PROXY_MODE__ = true;
                      console.log(`[ToolFrame] Injected proxy variables into ${toolName} iframe`);
                    } catch {
                      // Expected for cross-origin - injection will happen via HTML rewriting instead
                      console.log(`[ToolFrame] Cannot inject proxy variables directly (cross-origin), relying on HTML rewriting:`, e);
                    }
                  }
                  
                  // Check if iframe content is actually loaded
                  try {
                    const iframe = e.target as HTMLIFrameElement;
                    if (iframe.contentWindow) {
                      console.log(`[ToolFrame] ${toolName} iframe contentWindow available`);
                      // Try to check if content is actually there
                      setTimeout(() => {
                        try {
                          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                          if (iframeDoc) {
                            const bodyText = iframeDoc.body?.innerText || '';
                            // Check if we got an error response (503 Service Unavailable)
                            if (bodyText.includes('Failed to connect') || bodyText.includes('Service Unavailable') || bodyText.includes('503')) {
                              console.error(`[ToolFrame] ${toolName} backend is not running`);
                              setError(`The ${toolName} backend is not running on its configured port. Please check:\n1. Is the backend started? (Check console output)\n2. Is MongoDB running? (Required for Quote Generator)\n3. Is the port correct in project-hub/.env?`);
                            } else if (bodyText.length === 0) {
                              console.warn(`[ToolFrame] ${toolName} iframe body appears empty`);
                            } else {
                              console.log(`[ToolFrame] ${toolName} iframe has content: ${bodyText.substring(0, 50)}...`);
                            }
                          }
                        } catch {
                          // Expected for cross-origin
                          console.log(`[ToolFrame] ${toolName} iframe content check skipped (cross-origin)`);
                        }
                      }, 1000);
                    }
                  } catch (err) {
                    console.warn(`[ToolFrame] ${toolName} cannot access iframe content (expected for cross-origin):`, err);
                  }
                }}
                onError={() => {
                  console.error(`[ToolFrame] ${toolName} iframe error`);
                  setError(`Failed to load ${toolName}. The tool backend may not be running on its configured port. Please check the console output for startup errors.`);
                  setIsLoading(false);
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-background">
                <Card className="p-8 max-w-md mx-auto text-center space-y-4">
                  <div className="text-destructive text-5xl mb-4">⚠️</div>
                  <h2 className="text-xl font-bold">Initializing Tool</h2>
                  <p className="text-muted-foreground">Please wait while we connect to {toolName}...</p>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
