/* Backend server: the LLM API only, for when the built app is served from a
 * different origin (see DEPLOY.md).
 *   PORT=4287 node server/api.js        → /api/llm/* with CORS
 * CORS_ORIGIN (comma-separated, default *) lists the frontend origins allowed
 * to call it. server/index.js is the single-process alternative.
 */
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
try { process.loadEnvFile(path.join(ROOT, '.env.local')); } catch (e) { /* optional */ }
try { process.loadEnvFile(path.join(ROOT, '.env.production')); } catch (e) { /* optional */ }
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (e) { /* optional */ }

const { llmHandler, MODEL } = require('./llm');

const PORT = Number(process.env.PORT) || 4000;
const ORIGINS = (process.env.CORS_ORIGIN || '*').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
const api = llmHandler();

function sendJson(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ORIGINS.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

http.createServer((req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.url.startsWith('/api/llm/') || req.url === '/api/llm') {
    req.url = req.url.slice('/api/llm'.length) || '/';
    return api(req, res, () => sendJson(res, 404, { error: 'Not found' }));
  }
  if (req.url === '/' || req.url === '/health') return sendJson(res, 200, { service: 'greenlight-evp-api', ok: true });
  return sendJson(res, 404, { error: 'Not found' });
}).listen(PORT, () => {
  console.log(`GreenLight EVP API on port ${PORT}  (CORS: ${ORIGINS.join(', ')}; LLM: ${process.env.ANTHROPIC_API_KEY ? MODEL : 'offline templates, ANTHROPIC_API_KEY not set'})`);
});
