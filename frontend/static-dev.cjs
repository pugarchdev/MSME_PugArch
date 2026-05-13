const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.FRONTEND_PORT || 5174);
const DIST_DIR = path.resolve(__dirname, 'dist');
const INDEX_FILE = path.join(DIST_DIR, 'index.html');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

if (!fs.existsSync(INDEX_FILE)) {
  console.error('frontend/dist is missing. Build assets are required for static dev mode.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const rawPath = req.url ? req.url.split('?')[0] : '/';
  const requestPath = rawPath === '/' ? '/index.html' : rawPath;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[\\/])+/, '');
  const filePath = path.join(DIST_DIR, safePath);

  const sendFile = (targetPath) => {
    fs.readFile(targetPath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
      const ext = path.extname(targetPath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      res.statusCode = 200;
      res.end(data);
    });
  };

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(filePath);
      return;
    }

    // SPA fallback
    sendFile(INDEX_FILE);
  });
});

server.listen(PORT, () => {
  console.log(`Frontend static server running at http://localhost:${PORT}`);
});
