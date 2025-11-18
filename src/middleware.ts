import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Security Headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  
  // Frame Options - Allow framing in development/fallback, deny in production
  const isProduction = process.env.NODE_ENV === "production";
  const isFallback = process.env.ENABLE_LOCALHOST_FALLBACK === "true" || !isProduction;
  
  if (isProduction && !isFallback) {
    // Production: Prevent clickjacking
    response.headers.set("X-Frame-Options", "DENY");
  } else {
    // Development/Fallback: Allow framing for testing
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");

  // HSTS (HTTP Strict Transport Security) - only in production
  if (isProduction) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com",
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
    "connect-src 'self' data: blob:",
    // Frame ancestors: Allow framing in development/fallback, block in production
    isProduction && !isFallback ? "frame-ancestors 'none'" : "frame-ancestors 'self'",
  ].filter(Boolean).join("; "); // Filter out any undefined/null values

  response.headers.set("Content-Security-Policy", csp);

  // Log security-relevant requests
  if (
    request.nextUrl.pathname.startsWith("/api/auth") ||
    request.nextUrl.pathname.startsWith("/api/users") ||
    request.nextUrl.pathname.startsWith("/api/settings")
  ) {
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    console.log(`[SECURITY] ${request.method} ${request.nextUrl.pathname} from IP: ${clientIp}`);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
