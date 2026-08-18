// Controller cấu hình guild Discord
import { prisma } from '../../lib/db.js';
import { emit } from '../../lib/realtime.js';
import { logAudit } from '../../lib/audit.js';
import { clearLogCache } from '../../lib/discordLog.js';
import { sendChannelMessage, getChannelMessages, deleteChannelMessage } from '../../lib/discord.js';
import { join } from 'path';
import { decodeImageDataUrl, publicAssetUrl, saveImmutableImage } from '../../lib/media.js';
import { ValidationError, cleanDiscordId, cleanHttpUrl, cleanString } from '../security/validation.js';
import { getAiProviderStatus, validateOpenRouterModel } from '../../intelligence/aiProvider.js';
import { mergeClusters } from '../../clusters/clusterCatalog.js';

const CONFIG_UPLOADS_DIR = join(process.cwd(), 'uploads/config');
const CONFIG_MEDIA_FIELDS = ['embedThumbnail', 'embedImage', 'embedAuthorIcon', 'embedFooterIcon'];

function extractBase64AttachmentBackend(value, defaultFilename) {
  if (!value || !String(value).startsWith('data:image/')) return null;
  const image = decodeImageDataUrl(String(value), { maxBytes: 5 * 1024 * 1024 });
  const fileName = `${defaultFilename}-${image.sha256.slice(0, 12)}.${image.ext}`;
  return { file: { name: fileName, content: image.buffer }, url: `attachment://${fileName}` };
}

async function normalizeConfigMedia(data, req) {
  for (const key of CONFIG_MEDIA_FIELDS) {
    if (data[key] === undefined) continue;
    const value = String(data[key] || '').trim();
    if (!value) { data[key] = null; continue; }
    if (value.startsWith('data:image/')) {
      const saved = await saveImmutableImage({ dataUrl: value, directory: CONFIG_UPLOADS_DIR, maxBytes: 5 * 1024 * 1024 });
      data[key] = publicAssetUrl(`uploads/config/${saved.fileName}`, req);
    } else {
      data[key] = cleanHttpUrl(value, { nullable: false });
    }
  }
  return data;
}


const DEFAULT_CONFIG = {
  embedTitle: '🎮 Hệ Thống Hỗ Trợ Ticket',
  embedDesc: 'Chào mừng bạn đến với hệ thống hỗ trợ!\n\nChọn loại yêu cầu hỗ trợ phù hợp bên dưới để tạo ticket.\nStaff của chúng tôi sẽ phản hồi sớm nhất có thể!\n\n⏰ Thời gian phản hồi: 15-30 phút trong giờ cao điểm',
  embedColor: '#5865F2',
  embedFooter: '🎮 Game Server Support System',
  selectPlaceholder: '📋 Chọn loại hỗ trợ...',
  ticketTitle: '🎫 Ticket #{ticketNum}',
  ticketDesc: 'Xin chào {user}! Ticket của bạn đã được tạo thành công.\nVui lòng mô tả vấn đề chi tiết và chờ staff hỗ trợ.',
  ticketGuidance: '• Mô tả vấn đề của bạn chi tiết nhất có thể\n• Kèm theo ảnh/video nếu có\n• Staff sẽ phản hồi sớm nhất có thể',
  ticketFooter: 'ID: {ticketNum} • Hệ thống Ticket',
  ticketColor: '#5865F2',
  ticketShowType: true,
  ticketShowCreator: true,
  ticketShowTime: true,
  ticketShowGuide: true,
  deleteSetupMessages: true,
  dmOnTicketCreate: true,
  dmMessage: '✅ Ticket **#{ticketNum}** của bạn đã được tạo!\nVào {channel} để xem và mô tả vấn đề.',
  aiProvider: 'openrouter',
  openRouterModel: 'google/gemma-4-26b-a4b-it:free',
  openRouterAnswerModel: '',
  openRouterTriageModel: '',
  openRouterEmbeddingModel: 'openai/text-embedding-3-small',
  openRouterReasoningEnabled: true,
  openRouterReasoningEffort: 'low',
  smartSupportEnabled: false,
  smartSupportChannelIds: '',
  smartMentionOnly: false,
  smartCooldownSeconds: 15,
  smartRuleThreshold: 0.72,
  smartAiThreshold: 0.82,
  smartAiEnabled: false,
  smartKnowledgeEnabled: true,
  smartKnowledgeAiEnabled: false,
  smartKnowledgeThreshold: 0.3,
  smartKnowledgeMaxResults: 3,
  smartAnswerMaxChars: 1800,
  smartEvidenceMinScore: 0.50,
  smartEvidenceMinTopGap: 0.04,
  smartKnowledgeFreshnessDays: 180,
  smartEscalationRoleId: null,
  smartEscalationChannelId: null,
  smartRequireCluster: true,
  smartDefaultClusterKey: null,
  smartClusterChannelMap: '{}',
  smartConversationEnabled: true,
  smartConversationTtlMinutes: 15,
  smartMaxContextMessages: 6,
  smartClarificationEnabled: true,
  smartClarificationThreshold: 0.62,
  smartMultiIntentEnabled: true,
  smartMaxIntents: 2,
  smartFuzzyMatchingEnabled: true,
  smartResponseCacheSeconds: 300,
  smartAiRetryCount: 2,
  smartBurstLimitPerMinute: 8,
  ticketCompactMode: true,
  ticketAiEnabled: true,
  ticketAiMode: 'balanced',
  ticketAiOnlyCreator: true,
  ticketAiRequireQuestion: true,
  ticketAiPauseWhenClaimed: true,
  ticketAiSensitiveEscalation: true,
  ticketAiPanelMode: true,
  ticketAiAutoSummary: true,
  ticketAiReplyCooldownSeconds: 45,
  ticketAiMaxReplies: 3,
  ticketAiMinConfidence: 0.78,
  ticketAiMaxAnswerChars: 650,
  ticketAiContextMessages: 8,
  ticketAiTriageEnabled: true,
  ticketAiTriageMinConfidence: 0.75,
  ticketAiAutoPriority: true,
  ticketAiAutoTags: true,
  ticketAiAutoEscalateSensitive: false,
  ticketRequireCluster: true,
  ticketClusterSelectEnabled: true,
  smartLearnEnabled: false,
  smartLearnReviewChannelId: null,
  smartLearnReviewerRoleIds: '',
  smartLearnAdminRoleIds: '',
  smartLearnDeliveryMode: 'channel',
  smartLearnMaxDmReviewers: 10,
  smartLearnCandidateConfidence: 0.70,
  smartLearnDuplicateThreshold: 0.82,
  smartLearnStaffVotesRequired: 2,
  smartLearnAdminVotesRequired: 1,
  smartLearnMaxCandidatesPerHour: 30,
  smartLearnNotifyUser: true,
  smartLearnCreateFromNegativeVote: true,
  smartLearnFromResolvedTickets: true,
  smartLearnMinLearningScore: 0.45,
  smartLearnMinSourceDiversity: 1,
  smartLearnConflictThreshold: 0.70,
  smartLearnReviewIntervalDays: 90,
};

