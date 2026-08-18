import crypto from 'crypto';
import { getCached, resilientJsonRequest, setCached } from './aiRuntime.js';
import { isAiProviderConfigured, resolveAiProviderRuntime } from './aiProvider.js';


export function embeddingConfigured(config = {}) {
  return isAiProviderConfigured(config);
}

export async function embeddingProviderReady(config = {}) {
  return Boolean(await resolveAiProviderRuntime(config, { purpose: 'embedding' }));
}

export function embeddingTextForArticle(article = {}) {
  return [article.title, article.summary, article.category, article.keywords, article.content]
    .filter(Boolean)
    .join('\n')
    .slice(0, 24000);
}

export function embeddingHash(text = '') {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

export async function createEmbedding(input, { timeoutMs = 10000, cache = false, retries = 2, config = {} } = {}) {
  const runtime = await resolveAiProviderRuntime(config, { purpose: 'embedding' });
  if (!runtime) return null;
  const clean = String(input || '').trim().slice(0, 24000);
  if (!clean) return null;

  const model = runtime.model;
  const key = `${model}:${embeddingHash(clean)}`;
  if (cache) {
    const cached = getCached('openrouter-embeddings', key);
    if (cached) return cached;
  }

  const { payload, requestId, attempts, latencyMs } = await resilientJsonRequest(runtime.embeddingsUrl, {
    method: 'POST',
    headers: runtime.headers,
    body: JSON.stringify({ model, input: clean }),
  }, {
    service: 'openrouter-embeddings', timeoutMs, retries,
    circuitFailures: 4, circuitSeconds: 60,
  });

  const vector = payload?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || !vector.length) throw new Error('Embedding response không hợp lệ');
  const result = { vector, model, requestId: requestId || payload.id || null, attempts, latencyMs };
  if (cache) setCached('openrouter-embeddings', key, result, 20 * 60_000, 350);
  return result;
}

export function parseEmbedding(value) {
  if (Array.isArray(value)) return value;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
