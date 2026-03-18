/**
 * Booking Frontend Dev Server
 * Serves the booking public UI on port 3001
 * Reads .env from parent directory to inject BFF config
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;

// Read .env from parent (project root)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const config = {};
  try {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      config[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  } catch {
    console.warn('⚠ Could not read ../.env — using defaults');
  }
  return config;
}

const env = loadEnv();

// BFF URL for the browser (localhost, not docker internal)
const BFF_BASE_URL = 'http://localhost:54321/functions/v1/booking-public';
const BOOKING_API_KEY = env.BOOKING_API_KEY || '';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Serve runtime config as JS
  if (url.pathname === '/__config.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(`window.__BOOKING_CONFIG = ${JSON.stringify({
      bffBaseUrl: BFF_BASE_URL,
      apiKey: BOOKING_API_KEY,
      clientId: 'reservas-frontend-v1',
    })};`);
    return;
  }

  // Serve static files from public/
  let filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);

  // For clean URLs like /local-demo, serve index.html (SPA fallback)
  if (!path.extname(filePath)) {
    filePath = path.join(__dirname, 'public', 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n🗓  Booking Frontend running at http://localhost:${PORT}`);
  console.log(`   BFF endpoint: ${BFF_BASE_URL}`);
  console.log(`\n   Try: http://localhost:${PORT}/local-demo\n`);
});
