/**
 * Render.com Node.js server entry point.
 * Serves static assets from dist/client, falls through to SSR fetch handler.
 */
import { serve } from "srvx/node";
import { serveStatic } from "srvx/static";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the built SSR fetch handler
const { default: serverEntry } = await import(join(__dirname, "dist/server/server.js"));

// Serve static assets from dist/client (CSS, JS, fonts, etc.)
const staticHandler = serveStatic({ dir: join(__dirname, "dist/client") });

const port = Number(process.env.PORT) || 3000;
const host = "0.0.0.0";

console.log(`Starting Deriv Pulse on http://${host}:${port}`);

serve({
  async fetch(req) {
    // Try static file first
    const staticRes = await staticHandler(req, () => null);
    if (staticRes) return staticRes;

    // Fall through to SSR
    return serverEntry.fetch(req, {}, {});
  },
  port,
  hostname: host,
});
