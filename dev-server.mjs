// Local preview of the site including the gallery API (api/gallery.js).
//   node dev-server.mjs [port]
// Reads settings from .env.local (KEY=value per line), e.g. AZURE_STORAGE_CONNECTION_STRING.
// For saving edits to data/*.json from the editor, use server.py instead.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(root, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const { default: gallery } = await import("./api/gallery.js");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };
const port = Number(process.argv[2]) || 3000;

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/gallery") return gallery(req, res);
  const file = path.normalize(path.join(root, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
  if (!file.startsWith(root + path.sep) || /[\\/]\.|node_modules/.test(path.relative(root, file))) { res.statusCode = 404; return res.end("Not found"); }
  fs.readFile(file, (err, body) => {
    if (err) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  });
}).listen(port, "127.0.0.1", () => console.log(`Site + gallery API: http://localhost:${port}/`));
