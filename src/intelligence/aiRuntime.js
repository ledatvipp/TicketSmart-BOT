import crypto from 'crypto';

const services = new Map();
const caches = new Map();

function stateFor(service) {
  if (!services.has(service)) {
    services.set(service, {
      requests: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      cacheHits: 0,
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
      lastError: null,
      lastRequestAt: null,
      lastSuccessAt: null,
      totalLatencyMs: 0,
    });
  }
  return services.get(service);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(3000, retryAfter * 1000);
  return Math.min(2500, 300 * (2 ** attempt) + Math.floor(Math.random() * 180));
}

function retryableStatus(status) {
  return [408, 409, 425, 429].includes(status) || status >= 500;
}

export class CircuitOpenError extends Error {
  constructor(service, until) {
    super(`Circuit breaker ${service} đang tạm mở đến ${new Date(until).toISOString()}`);
    this.name = 'CircuitOpenError';
    this.code = 'CIRCUIT_OPEN';
    this.service = service;
  }
}

export async function resilientJsonRequest(url, request = {}, {
  service = 'ai-provider',
  timeoutMs = 9000,
  retries = 2,
  circuitFailures = 4,
  circuitSeconds = 45,
} = {}) {
  const state = stateFor(service);
  const now = Date.now();
  if (state.circuitOpenUntil > now) throw new CircuitOpenError(service, state.circuitOpenUntil);

  state.requests += 1;
  state.lastRequestAt = new Date().toISOString();
  const startedAt = Date.now();
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const clientRequestId = crypto.randomUUID();
    try {
      const response = await fetch(url, {
        ...request,
        signal: controller.signal,
        headers: {
          ...(request.headers || {}),
          'X-Client-Request-Id': clientRequestId,
        },
      });
      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }

      if (!response.ok) {
        const detail = String(payload?.error?.message || payload?.raw || raw || response.statusText).slice(0, 500);
        const error = new Error(`${service} ${response.status}: ${detail}`);
        error.status = response.status;
        error.requestId = response.headers.get('x-request-id') || clientRequestId;
        if (attempt < retries && retryableStatus(response.status)) {
          state.retries += 1;
          await sleep(retryDelay(response, attempt));
          lastError = error;
          continue;
        }
        throw error;
      }

      state.successes += 1;
      state.consecutiveFailures = 0;
      state.circuitOpenUntil = 0;
      state.lastError = null;
      state.lastSuccessAt = new Date().toISOString();
      state.totalLatencyMs += Date.now() - startedAt;
      return {
        payload,
        requestId: response.headers.get('x-request-id') || payload?.id || clientRequestId,
        clientRequestId,
        attempts: attempt + 1,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
      const retryableNetwork = error?.name === 'AbortError' || !Number.isFinite(error?.status);
      if (attempt < retries && retryableNetwork) {
        state.retries += 1;
        await sleep(Math.min(2500, 300 * (2 ** attempt) + Math.floor(Math.random() * 180)));
        continue;
      }
      break;
    } finally {
      clearTimeout(timeout);
    }
  }

  state.failures += 1;
  state.consecutiveFailures += 1;
  state.lastError = String(lastError?.message || lastError || 'Unknown request error').slice(0, 500);
  state.totalLatencyMs += Date.now() - startedAt;
  if (state.consecutiveFailures >= circuitFailures) {
    state.circuitOpenUntil = Date.now() + Math.max(10, circuitSeconds) * 1000;
  }
  throw lastError || new Error(`${service} request thất bại`);
}


function shouldTryModelFallback(error) {
  const status = Number(error?.status);
  if (!Number.isFinite(status)) return true;
  return [408, 409, 425, 429].includes(status) || status >= 500;
}

function replaceRequestModel(request = {}, model) {
  if (!model || typeof request.body !== 'string') return request;
  let body;
  try { body = JSON.parse(request.body); } catch { return request; }
  return { ...request, body: JSON.stringify({ ...body, model }) };
}

export async function resilientJsonRequestWithModelFallback(url, request = {}, {
  fallbackModel = '',
  ...options
} = {}) {
  let requestedModel = '';
  try {
    if (typeof request.body === 'string') requestedModel = String(JSON.parse(request.body)?.model || '').trim();
  } catch { /* invalid JSON will be handled by the request itself */ }

  try {
    const result = await resilientJsonRequest(url, request, options);
    return {
      ...result,
      requestedModel,
      modelUsed: String(result.payload?.model || requestedModel || '').trim(),
      fallbackUsed: false,
    };
  } catch (primaryError) {
    const fallback = String(fallbackModel || '').trim();
    if (!fallback || fallback === requestedModel || !shouldTryModelFallback(primaryError)) throw primaryError;

    const fallbackRequest = replaceRequestModel(request, fallback);
    try {
      const result = await resilientJsonRequest(url, fallbackRequest, {
        ...options,
        service: `${options.service || 'ai-provider'}-fallback`,
      });
      return {
        ...result,
        requestedModel,
        modelUsed: String(result.payload?.model || fallback).trim(),
        fallbackUsed: true,
        fallbackModel: fallback,
        primaryError: String(primaryError?.message || primaryError || '').slice(0, 300),
      };
    } catch (fallbackError) {
      fallbackError.primaryError = primaryError;
      throw fallbackError;
    }
  }
}

export function getCached(namespace, key) {
  const bucket = caches.get(namespace);
  if (!bucket) return null;
  const item = bucket.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    bucket.delete(key);
    return null;
  }
  stateFor(namespace).cacheHits += 1;
  return item.value;
}

export function setCached(namespace, key, value, ttlMs = 300000, maxEntries = 500) {
  if (!caches.has(namespace)) caches.set(namespace, new Map());
  const bucket = caches.get(namespace);
  bucket.set(key, { value, expiresAt: Date.now() + Math.max(1000, ttlMs) });
  while (bucket.size > maxEntries) bucket.delete(bucket.keys().next().value);
  return value;
}

export function clearRuntimeCache(namespace = null) {
  if (namespace) caches.delete(namespace);
  else caches.clear();
}

export function getAiRuntimeSnapshot() {
  return [...services.entries()].map(([service, value]) => ({
    service,
    ...value,
    circuitOpen: value.circuitOpenUntil > Date.now(),
    averageLatencyMs: value.successes + value.failures
      ? Math.round(value.totalLatencyMs / (value.successes + value.failures))
      : 0,
  }));
}
