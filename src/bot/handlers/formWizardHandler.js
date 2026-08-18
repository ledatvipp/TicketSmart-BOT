// ========================
// Form Wizard Handler
// Hỗ trợ form nhiều hơn 5 trường bằng cách chia modal thành nhiều trang.
// ========================

import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  MessageFlags,
} from 'discord.js';
import { createTicket } from './ticketManager.js';
import { updateIntentDetection, logActionExecution } from '../utils/api.js';
import logger from '../utils/logger.js';

const wizardSessions = new Map();
const TEXT_PAGE_SIZE = 5;
const TEXT_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'url']);

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [userId, session] of wizardSessions.entries()) {
    if (now - session.lastActive > 15 * 60 * 1000) wizardSessions.delete(userId);
  }
}

function optionValue(option) {
  return String(typeof option === 'object' && option !== null ? option.value ?? option.label ?? '' : option);
}

function optionLabel(option) {
  return String(typeof option === 'object' && option !== null ? option.label ?? option.value ?? '' : option);
}

function findSelectedOption(field, value) {
  return (Array.isArray(field.options) ? field.options : [])
    .find((option) => optionValue(option) === String(value));
}

function collectActiveFields(session) {
  const activeFields = [];
  const visit = (fieldList) => {
    for (const field of Array.isArray(fieldList) ? fieldList : []) {
      activeFields.push(field);
      if (field.type === 'select' && session.answers[field.id] !== undefined) {
        const selected = findSelectedOption(field, session.answers[field.id]);
        if (selected && typeof selected === 'object' && Array.isArray(selected.fields)) {
          visit(selected.fields);
        }
      }
    }
  };
  visit(session.fields);
  return activeFields;
}

function getTextPage(session, activeFields) {
  const textFields = activeFields.filter((field) => TEXT_FIELD_TYPES.has(field.type));
  const pageCount = Math.max(1, Math.ceil(textFields.length / TEXT_PAGE_SIZE));
  session.textPage = Math.min(Math.max(0, Number(session.textPage) || 0), pageCount - 1);
  const start = session.textPage * TEXT_PAGE_SIZE;
  return {
    textFields,
    pageFields: textFields.slice(start, start + TEXT_PAGE_SIZE),
    pageCount,
  };
}

export async function startFormWizard(interaction, option, fields, context = {}) {
  const userId = interaction.user.id;
  wizardSessions.set(userId, {
    optionId: option.id,
    optionName: option.name,
    fields,
    answers: {},
    textPage: 0,
    detectionId: context.detectionId || null,
    source: context.source || 'option',
    clusterKey: context.clusterKey || null,
    lastActive: Date.now(),
  });

  await interaction.reply(buildWizardMessage(userId, option.name));
}

export function buildWizardMessage(userId, optionName) {
  cleanExpiredSessions();
  const session = wizardSessions.get(userId);
  if (!session) {
    return {
      content: '❌ Phiên làm việc đã hết hạn. Vui lòng chọn lại loại hỗ trợ ở menu chính.',
      components: [],
      embeds: [],
      flags: MessageFlags.Ephemeral,
    };
  }
  session.lastActive = Date.now();

  const activeFields = collectActiveFields(session);
  let content = `📋 **Cung cấp thông tin hỗ trợ cho: ${optionName}**\n\n`;
  let allRequiredFilled = true;

  for (const field of activeFields) {
    const value = session.answers[field.id];
    const label = field.label || 'Trường';

    if (value !== undefined && value !== '') {
      const selected = field.type === 'select' ? findSelectedOption(field, value) : null;
      const displayValue = selected ? optionLabel(selected) : value;
      content += `✅ **${label}**: \`${String(displayValue).slice(0, 180)}\`\n`;
    } else if (field.required) {
      content += `❌ **${label}**: *(Trống)* — **Bắt buộc**\n`;
      allRequiredFilled = false;
    } else {
      content += `⚪ **${label}**: *(Trống)* — *Tùy chọn*\n`;
    }
  }

  const rows = [];
  const { textFields, pageCount } = getTextPage(session, activeFields);
  if (textFields.length > 0) {
    const pageText = pageCount > 1 ? ` (${session.textPage + 1}/${pageCount})` : '';
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('wizard_fill_text')
        .setLabel(`📝 Nhập thông tin${pageText}`)
        .setStyle(ButtonStyle.Primary)
    ));
  }

  const selectFields = activeFields.filter((field) => field.type === 'select').slice(0, 3);
  for (const field of selectFields) {
    const options = (Array.isArray(field.options) ? field.options : [])
      .map((option) => ({
        label: optionLabel(option).slice(0, 100),
        value: optionValue(option).slice(0, 100),
        default: String(session.answers[field.id] ?? '') === optionValue(option),
      }))
      .filter((option) => option.label && option.value)
      .slice(0, 25);

    if (!options.length) continue;
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`wizard_select:${field.id}`)
        .setPlaceholder(`Chọn ${field.label || 'mục'}...`.slice(0, 150))
        .addOptions(options)
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('wizard_submit')
      .setLabel('🎫 Tạo Ticket')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!allRequiredFilled),
    new ButtonBuilder()
      .setCustomId('wizard_cancel')
      .setLabel('Hủy')
      .setStyle(ButtonStyle.Danger)
  ));

  return { content: content.slice(0, 2000), components: rows, embeds: [], flags: MessageFlags.Ephemeral };
}

