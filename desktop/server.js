/* Servidor local mínimo: sirve la app solo a este ordenador (127.0.0.1). */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".json": "application/json" };
// Solo se sirven los archivos de la app, nada más del disco.
const ALLOWED = /^\/(index\.html|css\/[\w.-]+|js\/[\w.-]+|js\/vendor\/[\w.-]+)$/;

function start(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let url = decodeURIComponent((req.url || "/").split("?")[0]);
      if (url === "/") url = "/index.html";
      if (req.method !== "GET" || !ALLOWED.test(url)) { res.writeHead(404); res.end("No encontrado"); return; }
      fs.readFile(path.join(ROOT, url), (err, data) => {
        if (err) { res.writeHead(404); res.end("No encontrado"); return; }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(url)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(data);
      });
    });
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

module.exports = { start };
