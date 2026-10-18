/* Client for the LLM endpoints in server/llm.js. The API key stays on the
   server; when it isn't configured the UI falls back to offline templates. */

export async function llmStatus() {
  try {
    const res = await fetch('/api/llm/status');
    if (!res.ok) return { available: false, reason: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { available: false, reason: 'LLM server not reachable' };
  }
}

/**
 * POST to an LLM endpoint and stream the plain-text response.
 * onText(fullTextSoFar) is called as chunks arrive. Resolves to the full text.
 */
export async function streamLLM(path, body, onText, signal) {
  const res = await fetch(`/api/llm/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch (e) { /* not JSON */ }
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText?.(text);
  }
  return text;
}
