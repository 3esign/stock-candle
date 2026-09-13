"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname);
const port = Number(process.env.PORT || process.argv[2] || 8791);
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.resolve(root, "." + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }
  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    fs.createReadStream(file).pipe(response);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log("STOCK CANDLE local site: http://127.0.0.1:" + port + "/");
});
