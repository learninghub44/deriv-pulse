/**
 * Render.com Node.js server entry point.
 * Wraps the TanStack Start fetch handler with srvx/node HTTP server.
 */
import { serve } from "srvx/node";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the built server entry (fetch handler)
const serverPath = join(__dirname, "dist/server/server.js");
const { default: serverEntry } = await import(serverPath);

const port = Number(process.env.PORT) || 3000;
const host = "0.0.0.0";

console.log(`Starting Deriv Pulse on http://${host}:${port}`);

serve({
  fetch: serverEntry.fetch.bind(serverEntry),
  port,
  hostname: host,
});
