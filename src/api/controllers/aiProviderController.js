import { prisma } from '../../lib/db.js';
import { encryptSecret } from '../../lib/secrets.js';
import { logAudit } from '../../lib/audit.js';
import { getAiRuntimeSnapshot, resilientJsonRequestWithModelFallback } from '../../intelligence/aiRuntime.js';
import { extractResponseText } from '../../intelligence/openaiResponse.js';
import {
  clearAiProviderCredentialCache,
  getAiProviderStatus,
  openRouterKeyMeta,
  resolveAiProviderRuntime,
  validateOpenRouterApiKey,
  validateOpenRouterModel,
} from '../../intelligence/aiProvider.js';
import { ValidationError } from '../security/validation.js';

function guildIdOrThrow() {
  const guildId = String(process.env.GUILD_ID || '').trim();
  if (!guildId) throw new ValidationError('GUILD_ID chưa cấu hình');
  return guildId;
}

async function currentConfig() {
  const guildId = guildIdOrThrow();
  return prisma.guildConfig.findUnique({ where: { guildId } });
}

export async function getAiProvider(req, res) {
  try {
    const config = await currentConfig();
    const status = await getAiProviderStatus(config || {});
    const runtime = getAiRuntimeSnapshot().filter((row) => String(row.service || '').startsWith('openrouter-'));
    res.json({ success: true, data: { ...status, runtime } });
  } catch (error) {
    console.error('[AI PROVIDER GET]', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Không đọc được cấu hình AI provider' });
  }
}

export async function setOpenRouterKey(req, res) {
  try {
    const guildId = guildIdOrThrow();
    let apiKey;
    try { apiKey = validateOpenRouterApiKey(req.body?.apiKey); }
    catch (error) { throw new ValidationError(error.message); }
    const meta = openRouterKeyMeta(apiKey);
    const apiKeyCiphertext = encryptSecret(apiKey);

    await prisma.aiProviderCredential.upsert({
      where: { guildId_provider: { guildId, provider: 'openrouter' } },
      update: {
        apiKeyCiphertext,
        ...meta,
        lastTestedAt: null,
        lastTestStatus: null,
      },
      create: {
        guildId,
        provider: 'openrouter',
        apiKeyCiphertext,
        ...meta,
      },
    });
    clearAiProviderCredentialCache();
    await logAudit({
      action: 'config.ai.openrouter_key.update',
      actorId: req.user.discordId,
      actorName: req.user.username,
      metadata: { provider: 'openrouter', keyHint: meta.keyHint, fingerprint: meta.keyFingerprint },
    });
    const config = await currentConfig();
    const status = await getAiProviderStatus(config || {});
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('[AI PROVIDER KEY UPDATE]', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Không lưu được OpenRouter API key' });
  }
}

export async function deleteOpenRouterKey(req, res) {
  try {
    const guildId = guildIdOrThrow();
    const removed = await prisma.aiProviderCredential.deleteMany({ where: { guildId, provider: 'openrouter' } });
    clearAiProviderCredentialCache();
    await logAudit({
      action: 'config.ai.openrouter_key.delete',
      actorId: req.user.discordId,
      actorName: req.user.username,
      metadata: { provider: 'openrouter', removed: removed.count },
    });
    const config = await currentConfig();
    const status = await getAiProviderStatus(config || {});
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('[AI PROVIDER KEY DELETE]', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Không xóa được OpenRouter API key' });
  }
}

export async function testOpenRouter(req, res) {
  const guildId = String(process.env.GUILD_ID || '').trim();
  try {
    const config = (await currentConfig()) || {};
    let overrideApiKey = '';
    if (req.body?.apiKey) {
      try { overrideApiKey = validateOpenRouterApiKey(req.body.apiKey); }
      catch (error) { throw new ValidationError(error.message); }
    }
    const candidate = { ...config };
    if (req.body?.model !== undefined) candidate.openRouterModel = validateOpenRouterModel(req.body.model);
    const runtime = await resolveAiProviderRuntime(candidate, { purpose: 'test', overrideApiKey });
    if (!runtime) throw new ValidationError('Chưa có OpenRouter API key. Hãy nhập key hoặc cấu hình OPENROUTER_API_KEY.');

    const started = Date.now();
    const { payload, requestId, attempts, latencyMs, fallbackUsed, modelUsed: routedModel } = await resilientJsonRequestWithModelFallback(runtime.responsesUrl, {
      method: 'POST',
      headers: runtime.headers,
      body: JSON.stringify({
        model: runtime.model,
        input: 'Return exactly the word OK.',
        max_output_tokens: 24,
      }),
    }, {
      fallbackModel: runtime.fallbackModel,
      service: 'openrouter-dashboard-test',
      timeoutMs: 15_000,
      retries: 0,
      circuitFailures: 4,
      circuitSeconds: 30,
    });

    const output = extractResponseText(payload).slice(0, 80);
    const usage = responseUsage(payload);
    const modelUsed = String(payload?.model || routedModel || runtime.model || '').slice(0, 200);
    if (runtime.apiKeySource === 'dashboard' && !overrideApiKey && guildId) {
      await prisma.aiProviderCredential.updateMany({
        where: { guildId, provider: 'openrouter' },
        data: { lastTestedAt: new Date(), lastTestStatus: 'ok' },
      }).catch(() => {});
    }
    await logAudit({
      action: 'config.ai.openrouter.test',
      actorId: req.user.discordId,
      actorName: req.user.username,
      metadata: { provider: 'openrouter', model: runtime.model, modelUsed, fallbackUsed: Boolean(fallbackUsed), source: runtime.apiKeySource, ok: true, latencyMs, ...usage },
    });
    res.json({
      success: true,
      data: {
        ok: true,
        provider: 'openrouter',
        model: runtime.model,
        modelUsed,
        fallbackUsed: Boolean(fallbackUsed),
        keySource: runtime.apiKeySource,
        response: output || 'OK',
        requestId: requestId || payload?.id || null,
        attempts,
        latencyMs: latencyMs || Date.now() - started,
        usage,
      },
    });
  } catch (error) {
    if (guildId && !req.body?.apiKey) {
      await prisma.aiProviderCredential.updateMany({
        where: { guildId, provider: 'openrouter' },
        data: { lastTestedAt: new Date(), lastTestStatus: 'error' },
      }).catch(() => {});
    }
    console.error('[AI PROVIDER TEST]', error.message);
    const status = Number(error?.status) || error.statusCode || 502;
    const safeMessage = status === 401
      ? 'OpenRouter API key không hợp lệ hoặc đã bị thu hồi'
      : status === 402
        ? 'OpenRouter API key/account không đủ credit cho model đã chọn'
        : status === 429
          ? 'OpenRouter đang rate limit. Vui lòng thử lại sau.'
          : error instanceof ValidationError
            ? error.message
            : 'Không kết nối được OpenRouter với model đã chọn';
    res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, message: safeMessage, code: 'OPENROUTER_TEST_FAILED' });
  }
}

function responseUsage(payload = {}) {
  const usage = payload?.usage || {};
  const inputTokens = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  const outputTokens = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? (inputTokens + outputTokens)) || 0;
  const reasoningTokens = Number(
    usage?.output_tokens_details?.reasoning_tokens
      ?? usage?.completion_tokens_details?.reasoning_tokens
      ?? 0,
  ) || 0;
  return { inputTokens, outputTokens, totalTokens, reasoningTokens };
}

