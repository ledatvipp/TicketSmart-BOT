import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_FREE_FALLBACK_MODEL,
  OPENROUTER_EMBEDDINGS_URL,
  OPENROUTER_RESPONSES_URL,
  openRouterKeyMeta,
  providerSettings,
  resolveAiProviderRuntime,
  validateOpenRouterApiKey,
  validateOpenRouterModel,
} from '../src/intelligence/aiProvider.js';
import { resilientJsonRequestWithModelFallback } from '../src/intelligence/aiRuntime.js';

const TEST_KEY = `sk-or-v1-${'a'.repeat(40)}`;

test('OpenRouter default model is the requested Gemma 4 free model', () => {
  assert.equal(DEFAULT_OPENROUTER_MODEL, 'google/gemma-4-26b-a4b-it:free');
  assert.equal(validateOpenRouterModel(DEFAULT_OPENROUTER_MODEL), DEFAULT_OPENROUTER_MODEL);
});

test('OpenRouter API key validation rejects malformed values and never exposes full key in metadata', () => {
  assert.throws(() => validateOpenRouterApiKey('sk-not-openrouter'), /OpenRouter API key/);
  assert.equal(validateOpenRouterApiKey(TEST_KEY), TEST_KEY);
  const meta = openRouterKeyMeta(TEST_KEY);
  assert.ok(meta.keyHint.startsWith('sk-or-v1'));
  assert.ok(meta.keyHint.endsWith(TEST_KEY.slice(-4)));
  assert.equal(meta.keyHint.includes(TEST_KEY), false);
  assert.match(meta.keyFingerprint, /^[a-f0-9]{16}$/);
});

test('provider settings support split answer/triage/embedding models', () => {
  const settings = providerSettings({
    openRouterModel: 'google/gemma-4-26b-a4b-it:free',
    openRouterAnswerModel: 'anthropic/claude-sonnet-4.5',
    openRouterTriageModel: 'openai/gpt-5-mini',
    openRouterEmbeddingModel: 'openai/text-embedding-3-small',
    openRouterReasoningEnabled: true,
    openRouterReasoningEffort: 'medium',
  });
  assert.equal(settings.classifierModel, 'google/gemma-4-26b-a4b-it:free');
  assert.equal(settings.answerModel, 'anthropic/claude-sonnet-4.5');
  assert.equal(settings.triageModel, 'openai/gpt-5-mini');
  assert.equal(settings.embeddingModel, 'openai/text-embedding-3-small');
  assert.equal(settings.reasoningEffort, 'medium');
});

test('runtime uses OpenRouter Responses/Embeddings endpoints and bearer auth', async () => {
  const runtime = await resolveAiProviderRuntime({
    openRouterModel: DEFAULT_OPENROUTER_MODEL,
    openRouterEmbeddingModel: 'openai/text-embedding-3-small',
    openRouterReasoningEnabled: true,
    openRouterReasoningEffort: 'low',
  }, { purpose: 'answer', overrideApiKey: TEST_KEY });

  assert.equal(runtime.responsesUrl, OPENROUTER_RESPONSES_URL);
  assert.equal(runtime.embeddingsUrl, OPENROUTER_EMBEDDINGS_URL);
  assert.equal(runtime.model, DEFAULT_OPENROUTER_MODEL);
  assert.equal(runtime.headers.Authorization, `Bearer ${TEST_KEY}`);
  assert.equal(runtime.headers['Content-Type'], 'application/json');
  assert.deepEqual(runtime.reasoning, { effort: 'low' });
  assert.equal(runtime.apiKeySource, 'request');
});

test('Dashboard provider storage is separated from GuildConfig and encrypted before persistence', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../src/api/controllers/aiProviderController.js', import.meta.url), 'utf8');
  const configController = readFileSync(new URL('../src/api/controllers/configController.js', import.meta.url), 'utf8');

  assert.match(schema, /model AiProviderCredential/);
  assert.match(schema, /apiKeyCiphertext\s+String/);
  assert.doesNotMatch(schema, /openRouterApiKey\s+String/);
  assert.match(controller, /encryptSecret\(apiKey\)/);
  assert.doesNotMatch(configController, /apiKeyCiphertext/);
});

test('free OpenRouter models get a safe trial fallback while paid models do not', async () => {
  const original = process.env.OPENROUTER_FALLBACK_MODEL;
  delete process.env.OPENROUTER_FALLBACK_MODEL;
  try {
    const freeRuntime = await resolveAiProviderRuntime({
      openRouterModel: DEFAULT_OPENROUTER_MODEL,
    }, { purpose: 'answer', overrideApiKey: TEST_KEY });
    assert.equal(freeRuntime.fallbackModel, DEFAULT_OPENROUTER_FREE_FALLBACK_MODEL);

    const paidRuntime = await resolveAiProviderRuntime({
      openRouterModel: 'openai/gpt-5-mini',
    }, { purpose: 'answer', overrideApiKey: TEST_KEY });
    assert.equal(paidRuntime.fallbackModel, '');
  } finally {
    if (original === undefined) delete process.env.OPENROUTER_FALLBACK_MODEL;
    else process.env.OPENROUTER_FALLBACK_MODEL = original;
  }
});

test('model fallback retries a transient free-model failure with openrouter/free', async () => {
  const originalFetch = globalThis.fetch;
  const seenModels = [];
  globalThis.fetch = async (_url, request = {}) => {
    const body = JSON.parse(request.body || '{}');
    seenModels.push(body.model);
    if (seenModels.length === 1) {
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers(),
        text: async () => JSON.stringify({ error: { message: 'rate limited' } }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'x-request-id': 'fallback-test' }),
      text: async () => JSON.stringify({
        id: 'resp-fallback',
        model: 'nvidia/nemotron-test:free',
        output_text: 'OK',
        usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
      }),
    };
  };

  try {
    const result = await resilientJsonRequestWithModelFallback('https://example.invalid/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: DEFAULT_OPENROUTER_MODEL, input: 'hello' }),
    }, {
      service: `openrouter-fallback-test-${Date.now()}`,
      retries: 0,
      timeoutMs: 1000,
      fallbackModel: DEFAULT_OPENROUTER_FREE_FALLBACK_MODEL,
    });

    assert.deepEqual(seenModels, [DEFAULT_OPENROUTER_MODEL, DEFAULT_OPENROUTER_FREE_FALLBACK_MODEL]);
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.requestedModel, DEFAULT_OPENROUTER_MODEL);
    assert.equal(result.modelUsed, 'nvidia/nemotron-test:free');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Dashboard OpenRouter playground is rate-limited, escaped in Vue and does not audit prompt content', () => {
  const controller = readFileSync(new URL('../src/api/controllers/aiProviderController.js', import.meta.url), 'utf8');
  const apiIndex = readFileSync(new URL('../src/api/index.js', import.meta.url), 'utf8');
  const configView = readFileSync(new URL('../src/web/src/views/ConfigView.vue', import.meta.url), 'utf8');

  assert.match(controller, /promptLength:\s*prompt\.length/);
  assert.doesNotMatch(controller, /metadata:\s*\{[^}]*\bprompt\s*[:,]/s);
  assert.match(apiIndex, /ai-provider\/playground', expensiveLimiter/);
  assert.match(configView, /\{\{ playgroundResult\.response \}\}/);
  assert.doesNotMatch(configView, /v-html="playgroundResult\.response"/);
});
