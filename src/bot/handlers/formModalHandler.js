// ========================
// Form Modal Handler
// Khi user chọn option có formFields → bot hiện modal hỏi info trước khi tạo ticket
// ========================

import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js';
import { createTicket } from './ticketManager.js';
import { getOptions, updateIntentDetection, logActionExecution } from '../utils/api.js';
import { getOptionFormFields } from '../utils/formFields.js';
import logger from '../utils/logger.js';

function safeParseFields(option) {
  try {
    const parsed = JSON.parse(option.formFields || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/** Public destination flow: keep the form short and never request secrets. */
export async function showDestinationTicketFormModal(interaction, option, cluster) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_destination_form:${option.id}:${cluster.key}`)
    .setTitle(`Tạo ${cluster.name}`.slice(0, 45));

  const minecraftName = new TextInputBuilder()
    .setCustomId('minecraft_name')
    .setLabel('Tên ingame của bạn')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setPlaceholder('Ví dụ: Rayjacobs');
  const supportRequest = new TextInputBuilder()
    .setCustomId('support_request')
    .setLabel('Bạn cần hỗ trợ gì?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('Ghi ngắn gọn vấn đề. Không gửi mật khẩu, OTP hoặc thông tin nhạy cảm.');

  modal.addComponents(
    new ActionRowBuilder().addComponents(minecraftName),
    new ActionRowBuilder().addComponents(supportRequest),
  );
  await interaction.showModal(modal);
}

/**
 * Show modal cho option's form fields.
 * Discord modal: max 5 fields, mỗi field là text input.
 * Select/checkbox/number không support trong modal → fallback text input + hint.
 */
export async function showFormModal(interaction, option, resolvedFields = null, context = {}) {
  const fields = (resolvedFields || safeParseFields(option)).slice(0, 5);
  if (fields.length === 0) {
    // Không có form → tạo trực tiếp
    return createTicket(interaction, context.detectionId ? 'smart_assistant' : 'option', option.id, null, { ...context, clusterKey: context.clusterKey || null });
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket_form:${option.id}:${context.detectionId || 'none'}:${context.clusterKey || 'none'}`)
    .setTitle(`🎫 ${option.name}`.slice(0, 45));

  for (const f of fields) {
    const input = new TextInputBuilder()
      .setCustomId(f.id)
      .setLabel((f.label || 'Field').slice(0, 45))
      .setStyle(f.type === 'textarea' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(!!f.required)
      .setMaxLength(f.type === 'textarea' ? 1000 : 200);

    if (f.placeholder) input.setPlaceholder(String(f.placeholder).slice(0, 100));
    if (f.default) input.setValue(String(f.default).slice(0, 200));

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  await interaction.showModal(modal);
}

/**
 * Handle modal submit: validate, build formData, create ticket
 */
export async function handleFormModalSubmit(interaction) {
  const destination = interaction.customId.match(/^ticket_destination_form:([^:]+):([^:]+)$/);
  if (destination) {
    const [, optionId, clusterKey] = destination;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const option = (await getOptions()).find((item) => String(item.id) === String(optionId));
      if (!option) return interaction.editReply({ content: '❌ Loại ticket không còn hoạt động. Vui lòng chọn lại.' });
      const formData = {
        minecraft_name: { label: 'Tên ingame của bạn', value: interaction.fields.getTextInputValue('minecraft_name') || '' },
        support_request: { label: 'Bạn cần hỗ trợ gì?', value: interaction.fields.getTextInputValue('support_request') || '' },
      };
      await createTicket(interaction, 'destination', optionId, formData, { clusterKey });
      logger.info(`User ${interaction.user.username} tạo ticket đích: ${clusterKey}`);
    } catch (error) {
      logger.error('Lỗi form ticket destination:', error.message);
      try { await interaction.editReply({ content: '❌ Lỗi tạo ticket: ' + error.message }); } catch {}
    }
    return;
  }
  const m = interaction.customId.match(/^ticket_form:([^:]+)(?::([^:]+))?(?::([^:]+))?$/);
  if (!m) return;
  const optionId = m[1];
  const detectionId = m[2] && m[2] !== 'none' ? m[2] : null;
  const clusterKey = m[3] && m[3] !== 'none' ? m[3] : null;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const options = await getOptions();
    const option = options.find((o) => String(o.id) === String(optionId));
    if (!option) {
      return interaction.editReply({ content: '❌ Option không tồn tại nữa.' });
    }

    const fields = getOptionFormFields(option, options);
    const formData = {};
    for (const f of fields) {
      const value = interaction.fields.getTextInputValue(f.id) || '';
      formData[f.id] = { label: f.label, value };
    }

    const ticket = await createTicket(interaction, detectionId ? 'smart_assistant' : 'option', optionId, formData, { detectionId, clusterKey });
    if (detectionId) {
      await updateIntentDetection(detectionId, { status: 'ticket_created', optionId });
      await logActionExecution({
        detectionId,
        actionName: 'CREATE_TICKET',
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        status: 'completed',
        input: { optionId, clusterKey, via: 'modal' },
        result: { ticketId: ticket.ticketId, channelId: ticket.channel.id },
      });
    }
    logger.info(`User ${interaction.user.username} tạo ticket form: ${option.name}`);
  } catch (error) {
    logger.error('Lỗi form submit:', error.message);
    try { await interaction.editReply({ content: '❌ Lỗi tạo ticket: ' + error.message }); } catch {}
  }
}
