// ========================
// Select Menu Handler
// ========================

import { ActionRowBuilder, EmbedBuilder, MessageFlags, StringSelectMenuBuilder } from 'discord.js';
import { getClusters, getConfig, getOptions } from '../utils/api.js';
import { createTicket } from './ticketManager.js';
import { showFormModal } from './formModalHandler.js';
import { getOptionFormFields, isComplexForm } from '../utils/formFields.js';
import { startFormWizard } from './formWizardHandler.js';
import { clusterColor, mergeClusters } from '../../clusters/clusterCatalog.js';
import logger from '../utils/logger.js';

function scopedClusters(option, clusters) {
  const scope = String(option?.clusterKeys || '*').split(',').map((item) => item.trim()).filter(Boolean);
  if (!scope.length || scope.includes('*')) return clusters;
  return clusters.filter((cluster) => scope.includes(cluster.key));
}

export function optionsForCluster(options, clusterKey) {
  return options.filter((option) => scopedClusters(option, [{ key: clusterKey }]).length > 0);
}

async function continueTicketFlow(interaction, optionData, options, clusterKey = null) {
  const fields = getOptionFormFields(optionData, options);
  const context = { clusterKey };

  if (fields.length > 0) {
    if (isComplexForm(fields)) await startFormWizard(interaction, optionData, fields, context);
    else await showFormModal(interaction, optionData, fields, context);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await createTicket(interaction, 'option', optionData.id, null, context);
  logger.info(`User ${interaction.user.username} tạo ticket: ${optionData.name} (${clusterKey || 'no-cluster'})`);
}

export async function handleTicketTypeSelect(interaction) {
  const selected = interaction.values[0];

  if (!selected.startsWith('option_')) {
    await interaction.reply({ content: '❌ Lựa chọn không hợp lệ.', flags: MessageFlags.Ephemeral });
    return;
  }

  const optionId = selected.replace('option_', '');

  try {
    const [options, configResponse, clusterRows] = await Promise.all([
      getOptions(), getConfig(), getClusters({ active: true }).catch(() => []),
    ]);
    const config = configResponse?.data || configResponse || {};
    const optionData = options.find((o) => String(o.id) === String(optionId));
    if (!optionData) {
      await interaction.reply({ content: '❌ Không tìm thấy loại ticket. Có thể đã bị xóa hoặc tắt.', flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const msg = interaction.message;
      if (msg?.editable) await msg.edit({ components: msg.components }).catch(() => {});
    } catch {}

    const clusters = scopedClusters(optionData, mergeClusters(clusterRows));
    if (clusters.length === 1) {
      await continueTicketFlow(interaction, optionData, options, clusters[0].key);
      return;
    }

    if (config.ticketRequireCluster !== false && config.ticketClusterSelectEnabled !== false && clusters.length > 1) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`ticket_cluster_preselect:${optionId}`)
        .setPlaceholder('🗺️ Chọn cụm đang gặp vấn đề')
        .addOptions(clusters.slice(0, 25).map((cluster) => ({
          label: cluster.name,
          value: cluster.key,
          emoji: cluster.emoji || '🗺️',
          description: String(cluster.description || `Hỗ trợ cụm ${cluster.name}`).slice(0, 100),
        })));
      const embed = new EmbedBuilder()
        .setColor(clusterColor(clusters[0]))
        .setAuthor({ name: 'IS7MC Multi‑Cluster Support' })
        .setTitle('🗺️ Bạn đang cần hỗ trợ ở cụm nào?')
        .setDescription(`Đã chọn loại ticket **${optionData.emoji || '🎫'} ${optionData.name}**. Chọn đúng cụm để bot mở đúng form, category và đội staff.`)
        .setFooter({ text: 'Bước 2/2 • Chọn một cụm' });
      await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
      return;
    }

    await continueTicketFlow(interaction, optionData, options, config.smartDefaultClusterKey || null);
  } catch (error) {
    logger.error('Lỗi tạo ticket:', error.message);
    try {
      const reply = { content: '❌ ' + (error.message || 'Có lỗi. Thử lại sau!'), flags: MessageFlags.Ephemeral };
      if (interaction.deferred) await interaction.editReply(reply);
      else if (!interaction.replied) await interaction.reply(reply);
      else await interaction.followUp(reply);
    } catch {}
  }
}

/** Initial public-panel step: select cluster, then choose a ticket type scoped to it. */
export async function handleTicketClusterStart(interaction) {
  const clusterKey = interaction.values?.[0];
  try {
    const [options, clusterRows] = await Promise.all([getOptions(), getClusters({ active: true }).catch(() => [])]);
    const cluster = mergeClusters(clusterRows).find((item) => item.key === clusterKey);
    if (!cluster) {
      return interaction.reply({ content: '❌ Cụm này không còn hoạt động. Vui lòng chọn lại.', flags: MessageFlags.Ephemeral });
    }

    const eligibleOptions = optionsForCluster(options, cluster.key);
    if (!eligibleOptions.length) {
      return interaction.reply({ content: `❌ Hiện chưa có loại ticket phù hợp cho cụm **${cluster.name}**.`, flags: MessageFlags.Ephemeral });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ticket_type_preselect:${cluster.key}`)
      .setPlaceholder('📋 Chọn vấn đề cần hỗ trợ')
      .addOptions(eligibleOptions.slice(0, 25).map((option) => ({
        label: option.name,
        value: `option_${option.id}`,
        emoji: option.emoji || '🎫',
        description: String(option.description || `Hỗ trợ ${option.name}`).slice(0, 100),
      })));
    const embed = new EmbedBuilder()
      .setColor(clusterColor(cluster))
      .setAuthor({ name: 'IS7MC Multi‑Cluster Support' })
      .setTitle(`🗺️ Cụm đã chọn: ${cluster.name}`)
      .setDescription('Chọn vấn đề bạn cần hỗ trợ. Bot sẽ mở đúng form, category và gửi thông báo tới đội staff tương ứng.')
      .setFooter({ text: 'Bước 2/2 • Chọn vấn đề' });
    await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
  } catch (error) {
    logger.error('Lỗi chọn cụm trước ticket:', error.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Không thể tiếp tục tạo ticket. Vui lòng thử lại.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

export async function handleTicketTypePreselect(interaction) {
  const clusterKey = interaction.customId.split(':')[1];
  const selected = interaction.values?.[0] || '';
  const optionId = selected.replace(/^option_/, '');
  try {
    const [options, clusterRows] = await Promise.all([getOptions(), getClusters({ active: true }).catch(() => [])]);
    const cluster = mergeClusters(clusterRows).find((item) => item.key === clusterKey);
    const option = optionsForCluster(options, clusterKey).find((item) => String(item.id) === String(optionId));
    if (!cluster || !option || !selected.startsWith('option_')) {
      return interaction.reply({ content: '❌ Cụm hoặc loại ticket này không còn hoạt động.', flags: MessageFlags.Ephemeral });
    }
    await continueTicketFlow(interaction, option, options, cluster.key);
  } catch (error) {
    logger.error('Lỗi chọn loại ticket sau cụm:', error.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Không thể tiếp tục tạo ticket. Vui lòng thử lại.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

export async function handleTicketClusterPreselect(interaction) {
  const optionId = interaction.customId.split(':')[1];
  const clusterKey = interaction.values?.[0];
  try {
    const [options, clusterRows] = await Promise.all([getOptions(), getClusters({ active: true }).catch(() => [])]);
    const option = options.find((item) => String(item.id) === String(optionId));
    const cluster = scopedClusters(option, mergeClusters(clusterRows)).find((item) => item.key === clusterKey);
    if (!option || !cluster) {
      return interaction.reply({ content: '❌ Loại ticket hoặc cụm này không còn hoạt động.', flags: MessageFlags.Ephemeral });
    }
    await continueTicketFlow(interaction, option, options, cluster.key);
  } catch (error) {
    logger.error('Lỗi chọn cluster trước ticket:', error.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Không thể tiếp tục tạo ticket. Vui lòng thử lại.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}