function cleanPlaygroundPrompt(value) {
  const prompt = String(value || '').trim();
  if (!prompt) throw new ValidationError('Hãy nhập nội dung để thử AI');
  if (prompt.length > 2000) throw new ValidationError('AI Playground giới hạn 2.000 ký tự mỗi lần thử');
  return prompt;
}

export async function playgroundOpenRouter(req, res) {
  try {
    const prompt = cleanPlaygroundPrompt(req.body?.prompt);
    const config = (await currentConfig()) || {};
    const candidate = { ...config };
    if (req.body?.model !== undefined && String(req.body.model || '').trim()) {
      candidate.openRouterModel = validateOpenRouterModel(req.body.model);
    }
    let overrideApiKey = '';
    if (req.body?.apiKey) {
      try { overrideApiKey = validateOpenRouterApiKey(req.body.apiKey); }
      catch (error) { throw new ValidationError(error.message); }
    }

    const runtime = await resolveAiProviderRuntime(candidate, { purpose: 'test', overrideApiKey });
    if (!runtime) throw new ValidationError('Chưa có OpenRouter API key. Hãy nhập key hoặc cấu hình OPENROUTER_API_KEY.');

    const { payload, requestId, attempts, latencyMs, fallbackUsed, modelUsed: routedModel } = await resilientJsonRequestWithModelFallback(runtime.responsesUrl, {
      method: 'POST',
      headers: runtime.headers,
      body: JSON.stringify({
        model: runtime.model,
        instructions: [
          'Bạn đang chạy trong AI Playground quản trị của hệ thống Discord Smart Ticket.',
          'Trả lời trực tiếp bằng tiếng Việt, ngắn gọn và hữu ích.',
          'Không giả vờ đã thao tác Discord, database, Minecraft server hoặc công cụ bên ngoài.',
          'Nếu câu hỏi yêu cầu dữ liệu mà bạn không được cung cấp, hãy nói rõ là chưa có dữ liệu.',
        ].join('\n'),
        input: prompt,
        max_output_tokens: 500,
        ...(runtime.reasoning ? { reasoning: runtime.reasoning } : {}),
      }),
    }, {
      fallbackModel: runtime.fallbackModel,
      service: 'openrouter-dashboard-playground',
      timeoutMs: 20_000,
      retries: 1,
      circuitFailures: 4,
      circuitSeconds: 30,
    });

    const response = extractResponseText(payload).slice(0, 5000);
    if (!response) throw new Error('OpenRouter không trả về nội dung');
    const usage = responseUsage(payload);
    const modelUsed = String(payload?.model || routedModel || runtime.model || '').slice(0, 200);

    await logAudit({
      action: 'config.ai.openrouter.playground',
      actorId: req.user.discordId,
      actorName: req.user.username,
      metadata: {
        provider: 'openrouter',
        requestedModel: runtime.model,
        modelUsed,
        promptLength: prompt.length,
        latencyMs,
        attempts,
        fallbackUsed: Boolean(fallbackUsed),
        ...usage,
      },
    });

    res.json({
      success: true,
      data: {
        ok: true,
        provider: 'openrouter',
        requestedModel: runtime.model,
        modelUsed,
        fallbackUsed: Boolean(fallbackUsed),
        keySource: runtime.apiKeySource,
        response,
        requestId: requestId || payload?.id || null,
        attempts,
        latencyMs,
        usage,
      },
    });
  } catch (error) {
    console.error('[AI PROVIDER PLAYGROUND]', error.message);
    const status = Number(error?.status) || error.statusCode || 502;
    const safeMessage = status === 401
      ? 'OpenRouter API key không hợp lệ hoặc đã bị thu hồi'
      : status === 402
        ? 'OpenRouter API key/account không đủ credit cho model đã chọn'
        : status === 429
          ? 'OpenRouter đang rate limit. Vui lòng thử lại sau.'
          : error instanceof ValidationError
            ? error.message
            : 'AI Playground không nhận được phản hồi từ OpenRouter';
    res.status(status >= 400 && status < 600 ? status : 502).json({ success: false, message: safeMessage, code: 'OPENROUTER_PLAYGROUND_FAILED' });
  }
}
