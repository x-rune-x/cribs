// Serves the static playtest build the way GitHub Pages does: under a base path,
// with 404.html (the app shell) for any path that isn't a file.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const ROOT = path.resolve(".output/public");
const BASE = process.env.BASE ?? "/cribs/";
const PORT = Number(process.env.PORT ?? 3200);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

function send(res, status, file) {
  res.writeHead(status, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (!url.startsWith(BASE)) return send(res, 404, path.join(ROOT, "404.html"));
  let file = path.join(ROOT, url.slice(BASE.length));
  if (!file.startsWith(ROOT)) return send(res, 404, path.join(ROOT, "404.html"));
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (existsSync(file) && statSync(file).isFile()) return send(res, 200, file);
  send(res, 404, path.join(ROOT, "404.html"));
}).listen(PORT, () => console.log(`Serving ${ROOT} at http://localhost:${PORT}${BASE}`));