export async function handleWizardFillTextButton(interaction) {
  const session = wizardSessions.get(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: '❌ Phiên làm việc đã hết hạn.', flags: MessageFlags.Ephemeral });
  }
  session.lastActive = Date.now();

  const activeFields = collectActiveFields(session);
  const { pageFields, pageCount } = getTextPage(session, activeFields);
  if (!pageFields.length) {
    return interaction.reply({ content: 'Không có trường nhập văn bản nào cần điền.', flags: MessageFlags.Ephemeral });
  }

  const modal = new ModalBuilder()
    .setCustomId('wizard_modal_text')
    .setTitle(`📝 Nhập thông tin${pageCount > 1 ? ` ${session.textPage + 1}/${pageCount}` : ''}`.slice(0, 45));

  for (const field of pageFields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel((field.label || 'Trường').slice(0, 45))
      .setStyle(field.type === 'textarea' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(Boolean(field.required))
      .setMaxLength(field.type === 'textarea' ? 1000 : 200);

    if (field.placeholder) input.setPlaceholder(String(field.placeholder).slice(0, 100));
    if (session.answers[field.id] !== undefined && session.answers[field.id] !== '') {
      input.setValue(String(session.answers[field.id]).slice(0, field.type === 'textarea' ? 1000 : 200));
    }
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  await interaction.showModal(modal);
}

export async function handleWizardModalSubmit(interaction) {
  const session = wizardSessions.get(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: '❌ Phiên làm việc đã hết hạn.', flags: MessageFlags.Ephemeral });
  }
  session.lastActive = Date.now();

  for (const row of interaction.components) {
    for (const input of row.components) session.answers[input.customId] = input.value;
  }

  const activeFields = collectActiveFields(session);
  const { pageCount } = getTextPage(session, activeFields);
  if (pageCount > 1) session.textPage = (session.textPage + 1) % pageCount;

  await interaction.update(buildWizardMessage(interaction.user.id, session.optionName));
}

export async function handleWizardSelect(interaction) {
  const session = wizardSessions.get(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: '❌ Phiên làm việc đã hết hạn.', flags: MessageFlags.Ephemeral });
  }
  session.lastActive = Date.now();

  const fieldId = interaction.customId.split(':')[1];
  const selectedValue = interaction.values[0];
  const activeFields = collectActiveFields(session);
  const field = activeFields.find((item) => item.id === fieldId);

  if (field) {
    const clearNestedAnswers = (parentField) => {
      for (const option of Array.isArray(parentField.options) ? parentField.options : []) {
        if (typeof option !== 'object' || !Array.isArray(option.fields)) continue;
        for (const child of option.fields) {
          delete session.answers[child.id];
          if (child.type === 'select') clearNestedAnswers(child);
        }
      }
    };
    clearNestedAnswers(field);
  }

  session.answers[fieldId] = selectedValue;
  session.textPage = 0;
  await interaction.update(buildWizardMessage(interaction.user.id, session.optionName));
}

export async function handleWizardSubmit(interaction) {
  const session = wizardSessions.get(interaction.user.id);
  if (!session) {
    return interaction.reply({ content: '❌ Phiên làm việc đã hết hạn.', flags: MessageFlags.Ephemeral });
  }
  session.lastActive = Date.now();

  const activeFields = collectActiveFields(session);
  for (const field of activeFields) {
    if (field.required && (session.answers[field.id] === undefined || session.answers[field.id] === '')) {
      return interaction.reply({
        content: `❌ Trường **${field.label}** là bắt buộc nhưng chưa điền.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  await interaction.deferUpdate();
  const formData = {};
  for (const field of activeFields) {
    const value = session.answers[field.id] || '';
    const selected = field.type === 'select' ? findSelectedOption(field, value) : null;
    formData[field.id] = {
      label: field.label,
      value: selected ? optionLabel(selected) : value,
    };
  }

  try {
    const ticket = await createTicket(interaction, session.detectionId ? 'smart_assistant' : 'option', session.optionId, formData, { detectionId: session.detectionId, clusterKey: session.clusterKey });
    if (session.detectionId) {
      await updateIntentDetection(session.detectionId, { status: 'ticket_created', optionId: session.optionId });
      await logActionExecution({
        detectionId: session.detectionId,
        actionName: 'CREATE_TICKET',
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        status: 'completed',
        input: { optionId: session.optionId, clusterKey: session.clusterKey, via: 'wizard' },
        result: { ticketId: ticket.ticketId, channelId: ticket.channel.id },
      });
    }
    wizardSessions.delete(interaction.user.id);
  } catch (error) {
    logger.error('Lỗi tạo ticket từ wizard:', error.message);
    await interaction.followUp({
      content: '❌ Có lỗi xảy ra trong quá trình tạo ticket. Vui lòng thử lại!',
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleWizardCancel(interaction) {
  wizardSessions.delete(interaction.user.id);
  await interaction.update({ content: '❌ Đã hủy tạo ticket.', components: [], embeds: [] });
}
