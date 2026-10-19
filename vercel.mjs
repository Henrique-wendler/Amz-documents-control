const rawSupabaseUrl = process.env.VITE_SUPABASE_URL;
if (!rawSupabaseUrl) throw new Error("VITE_SUPABASE_URL is required for Vercel deployment.");

const supabaseUrl = new URL(rawSupabaseUrl);
if (supabaseUrl.protocol !== "https:" || !supabaseUrl.hostname.endsWith(".supabase.co")) {
  throw new Error("VITE_SUPABASE_URL must be an HTTPS Supabase project URL.");
}

const supabaseOrigin = supabaseUrl.origin;
const supabaseWebSocketOrigin = supabaseOrigin.replace(/^https:/, "wss:");
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  // Fluent UI injects style elements; charts also use inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${supabaseOrigin}`,
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWebSocketOrigin}`,
  "frame-src 'none'",
].join("; ");

export const config = {
  headers: [{
    source: "/(.*)",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
    ],
  }],
  rewrites: [{ source: "/(.*)", destination: "/" }],
};