function normalizeSmartConfig(data) {
  if (data.aiProvider !== undefined) {
    if (String(data.aiProvider || '').trim() !== 'openrouter') throw new ValidationError('Hiện tại AI provider chỉ hỗ trợ OpenRouter');
    data.aiProvider = 'openrouter';
  }
  for (const key of ['openRouterModel', 'openRouterAnswerModel', 'openRouterTriageModel', 'openRouterEmbeddingModel']) {
    if (data[key] === undefined) continue;
    try { data[key] = validateOpenRouterModel(data[key], { allowEmpty: key === 'openRouterAnswerModel' || key === 'openRouterTriageModel' }); }
    catch (error) { throw new ValidationError(`${key}: ${error.message}`); }
  }
  if (data.openRouterReasoningEffort !== undefined) {
    const effort = String(data.openRouterReasoningEffort || '').trim();
    if (!['minimal', 'low', 'medium', 'high'].includes(effort)) throw new ValidationError('Reasoning effort phải là minimal, low, medium hoặc high');
    data.openRouterReasoningEffort = effort;
  }
  if (data.smartSupportChannelIds !== undefined) {
    data.smartSupportChannelIds = String(data.smartSupportChannelIds)
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^\d{15,22}$/.test(id))
      .slice(0, 50)
      .join(',');
  }
  if (data.smartCooldownSeconds !== undefined) {
    data.smartCooldownSeconds = Math.min(300, Math.max(3, Number.parseInt(data.smartCooldownSeconds, 10) || 15));
  }
  for (const key of ['smartRuleThreshold', 'smartAiThreshold']) {
    if (data[key] !== undefined) data[key] = Math.min(1, Math.max(0.5, Number(data[key]) || 0.8));
  }
  if (data.smartKnowledgeThreshold !== undefined) {
    data.smartKnowledgeThreshold = Math.min(1, Math.max(0.05, Number(data.smartKnowledgeThreshold) || 0.3));
  }
  if (data.smartKnowledgeMaxResults !== undefined) {
    data.smartKnowledgeMaxResults = Math.min(5, Math.max(1, Number.parseInt(data.smartKnowledgeMaxResults, 10) || 3));
  }
  if (data.smartAnswerMaxChars !== undefined) {
    data.smartAnswerMaxChars = Math.min(3500, Math.max(300, Number.parseInt(data.smartAnswerMaxChars, 10) || 1800));
  }
  if (data.smartEvidenceMinScore !== undefined) {
    data.smartEvidenceMinScore = Math.min(0.95, Math.max(0.2, Number(data.smartEvidenceMinScore) || 0.50));
  }
  if (data.smartEvidenceMinTopGap !== undefined) {
    const value = Number(data.smartEvidenceMinTopGap);
    data.smartEvidenceMinTopGap = Math.min(0.25, Math.max(0, Number.isFinite(value) ? value : 0.04));
  }
  if (data.smartKnowledgeFreshnessDays !== undefined) {
    data.smartKnowledgeFreshnessDays = Math.min(1460, Math.max(7, Number.parseInt(data.smartKnowledgeFreshnessDays, 10) || 180));
  }
  if (data.smartConversationTtlMinutes !== undefined) {
    data.smartConversationTtlMinutes = Math.min(1440, Math.max(2, Number.parseInt(data.smartConversationTtlMinutes, 10) || 15));
  }
  if (data.smartMaxContextMessages !== undefined) {
    data.smartMaxContextMessages = Math.min(12, Math.max(2, Number.parseInt(data.smartMaxContextMessages, 10) || 6));
  }
  if (data.smartClarificationThreshold !== undefined) {
    data.smartClarificationThreshold = Math.min(0.95, Math.max(0.3, Number(data.smartClarificationThreshold) || 0.62));
  }
  if (data.smartMaxIntents !== undefined) {
    data.smartMaxIntents = Math.min(3, Math.max(1, Number.parseInt(data.smartMaxIntents, 10) || 2));
  }
  if (data.smartResponseCacheSeconds !== undefined) {
    data.smartResponseCacheSeconds = Math.min(3600, Math.max(30, Number.parseInt(data.smartResponseCacheSeconds, 10) || 300));
  }
  if (data.smartAiRetryCount !== undefined) {
    data.smartAiRetryCount = Math.min(4, Math.max(0, Number.parseInt(data.smartAiRetryCount, 10) || 0));
  }
  if (data.smartBurstLimitPerMinute !== undefined) {
    data.smartBurstLimitPerMinute = Math.min(60, Math.max(2, Number.parseInt(data.smartBurstLimitPerMinute, 10) || 8));
  }
  if (data.smartDefaultClusterKey !== undefined) {
    const value = String(data.smartDefaultClusterKey || '').trim().toLowerCase();
    data.smartDefaultClusterKey = /^[a-z0-9-]{2,40}$/.test(value) ? value : null;
  }
  if (data.smartClusterChannelMap !== undefined) {
    try {
      const parsed = typeof data.smartClusterChannelMap === 'object'
        ? data.smartClusterChannelMap
        : JSON.parse(String(data.smartClusterChannelMap || '{}'));
      data.smartClusterChannelMap = JSON.stringify(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
    } catch {
      data.smartClusterChannelMap = '{}';
    }
  }
  if (data.ticketAiMode !== undefined) {
    const mode = String(data.ticketAiMode || 'balanced').toLowerCase();
    data.ticketAiMode = ['off', 'passive', 'balanced', 'active'].includes(mode) ? mode : 'balanced';
  }
  if (data.ticketAiReplyCooldownSeconds !== undefined) {
    data.ticketAiReplyCooldownSeconds = Math.min(900, Math.max(5, Number.parseInt(data.ticketAiReplyCooldownSeconds, 10) || 45));
  }
  if (data.ticketAiMaxReplies !== undefined) {
    data.ticketAiMaxReplies = Math.min(20, Math.max(0, Number.parseInt(data.ticketAiMaxReplies, 10) || 3));
  }
  if (data.ticketAiMinConfidence !== undefined) {
    data.ticketAiMinConfidence = Math.min(0.98, Math.max(0.5, Number(data.ticketAiMinConfidence) || 0.78));
  }
  if (data.ticketAiMaxAnswerChars !== undefined) {
    data.ticketAiMaxAnswerChars = Math.min(1200, Math.max(240, Number.parseInt(data.ticketAiMaxAnswerChars, 10) || 650));
  }
  if (data.ticketAiContextMessages !== undefined) {
    data.ticketAiContextMessages = Math.min(20, Math.max(2, Number.parseInt(data.ticketAiContextMessages, 10) || 8));
  }
  if (data.ticketAiTriageMinConfidence !== undefined) {
    data.ticketAiTriageMinConfidence = Math.min(0.98, Math.max(0.5, Number(data.ticketAiTriageMinConfidence) || 0.75));
  }
  for (const key of ['smartEscalationRoleId', 'smartEscalationChannelId', 'smartLearnReviewChannelId']) {
    if (data[key] !== undefined) {
      const value = String(data[key] || '').trim();
      data[key] = /^\d{15,22}$/.test(value) ? value : null;
    }
  }
  for (const key of ['smartLearnReviewerRoleIds', 'smartLearnAdminRoleIds']) {
    if (data[key] !== undefined) {
      data[key] = String(data[key] || '').split(',').map((id) => id.trim())
        .filter((id) => /^\d{15,22}$/.test(id)).slice(0, 30).join(',');
    }
  }
  if (data.smartLearnDeliveryMode !== undefined) {
    const mode = String(data.smartLearnDeliveryMode || 'channel').toLowerCase();
    data.smartLearnDeliveryMode = ['channel', 'dm', 'both'].includes(mode) ? mode : 'channel';
  }
  if (data.smartLearnMaxDmReviewers !== undefined) {
    data.smartLearnMaxDmReviewers = Math.min(25, Math.max(1, Number.parseInt(data.smartLearnMaxDmReviewers, 10) || 10));
  }
  for (const key of ['smartLearnCandidateConfidence', 'smartLearnDuplicateThreshold']) {
    if (data[key] !== undefined) data[key] = Math.min(0.99, Math.max(0.5, Number(data[key]) || 0.75));
  }
  for (const key of ['smartLearnStaffVotesRequired', 'smartLearnAdminVotesRequired']) {
    if (data[key] !== undefined) data[key] = Math.min(10, Math.max(1, Number.parseInt(data[key], 10) || 1));
  }
  if (data.smartLearnMaxCandidatesPerHour !== undefined) {
    data.smartLearnMaxCandidatesPerHour = Math.min(200, Math.max(1, Number.parseInt(data.smartLearnMaxCandidatesPerHour, 10) || 30));
  }
  if (data.smartLearnMinLearningScore !== undefined) {
    data.smartLearnMinLearningScore = Math.min(0.95, Math.max(0.2, Number(data.smartLearnMinLearningScore) || 0.45));
  }
  if (data.smartLearnMinSourceDiversity !== undefined) {
    data.smartLearnMinSourceDiversity = Math.min(10, Math.max(1, Number.parseInt(data.smartLearnMinSourceDiversity, 10) || 1));
  }
  if (data.smartLearnConflictThreshold !== undefined) {
    data.smartLearnConflictThreshold = Math.min(0.98, Math.max(0.4, Number(data.smartLearnConflictThreshold) || 0.70));
  }
  if (data.smartLearnReviewIntervalDays !== undefined) {
    data.smartLearnReviewIntervalDays = Math.min(730, Math.max(7, Number.parseInt(data.smartLearnReviewIntervalDays, 10) || 90));
  }
  return data;
}

