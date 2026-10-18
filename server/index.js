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
  '.woff2': 'font/woff2',
};
const api = llmHandler();

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.normalize(path.join(BUILD, urlPath));
  if (!file.startsWith(BUILD)) { res.statusCode = 403; return res.end('Forbidden'); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(BUILD, 'index.html'); // SPA routes
  const ext = path.extname(file);
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  if (urlPath.startsWith('/static/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(file).on('error', () => { res.statusCode = 500; res.end(); }).pipe(res);
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
