/* LLM endpoints for GreenLight EVP (Claude API).
 *
 *   GET  /api/llm/status       → { available, model, reason }
 *   POST /api/llm/trip-report  { trip }               → streamed Markdown
 *   POST /api/llm/monthly      { digest, audience }   → streamed Markdown
 *   POST /api/llm/chat         { digest, messages }   → streamed Markdown
 *
 * The API key is read from ANTHROPIC_API_KEY on the server and never sent to
 * the browser. Mounted by src/setupProxy.js (dev) and server/index.js (prod).
 */
const sdk = require('@anthropic-ai/sdk');

const Anthropic = sdk.Anthropic || sdk.default || sdk;
const MODEL = process.env.EVP_LLM_MODEL || 'claude-opus-5-5';
// Server-side refusal fallback: a declined request is re-run on Anthropic's
// recommended fallback model inside the same call.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_BODY = 1024 * 1024;

let client = null;
let status = null;
let statusAt = 0;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

async function checkStatus() {
  if (status && Date.now() - statusAt < 10 * 60 * 1000) return status;
  const c = getClient();
  if (!c) {
    status = { available: false, model: MODEL, reason: 'ANTHROPIC_API_KEY not set' };
  } else {
    try {
      await c.models.retrieve(MODEL);
      status = { available: true, model: MODEL };
    } catch (e) {
      status = { available: false, model: MODEL, reason: describeError(e) };
    }
  }
  statusAt = Date.now();
  return status;
}

function describeError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'API key rejected';
  if (e instanceof Anthropic.PermissionDeniedError) return 'API key lacks access to this model';
  if (e instanceof Anthropic.NotFoundError) return `Model ${MODEL} not found`;
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited, try again shortly';
  if (e instanceof Anthropic.APIConnectionError) return 'Cannot reach the Claude API';
  if (e instanceof Anthropic.APIError) return `Claude API error ${e.status ?? ''}`.trim();
  return e.message || 'Unknown error';
}

/* ─── Prompts ──────────────────────────────────────────────── */
const COMMON = `You are the reporting assistant for GreenLight EVP, an AI-assisted emergency vehicle pre-emption pilot run by Majlis Bandaraya Kuching Selatan (MBKS), Sarawak, on its existing SCATS traffic signal controllers.

Ground rules:
- Use only facts and numbers present in the JSON you are given. Do not invent figures, names or dates. If something is not in the data, say it is not available.
- The data comes from a prototype simulation on the real Kuching South road network; say "pilot data" rather than presenting it as audited field results.
- Safety rules the system enforces: green requested when ETA ≤ phase clearance + 15 s; never cut a pedestrian green mid-crossing; 3 s amber + 2 s all-red on every transition; maximum hold 45 s; requests cancelled if the ambulance stops or diverts for more than 20 s; conflicts resolved Critical > Urgent > Non-urgent, then nearest ETA; after release SCATS adaptive control recovers queues over 1–2 cycles.
- Write in plain British/Malaysian English for council and agency staff. Use Markdown: short headings, bullets, and a table where it helps. Times in seconds unless minutes read better.`;

const TRIP_SYSTEM = `${COMMON}

Task: write a post-trip report for the operations log from one trip record.
Structure:
# Post-trip report: <trip id>
One line: ambulance, priority, status, start time, weather.
## Summary — 3–4 bullets: route and duration, junctions pre-empted, seconds saved against the no-EVP baseline, conflicting movements avoided.
## Junctions — a table: junction, movement, phase, green lead before arrival, wait with EVP vs without.
## Safety and compliance — amber/all-red, pedestrian protection, holds, priority conflicts, any safety override, anomalies or route deviation. If there were none, say so in one line.
## Follow-up — at most 2 bullets, only if the data shows something worth acting on (for example a junction with a low green lead or a large ETA error); otherwise "None".
Keep it under 350 words.`;

const AUDIENCE_FOCUS = {
  JKR: 'Jabatan Kerja Raya (JKR, public works and roads): signal operations, pre-emption performance, SCATS recovery, which junctions cause delay, and the 22-junction rollout order.',
  JKNS: 'Jabatan Kesihatan Negeri Sarawak (JKNS, state health department): ambulance response, time saved per trip, results by hospital and by patient priority.',
  PDRM: 'Polis Diraja Malaysia (PDRM, police): road safety, conflicting movements avoided, priority conflicts between ambulances, and security alerts (spoofing, unregistered vehicles, misuse).',
};

