const INTERNAL_ORIGIN = "https://internal.invalid";

export const securityResponseHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; object-src 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function requireMethod(request: Request, method: string): void {
  if (request.method.toUpperCase() !== method.toUpperCase()) {
    throw new Response("Method Not Allowed", {
      status: 405,
      headers: { ...securityResponseHeaders, Allow: method.toUpperCase() },
    });
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw new Response("Forbidden", { status: 403, headers: securityResponseHeaders });
  }
  if (!origin || origin !== requestOrigin) {
    throw new Response("Forbidden", { status: 403, headers: securityResponseHeaders });
  }
}

export function sanitizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /\\|%5c/i.test(value)) {
    return "/";
  }
  try {
    const base = new URL(INTERNAL_ORIGIN);
    const target = new URL(value, base);
    if (target.origin !== base.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}
