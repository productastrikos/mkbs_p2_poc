/* Production server: serves the built app (build/) and the LLM API.
 *   npm run build && npm run serve      → http://localhost:3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch (e) { /* optional */ }
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (e) { /* optional */ }

const { llmHandler, MODEL } = require('./llm');

const BUILD = path.join(ROOT, 'build');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json', '.txt': 'text/plain',
  '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const api = llmHandler();

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.normalize(path.join(BUILD, urlPath));
  if (!file.startsWith(BUILD)) { res.statusCode = 403; return res.end('Forbidden'); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(BUILD, 'index.html'); // SPA routes
  const ext = path.extname(file);
  const { size } = fs.statSync(file);
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  if (urlPath.startsWith('/static/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  // Byte ranges: browsers seek in the CCTV clips with them (Safari will not play video without).
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let start = 0;
  let end = size - 1;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); return res.end(); }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(file, { start, end }).on('error', () => { res.statusCode = 500; res.end(); }).pipe(res);
  return undefined;
}

if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
  console.error('No build found. Run "npm run build" first.');
  process.exit(1);
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/llm/') || req.url === '/api/llm') {
    req.url = req.url.slice('/api/llm'.length) || '/';
    return api(req, res, () => { res.statusCode = 404; res.end('Not found'); });
  }
  return serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`GreenLight EVP on http://localhost:${PORT}  (LLM: ${process.env.ANTHROPIC_API_KEY ? MODEL : 'offline templates, ANTHROPIC_API_KEY not set'})`);
});