const MONTHLY_SYSTEM = (audience) => `${COMMON}

Task: write a one-page monthly stakeholder summary for ${AUDIENCE_FOCUS[audience] || audience}.
Structure:
# GreenLight EVP monthly summary: <month name and year>
**For:** <agency>
## Headline — 2 sentences with the most important numbers for this audience.
## Key figures — a table of 5–7 KPIs for the month (use "month" and "monthly" data; fall back to all-time KPIs and label them as such).
## What this means for <agency> — 3–4 bullets focused on the audience.
## Rollout and next steps — 2–3 bullets drawing on rolloutTop10 and costBenefit (budget RM2.0M: RM1.1M capex in 2027 plus RM225k a year maintenance 2027–2030).
Keep it under 400 words.`;

const CHAT_SYSTEM = (digest) => `${COMMON}

You answer questions from the MBKS traffic command duty operator in a chat. Answer directly in 1–5 sentences or a short list, quoting the relevant numbers and junction IDs/names. "This month" means the month in digest.month. If a question cannot be answered from the data, say what data would be needed.

Pilot data digest (JSON):
${JSON.stringify(digest)}`;

/* ─── HTTP plumbing ────────────────────────────────────────── */
function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/* Stream the model's text to the HTTP response as plain UTF-8. */
async function streamText(req, res, { system, messages, maxTokens, effort }) {
  const c = getClient();
  if (!c) return sendJson(res, 503, { error: 'ANTHROPIC_API_KEY not set' });

  const stream = c.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    output_config: { effort },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  let closed = false;
  res.on('close', () => { if (!res.writableFinished) { closed = true; stream.abort(); } });

  let started = false;
  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (!started) {
          started = true;
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Accel-Buffering', 'no');
        }
        res.write(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      const note = '\n\n_The model declined to answer this request._';
      if (!started) return sendJson(res, 422, { error: 'The model declined this request' });
      res.write(note);
    } else if (final.stop_reason === 'max_tokens') {
      res.write('\n\n_(Output truncated at the length limit.)_');
    }
    if (!started) return sendJson(res, 502, { error: 'Empty response from the model' });
    res.end();
  } catch (e) {
    if (closed) return;
    const msg = describeError(e);
    console.error('[llm]', msg);
    if (!started) sendJson(res, e instanceof Anthropic.APIError && e.status ? (e.status >= 500 ? 502 : e.status) : 500, { error: msg });
    else { res.write(`\n\n_(Stream interrupted: ${msg})_`); res.end(); }
  }
  return undefined;
}

function cleanMessages(list) {
  return (Array.isArray(list) ? list : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

/** Connect-style handler; mount at /api/llm. */
function llmHandler() {
  return async (req, res, next) => {
    const path = (req.url || '').split('?')[0].replace(/\/+$/, '');
    try {
      if (req.method === 'GET' && path === '/status') return sendJson(res, 200, await checkStatus());
      if (req.method !== 'POST') return next ? next() : sendJson(res, 404, { error: 'Not found' });
      const body = await readJson(req);

      if (path === '/trip-report') {
        if (!body.trip) return sendJson(res, 400, { error: 'Missing trip' });
        return streamText(req, res, {
          system: TRIP_SYSTEM, maxTokens: 4000, effort: 'medium',
          messages: [{ role: 'user', content: `Trip record (JSON):\n${JSON.stringify(body.trip)}\n\nWrite the post-trip report.` }],
        });
      }
      if (path === '/monthly') {
        if (!body.digest?.month) return sendJson(res, 400, { error: 'Missing digest.month' });
        const audience = ['JKR', 'JKNS', 'PDRM'].includes(body.audience) ? body.audience : 'JKR';
        return streamText(req, res, {
          system: MONTHLY_SYSTEM(audience), maxTokens: 5000, effort: 'medium',
          messages: [{ role: 'user', content: `Pilot data digest (JSON):\n${JSON.stringify(body.digest)}\n\nWrite the monthly summary for ${audience}.` }],
        });
      }
      if (path === '/chat') {
        const messages = cleanMessages(body.messages);
        if (!messages.length || messages[messages.length - 1].role !== 'user') return sendJson(res, 400, { error: 'Last message must be from the user' });
        return streamText(req, res, { system: CHAT_SYSTEM(body.digest || {}), maxTokens: 2000, effort: 'low', messages });
      }
      return next ? next() : sendJson(res, 404, { error: 'Not found' });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  };
}

module.exports = { llmHandler, checkStatus, MODEL };
