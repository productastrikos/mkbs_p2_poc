// Dev server hook (react-scripts loads this automatically): serves the LLM
// API from the same origin as the app. CRA has already loaded .env.local
// into process.env, so ANTHROPIC_API_KEY is available here.
const { llmHandler } = require('../server/llm');

module.exports = function setupProxy(app) {
  app.use('/api/llm', llmHandler());
};
