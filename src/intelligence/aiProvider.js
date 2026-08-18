import crypto from 'crypto';
import { decryptSecret } from '../lib/secrets.js';

export const OPENROUTER_RESPONSES_URL = 'https://openrouter.ai/api/v1/responses';
export const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
export const DEFAULT_OPENROUTER_MODEL = 'google/gemma-4-26b-a4b-it:free';
export const DEFAULT_OPENROUTER_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const DEFAULT_OPENROUTER_FREE_FALLBACK_MODEL = 'openrouter/free';
const REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high']);
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._~:@/+\-]{0,199}$/;

let credentialCache = null;
const CREDENTIAL_TTL_MS = 30_000;

function cleanModel(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return MODEL_RE.test(text) ? text : fallback;
}

export function validateOpenRouterModel(value, { allowEmpty = false } = {}) {
  const text = String(value || '').trim();
  if (!text && allowEmpty) return '';
  if (!text || !MODEL_RE.test(text)) throw new Error('OpenRouter model ID không hợp lệ');
  return text;
}

export function validateOpenRouterApiKey(value) {
  const text = String(value || '').trim();
  if (text.length < 20 || text.length > 512 || /\s/.test(text) || !text.startsWith('sk-or-')) {
    throw new Error('OpenRouter API key không hợp lệ (key phải bắt đầu bằng sk-or-)');
  }
  return text;
}

export function openRouterKeyMeta(apiKey) {
  const key = validateOpenRouterApiKey(apiKey);
  return {
    keyHint: `${key.slice(0, 8)}…${key.slice(-4)}`,
    keyFingerprint: crypto.createHash('sha256').update(key).digest('hex').slice(0, 16),
  };
}

export function clearAiProviderCredentialCache() {
  credentialCache = null;
}

async function loadStoredCredential() {
  const guildId = String(process.env.GUILD_ID || '').trim();
  if (!guildId) return null;
  if (credentialCache && credentialCache.guildId === guildId && credentialCache.expiresAt > Date.now()) {
    return credentialCache.value;
  }
  try {
    const { prisma } = await import('../lib/db.js');
    const row = await prisma.aiProviderCredential.findUnique({
      where: { guildId_provider: { guildId, provider: 'openrouter' } },
    });
    const value = row ? {
      apiKey: decryptSecret(row.apiKeyCiphertext),
      keyHint: row.keyHint || '',
      keyFingerprint: row.keyFingerprint || '',
      source: 'dashboard',
    } : null;
    // Cache misses only briefly so a key saved by the API process becomes visible to the bot quickly.
    credentialCache = { guildId, value, expiresAt: Date.now() + (value ? CREDENTIAL_TTL_MS : 5_000) };
    return value;
  } catch (error) {
    // During syntax/unit tests the generated Prisma client may not exist. Env fallback remains usable.
    if (process.env.NODE_ENV !== 'test') console.warn('[AI PROVIDER] Không đọc được credential DB:', error.message);
    return null;
  }
}


function freeFallbackModel() {
  const raw = String(process.env.OPENROUTER_FALLBACK_MODEL ?? '').trim();
  if (['off', 'none', 'false', '0'].includes(raw.toLowerCase())) return '';
  return cleanModel(raw, DEFAULT_OPENROUTER_FREE_FALLBACK_MODEL);
}

function isFreeModel(model) {
  const value = String(model || '').trim().toLowerCase();
  return value === 'openrouter/free' || value.endsWith(':free');
}

export function providerSettings(config = {}) {
  const mainModel = cleanModel(config.openRouterModel || process.env.OPENROUTER_MODEL, DEFAULT_OPENROUTER_MODEL);
  return {
    provider: 'openrouter',
    model: mainModel,
    classifierModel: mainModel,
    answerModel: cleanModel(config.openRouterAnswerModel || process.env.OPENROUTER_ANSWER_MODEL, mainModel),
    triageModel: cleanModel(config.openRouterTriageModel || process.env.OPENROUTER_TRIAGE_MODEL, mainModel),
    embeddingModel: cleanModel(config.openRouterEmbeddingModel || process.env.OPENROUTER_EMBEDDING_MODEL, DEFAULT_OPENROUTER_EMBEDDING_MODEL),
    freeFallbackModel: freeFallbackModel(),
    reasoningEnabled: config.openRouterReasoningEnabled !== false,
    reasoningEffort: REASONING_EFFORTS.has(String(config.openRouterReasoningEffort || '').trim())
      ? String(config.openRouterReasoningEffort).trim()
      : 'low',
  };
}

export function isAiProviderConfigured(config = {}) {
  if (config.aiProviderReady === true || config.openRouterApiKeyConfigured === true) return true;
  return Boolean(String(process.env.OPENROUTER_API_KEY || '').trim());
}

async function resolveApiKey(config = {}, overrideApiKey = '') {
  if (overrideApiKey) return { apiKey: validateOpenRouterApiKey(overrideApiKey), source: 'request' };

  // Always check encrypted Dashboard storage first. The config status can be cached in the bot
  // process, so using it as an authority here could keep a newly rotated Dashboard key inactive.
  const stored = await loadStoredCredential();
  if (stored?.apiKey) return { apiKey: validateOpenRouterApiKey(stored.apiKey), source: 'dashboard', ...stored };

  const envKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (envKey) return { apiKey: validateOpenRouterApiKey(envKey), source: 'env' };
  return null;
}

function attributionHeaders() {
  const referer = String(process.env.OPENROUTER_HTTP_REFERER || process.env.PUBLIC_BASE_URL || '').trim();
  const title = String(process.env.OPENROUTER_APP_TITLE || 'Discord Smart Ticket').trim().slice(0, 80);
  return {
    ...(referer ? { 'HTTP-Referer': referer } : {}),
    ...(title ? { 'X-OpenRouter-Title': title } : {}),
  };
}

export async function resolveAiProviderRuntime(config = {}, { purpose = 'classifier', overrideApiKey = '' } = {}) {
  const credential = await resolveApiKey(config, overrideApiKey);
  if (!credential?.apiKey) return null;
  const settings = providerSettings(config);
  const modelByPurpose = {
    classifier: settings.classifierModel,
    answer: settings.answerModel,
    triage: settings.triageModel,
    embedding: settings.embeddingModel,
    test: settings.model,
  };
  const selectedModel = modelByPurpose[purpose] || settings.model;
  const fallbackModel = purpose !== 'embedding' && isFreeModel(selectedModel) && selectedModel !== settings.freeFallbackModel
    ? settings.freeFallbackModel
    : '';
  return {
    ...settings,
    model: selectedModel,
    fallbackModel,
    apiKeySource: credential.source,
    responsesUrl: OPENROUTER_RESPONSES_URL,
    embeddingsUrl: OPENROUTER_EMBEDDINGS_URL,
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      'Content-Type': 'application/json',
      ...attributionHeaders(),
    },
    reasoning: settings.reasoningEnabled ? { effort: settings.reasoningEffort } : null,
  };
}

export async function getAiProviderStatus(config = {}) {
  const stored = await loadStoredCredential();
  const envKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  const source = stored?.apiKey ? 'dashboard' : envKey ? 'env' : 'none';
  const settings = providerSettings(config);
  return {
    aiProvider: 'openrouter',
    aiProviderReady: source !== 'none',
    openRouterApiKeyConfigured: source !== 'none',
    openRouterApiKeySource: source,
    openRouterKeyHint: stored?.keyHint || (envKey ? `${envKey.slice(0, 8)}…${envKey.slice(-4)}` : ''),
    ...settings,
  };
}