function parseEmbedColor(color) {
  if (!color || color === 'none') return undefined;
  const clean = String(color).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return undefined;
  return parseInt(clean, 16);
}

function buildInitialTicketSelect(options, clusters, config) {
  const activeClusters = mergeClusters(clusters).filter((cluster) => cluster.isActive !== false).slice(0, 25);
  if (activeClusters.length) {
    return {
      custom_id: 'ticket_cluster_start',
      placeholder: '🗺️ Chọn cụm đang gặp vấn đề',
      options: activeClusters.map((cluster) => ({
        label: cluster.name,
        description: String(cluster.description || `Hỗ trợ cụm ${cluster.name}`).slice(0, 100),
        value: cluster.key,
        ...(cluster.emoji ? { emoji: { name: cluster.emoji } } : {}),
      })),
    };
  }

  return {
    custom_id: 'ticket_type_select',
    placeholder: config.selectPlaceholder || DEFAULT_CONFIG.selectPlaceholder,
    options: options.filter((option) => option.isActive).slice(0, 25).map((option) => ({
      label: option.name,
      description: option.description || `Hỗ trợ ${option.name}`,
      value: `option_${option.id}`,
      ...(option.emoji ? { emoji: { name: option.emoji } } : {}),
    })),
  };
}

function buildSetupPayload(config, options, clusters) {
  if (config.embedColor === 'none') {
    const initialSelect = buildInitialTicketSelect(options, clusters, config);
    const containerComponents = [];

    if (config.embedAuthorIcon) {
      containerComponents.push({
        type: 12,
        items: [{ media: { url: config.embedAuthorIcon } }]
      });
    }

    if (config.embedImage) {
      containerComponents.push({
        type: 12,
        items: [{ media: { url: config.embedImage } }]
      });
      containerComponents.push({
        type: 14,
        divider: true,
        spacing: 1
      });
    }

    const textComponents = [
      { type: 10, content: `# ${config.embedTitle || DEFAULT_CONFIG.embedTitle}` },
      { type: 10, content: config.embedDesc || DEFAULT_CONFIG.embedDesc }
    ];

    if (config.embedThumbnail) {
      containerComponents.push({
        type: 9,
        components: textComponents,
        accessory: {
          type: 11,
          media: {
            url: config.embedThumbnail
          }
        }
      });
    } else {
      containerComponents.push(...textComponents);
    }

    if (config.embedFooter) {
      if (config.embedFooterIcon) {
        containerComponents.push({
          type: 12,
          items: [{ media: { url: config.embedFooterIcon } }]
        });
      }
      containerComponents.push(
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: `-# ${config.embedFooter}` }
      );
    }

    containerComponents.push({
      type: 1,
      components: [{
        type: 3,
        ...initialSelect,
      }],
    });

    return {
      flags: 32768,
      components: [{
        type: 17,
        components: containerComponents
      }],
    };
  }

  const embed = {
    title: config.embedTitle || DEFAULT_CONFIG.embedTitle,
    description: config.embedDesc || DEFAULT_CONFIG.embedDesc,
    timestamp: new Date().toISOString(),
  };
  const color = parseEmbedColor(config.embedColor);
  if (color !== undefined) embed.color = color;
  if (config.embedThumbnail) embed.thumbnail = { url: config.embedThumbnail };
  if (config.embedImage) embed.image = { url: config.embedImage };
  if (config.embedAuthorIcon) {
    embed.author = {
      name: config.embedTitle || DEFAULT_CONFIG.embedTitle,
      icon_url: config.embedAuthorIcon
    };
  }
  if (config.embedFooter) {
    embed.footer = { text: config.embedFooter };
    if (config.embedFooterIcon) {
      embed.footer.icon_url = config.embedFooterIcon;
    }
  }

  const initialSelect = buildInitialTicketSelect(options, clusters, config);
  const components = [{
    type: 1,
    components: [{
      type: 3,
      ...initialSelect,
    }],
  }];

  return { embeds: [embed], components };
}
function buildAnnouncementPayload(data) {
  const mode = data.mode === 'container' ? 'container' : 'embed';
  const title = String(data.title || '').trim();
  const description = String(data.description || '').trim();
  const footer = String(data.footer || '').trim();
  const image = String(data.image || '').trim();
  const thumbnail = String(data.thumbnail || '').trim();
  const authorIcon = String(data.authorIcon || '').trim();
  const footerIcon = String(data.footerIcon || '').trim();
  const color = data.color || 'none';

  if (mode === 'container') {
    const containerComponents = [];

    if (authorIcon) {
      containerComponents.push({
        type: 12,
        items: [{ media: { url: authorIcon } }]
      });
    }

    if (image) {
      containerComponents.push({
        type: 12,
        items: [{ media: { url: image } }]
      });
      containerComponents.push({
        type: 14,
        divider: true,
        spacing: 1
      });
    }

    const textComponents = [
      ...(title ? [{ type: 10, content: `# ${title}` }] : []),
      ...(description ? [{ type: 10, content: description }] : [])
    ];

    if (thumbnail && textComponents.length > 0) {
      containerComponents.push({
        type: 9,
        components: textComponents,
        accessory: {
          type: 11,
          media: {
            url: thumbnail
          }
        }
      });
    } else {
      containerComponents.push(...textComponents);
    }

    if (footer) {
      if (footerIcon) {
        containerComponents.push({
          type: 12,
          items: [{ media: { url: footerIcon } }]
        });
      }
      containerComponents.push(
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: `-# ${footer}` }
      );
    }

    return {
      flags: 32768,
      components: [{
        type: 17,
        components: containerComponents
      }]
    };
  }

  const embed = {};
  if (title) embed.title = title;
  if (description) embed.description = description;
  if (footer) {
    embed.footer = { text: footer };
    if (footerIcon) embed.footer.icon_url = footerIcon;
  }
  if (image) embed.image = { url: image };
  if (thumbnail) embed.thumbnail = { url: thumbnail };
  if (authorIcon) {
    embed.author = {
      name: 'Thông báo',
      icon_url: authorIcon
    };
  }
  const embedColor = parseEmbedColor(color);
  if (embedColor !== undefined) embed.color = embedColor;
  return { embeds: [embed] };
}

export const getConfig = async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return res.status(500).json({ success: false, message: 'GUILD_ID chưa cấu hình' });

    let config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config) {
      config = await prisma.guildConfig.create({ data: { guildId, ...DEFAULT_CONFIG } });
    }
    const providerStatus = await getAiProviderStatus(config);
    res.json({ success: true, data: { ...config, ...providerStatus } });
  } catch (err) {
    console.error('[GET CONFIG ERROR]', err);
    res.status(500).json({ success: false, message: 'Lỗi lấy cấu hình' });
  }
};

export const updateConfig = async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    if (!guildId) return res.status(400).json({ success: false, message: 'Thiếu guildId' });

    const allowed = [
      'embedChannelId', 'logChannelId', 'staffRoleId',
      'embedTitle', 'embedDesc', 'embedColor', 'embedThumbnail', 'embedImage',
      'embedFooter', 'embedAuthorIcon', 'embedFooterIcon', 'selectPlaceholder',
      'ticketTitle', 'ticketDesc', 'ticketGuidance', 'ticketFooter', 'ticketColor',
      'ticketShowType', 'ticketShowCreator', 'ticketShowTime', 'ticketShowGuide',
      'deleteSetupMessages', 'dmOnTicketCreate', 'dmMessage',
      'aiProvider', 'openRouterModel', 'openRouterAnswerModel', 'openRouterTriageModel',
      'openRouterEmbeddingModel', 'openRouterReasoningEnabled', 'openRouterReasoningEffort',
      'smartSupportEnabled', 'smartSupportChannelIds', 'smartMentionOnly',
      'smartCooldownSeconds', 'smartRuleThreshold', 'smartAiThreshold', 'smartAiEnabled',
      'smartKnowledgeEnabled', 'smartKnowledgeAiEnabled', 'smartKnowledgeThreshold',
      'smartKnowledgeMaxResults', 'smartAnswerMaxChars', 'smartEvidenceMinScore', 'smartEvidenceMinTopGap', 'smartKnowledgeFreshnessDays', 'smartEscalationRoleId', 'smartEscalationChannelId',
      'smartRequireCluster', 'smartDefaultClusterKey', 'smartClusterChannelMap',
      'smartConversationEnabled', 'smartConversationTtlMinutes', 'smartMaxContextMessages',
      'smartClarificationEnabled', 'smartClarificationThreshold', 'smartMultiIntentEnabled',
      'smartMaxIntents', 'smartFuzzyMatchingEnabled', 'smartResponseCacheSeconds',
      'smartAiRetryCount', 'smartBurstLimitPerMinute',
      'ticketCompactMode', 'ticketAiEnabled', 'ticketAiMode', 'ticketAiOnlyCreator',
      'ticketAiRequireQuestion', 'ticketAiPauseWhenClaimed', 'ticketAiSensitiveEscalation',
      'ticketAiPanelMode', 'ticketAiAutoSummary', 'ticketAiReplyCooldownSeconds',
      'ticketAiMaxReplies', 'ticketAiMinConfidence', 'ticketAiMaxAnswerChars',
      'ticketAiContextMessages', 'ticketAiTriageEnabled', 'ticketAiTriageMinConfidence',
      'ticketAiAutoPriority', 'ticketAiAutoTags', 'ticketAiAutoEscalateSensitive',
      'ticketRequireCluster', 'ticketClusterSelectEnabled',
      'smartLearnEnabled', 'smartLearnReviewChannelId', 'smartLearnReviewerRoleIds',
      'smartLearnAdminRoleIds', 'smartLearnDeliveryMode', 'smartLearnMaxDmReviewers',
      'smartLearnCandidateConfidence', 'smartLearnDuplicateThreshold',
      'smartLearnStaffVotesRequired', 'smartLearnAdminVotesRequired',
      'smartLearnMaxCandidatesPerHour', 'smartLearnNotifyUser', 'smartLearnCreateFromNegativeVote',
      'smartLearnFromResolvedTickets', 'smartLearnMinLearningScore', 'smartLearnMinSourceDiversity',
      'smartLearnConflictThreshold', 'smartLearnReviewIntervalDays',
    ];
    const updateData = {};
    for (const key of allowed) if (req.body[key] !== undefined) updateData[key] = req.body[key];

    normalizeSmartConfig(updateData);
    await normalizeConfigMedia(updateData, req);

    const config = await prisma.guildConfig.upsert({
      where: { guildId },
      update: updateData,
      create: { guildId, ...DEFAULT_CONFIG, ...updateData },
    });

    // Nếu đổi logChannelId thì clear cache để có hiệu lực ngay
    if (updateData.logChannelId !== undefined) clearLogCache();

    await logAudit({
      action: 'config.update',
      actorId: req.user.discordId,
      actorName: req.user.username,
      metadata: { fields: Object.keys(updateData) },
    });
    emit('config:updated', config);

    const providerStatus = await getAiProviderStatus(config);
    res.json({ success: true, data: { ...config, ...providerStatus } });
  } catch (err) {
    console.error('[UPDATE CONFIG ERROR]', err);
    if (err instanceof ValidationError) return res.status(err.statusCode || 400).json({ success: false, message: err.message, code: err.code });
    res.status(500).json({ success: false, message: 'Lỗi cập nhật cấu hình' });
  }
};
export const publishSetupMessage = async (req, res) => {
  try {
    const guildId = process.env.GUILD_ID;
    
    // Auto-save if config payload was sent with the publish request
    if (req.body && Object.keys(req.body).length > 0) {
      const allowed = [
        'embedChannelId', 'logChannelId', 'staffRoleId',
        'embedTitle', 'embedDesc', 'embedColor', 'embedThumbnail', 'embedImage',
        'embedFooter', 'embedAuthorIcon', 'embedFooterIcon', 'selectPlaceholder',
        'ticketTitle', 'ticketDesc', 'ticketGuidance', 'ticketFooter', 'ticketColor',
        'ticketShowType', 'ticketShowCreator', 'ticketShowTime', 'ticketShowGuide',
        'deleteSetupMessages', 'dmOnTicketCreate', 'dmMessage',
        'aiProvider', 'openRouterModel', 'openRouterAnswerModel', 'openRouterTriageModel',
        'openRouterEmbeddingModel', 'openRouterReasoningEnabled', 'openRouterReasoningEffort',
        'smartSupportEnabled', 'smartSupportChannelIds', 'smartMentionOnly',
        'smartCooldownSeconds', 'smartRuleThreshold', 'smartAiThreshold', 'smartAiEnabled',
      'smartKnowledgeEnabled', 'smartKnowledgeAiEnabled', 'smartKnowledgeThreshold',
      'smartKnowledgeMaxResults', 'smartAnswerMaxChars', 'smartEvidenceMinScore', 'smartEvidenceMinTopGap', 'smartKnowledgeFreshnessDays', 'smartEscalationRoleId', 'smartEscalationChannelId',
      'smartRequireCluster', 'smartDefaultClusterKey', 'smartClusterChannelMap',
      'smartConversationEnabled', 'smartConversationTtlMinutes', 'smartMaxContextMessages',
      'smartClarificationEnabled', 'smartClarificationThreshold', 'smartMultiIntentEnabled',
      'smartMaxIntents', 'smartFuzzyMatchingEnabled', 'smartResponseCacheSeconds',
      'smartAiRetryCount', 'smartBurstLimitPerMinute',
      'ticketCompactMode', 'ticketAiEnabled', 'ticketAiMode', 'ticketAiOnlyCreator',
      'ticketAiRequireQuestion', 'ticketAiPauseWhenClaimed', 'ticketAiSensitiveEscalation',
      'ticketAiPanelMode', 'ticketAiAutoSummary', 'ticketAiReplyCooldownSeconds',
      'ticketAiMaxReplies', 'ticketAiMinConfidence', 'ticketAiMaxAnswerChars',
      'ticketAiContextMessages', 'ticketAiTriageEnabled', 'ticketAiTriageMinConfidence',
      'ticketAiAutoPriority', 'ticketAiAutoTags', 'ticketAiAutoEscalateSensitive',
      'ticketRequireCluster', 'ticketClusterSelectEnabled',
      'smartLearnEnabled', 'smartLearnReviewChannelId', 'smartLearnReviewerRoleIds',
      'smartLearnAdminRoleIds', 'smartLearnDeliveryMode', 'smartLearnMaxDmReviewers',
      'smartLearnCandidateConfidence', 'smartLearnDuplicateThreshold',
      'smartLearnStaffVotesRequired', 'smartLearnAdminVotesRequired',
      'smartLearnMaxCandidatesPerHour', 'smartLearnNotifyUser', 'smartLearnCreateFromNegativeVote',
      'smartLearnFromResolvedTickets', 'smartLearnMinLearningScore', 'smartLearnMinSourceDiversity',
      'smartLearnConflictThreshold', 'smartLearnReviewIntervalDays',
      ];
      const updateData = {};
      for (const key of allowed) if (req.body[key] !== undefined) updateData[key] = req.body[key];
      normalizeSmartConfig(updateData);
      await normalizeConfigMedia(updateData, req);
      
      await prisma.guildConfig.upsert({
        where: { guildId },
        update: updateData,
        create: { guildId, ...DEFAULT_CONFIG, ...updateData },
      });
      if (updateData.logChannelId !== undefined) clearLogCache();
      emit('config:updated', updateData);
    }

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config?.embedChannelId) {
      return res.status(400).json({ success: false, message: 'Chưa cấu hình Embed channel ID' });
    }

    const [options, clusters] = await Promise.all([
      prisma.option.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.cluster.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    if (!options.length) return res.status(400).json({ success: false, message: 'Chưa có option active để tạo select menu' });

    const existing = await getChannelMessages(config.embedChannelId, { limit: 50 });
    const setupMessages = existing.filter((m) =>
      m.author?.bot &&
      m.components?.some((row) => row.components?.some((c) => ['ticket_type_select', 'ticket_cluster_start'].includes(c.custom_id)))
    );

    for (const msg of setupMessages) {
      await deleteChannelMessage(config.embedChannelId, msg.id).catch((err) => {
        console.warn('[DELETE SETUP MESSAGE WARN]', err.message);
      });
    }

    const files = [];
    const configData = { ...config };

    const imageAttachment = extractBase64AttachmentBackend(configData.embedImage, 'setup_image');
    if (imageAttachment) {
      files.push(imageAttachment.file);
      configData.embedImage = imageAttachment.url;
    }
    const thumbnailAttachment = extractBase64AttachmentBackend(configData.embedThumbnail, 'setup_thumbnail');
    if (thumbnailAttachment) {
      files.push(thumbnailAttachment.file);
      configData.embedThumbnail = thumbnailAttachment.url;
    }
    const authorAttachment = extractBase64AttachmentBackend(configData.embedAuthorIcon, 'setup_author');
    if (authorAttachment) {
      files.push(authorAttachment.file);
      configData.embedAuthorIcon = authorAttachment.url;
    }
    const footerAttachment = extractBase64AttachmentBackend(configData.embedFooterIcon, 'setup_footer');
    if (footerAttachment) {
      files.push(footerAttachment.file);
      configData.embedFooterIcon = footerAttachment.url;
    }

    const payload = buildSetupPayload(configData, options, clusters);
    let sent;

    if (files.length) {
      const { sendChannelMessageMultipart } = await import('../../lib/discord.js');
      sent = await sendChannelMessageMultipart(config.embedChannelId, payload, files);
    } else {
      sent = await sendChannelMessage(config.embedChannelId, payload);
    }

    await logAudit({
      action: 'config.setup.publish',
      actorId: req.user.discordId,
      actorName: req.user.username,
      metadata: { channelId: config.embedChannelId, deleted: setupMessages.length, messageId: sent.id },
    });

    res.json({ success: true, data: { messageId: sent.id, deleted: setupMessages.length } });
  } catch (err) {
    console.error('[PUBLISH SETUP ERROR]', err);
    if (err instanceof ValidationError) return res.status(err.statusCode || 400).json({ success: false, message: err.message, code: err.code });
    res.status(502).json({ success: false, message: 'Không thể cập nhật setup embed qua Discord', requestId: req.requestId });
  }
};

export const sendAnnouncement = async (req, res) => {
  try {
    const { imageFile, thumbnailFile, authorIconFile, footerIconFile } = req.body;
    const channelId = cleanDiscordId(req.body?.channelId, 'Channel ID');
    const title = cleanString(req.body?.title, { max: 256 }) || '';
    const description = cleanString(req.body?.description, { max: 4000, trim: false }) || '';
    const mode = ['embed', 'container'].includes(req.body?.mode) ? req.body.mode : 'embed';
    if (!title && !description) throw new ValidationError('Thiếu nội dung thông báo');
    const announcement = { ...req.body, channelId, title, description, mode };
    for (const field of ['image', 'thumbnail', 'authorIcon', 'footerIcon']) {
      if (announcement[field]) announcement[field] = cleanHttpUrl(announcement[field], { nullable: false });
    }

    let payload;
    let sent;
    const files = [];

    const imageAttachment = extractBase64AttachmentBackend(imageFile, 'announcement');
    if (imageAttachment) {
      files.push(imageAttachment.file);
      announcement.image = imageAttachment.url;
    }

    const thumbnailAttachment = extractBase64AttachmentBackend(thumbnailFile, 'announcement_thumb');
    if (thumbnailAttachment) {
      files.push(thumbnailAttachment.file);
      announcement.thumbnail = thumbnailAttachment.url;
    }

    const authorAttachment = extractBase64AttachmentBackend(authorIconFile, 'announcement_author');
    if (authorAttachment) {
      files.push(authorAttachment.file);
      announcement.authorIcon = authorAttachment.url;
    }

    const footerAttachment = extractBase64AttachmentBackend(footerIconFile, 'announcement_footer');
    if (footerAttachment) {
      files.push(footerAttachment.file);
      announcement.footerIcon = footerAttachment.url;
    }

    payload = buildAnnouncementPayload(announcement);

    if (files.length) {
      const { sendChannelMessageMultipart } = await import('../../lib/discord.js');
      sent = await sendChannelMessageMultipart(channelId, payload, files);
    } else {
      sent = await sendChannelMessage(channelId, payload);
    }

    await logAudit({
      action: 'announcement.send',
      actorId: req.user.discordId,
      actorName: req.user.username,
      metadata: { channelId, mode: mode || 'embed', messageId: sent.id },
    });

    res.json({ success: true, data: { messageId: sent.id } });
  } catch (err) {
    console.error('[SEND ANNOUNCEMENT ERROR]', err);
    if (err instanceof ValidationError) return res.status(err.statusCode || 400).json({ success: false, message: err.message, code: err.code });
    res.status(502).json({ success: false, message: 'Không thể gửi thông báo qua Discord', requestId: req.requestId });
  }
};
