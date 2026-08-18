// ========================
// Command /setup
// Gửi embed ticket vào channel hiện tại
// Title & description lấy từ API config
// ========================

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { getConfig, getOptions, getClusters, clearConfigCache } from '../utils/api.js';
import { mergeClusters } from '../../clusters/clusterCatalog.js';
import logger from '../utils/logger.js';

function extractBase64Attachment(urlStr, defaultFilename) {
  if (urlStr && urlStr.startsWith('data:image/')) {
    const commaIdx = urlStr.indexOf(',');
    if (commaIdx !== -1) {
      const meta = urlStr.substring(0, commaIdx);
      const base64Data = urlStr.substring(commaIdx + 1);
      
      const mimeMatch = meta.match(/data:image\/([^;]+);base64/);
      if (mimeMatch) {
        const ext = mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const fileName = `${defaultFilename}.${ext}`;
        return {
          file: {
            attachment: buffer,
            name: fileName
          },
          url: `attachment://${fileName}`
        };
      }
    }
  }
  return null;
}

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Thiết lập hệ thống ticket trong channel này')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction) {
  // Kiểm tra quyền Admin hoặc ManageChannels
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) &&
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    await interaction.reply({
      content: '❌ Bạn không có quyền sử dụng lệnh này!',
      ephemeral: true,
    });
    return;
  }

  try {
    // Defer để có thời gian xử lý
    await interaction.deferReply({ ephemeral: true });

    // Luôn clear cache trước khi /setup để lấy config mới nhất từ web
    clearConfigCache();
    const apiConfig = await getConfig().catch(() => null);
    const raw = apiConfig?.data || apiConfig || {};

    // Map đúng tên field
    const config = {
      embedTitle:       raw.embedTitle       || '🎫 Hệ Thống Hỗ Trợ Ticket',
      embedDescription: raw.embedDesc        || raw.embedDescription || 'Chào mừng bạn đến với hệ thống hỗ trợ!',
      embedColor:       raw.embedColor,
      embedThumbnail:   raw.embedThumbnail   || null,
      embedImage:       raw.embedImage       || null,
      embedAuthorIcon:  raw.embedAuthorIcon  || null,
      embedFooterIcon:  raw.embedFooterIcon  || null,
      embedFooter:      raw.embedFooter      || '🎮 Game Server Support System',
      selectPlaceholder: raw.selectPlaceholder || '📋 Chọn loại hỗ trợ...',
    };

    const files = [];
    const imageAttachment = extractBase64Attachment(config.embedImage, 'setup_image');
    if (imageAttachment) {
      files.push(imageAttachment.file);
      config.embedImage = imageAttachment.url;
    }
    const thumbnailAttachment = extractBase64Attachment(config.embedThumbnail, 'setup_thumbnail');
    if (thumbnailAttachment) {
      files.push(thumbnailAttachment.file);
      config.embedThumbnail = thumbnailAttachment.url;
    }
    const authorAttachment = extractBase64Attachment(config.embedAuthorIcon, 'setup_author');
    if (authorAttachment) {
      files.push(authorAttachment.file);
      config.embedAuthorIcon = authorAttachment.url;
    }
    const footerAttachment = extractBase64Attachment(config.embedFooterIcon, 'setup_footer');
    if (footerAttachment) {
      files.push(footerAttachment.file);
      config.embedFooterIcon = footerAttachment.url;
    }

    // Lấy danh sách options
    const [options, clusterRows] = await Promise.all([getOptions(), getClusters({ active: true })]);
    const clusters = mergeClusters(clusterRows).filter((cluster) => cluster.isActive !== false);

    if (!options || options.length === 0) {
      await interaction.editReply({
        content: '❌ Không có options nào được cấu hình. Vui lòng tạo options trong dashboard trước!',
      });
      return;
    }

    if (config.embedColor === 'none') {
      const selectOptions = clusters.map((cluster) => ({
        label: cluster.name,
        description: cluster.description || `Hỗ trợ cụm ${cluster.name}`,
        value: cluster.key,
        ...(cluster.emoji ? { emoji: { name: cluster.emoji } } : { emoji: { name: '🗺️' } }),
      }));

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
        { type: 10, content: `# ${config.embedTitle}` },
        { type: 10, content: config.embedDescription }
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
          custom_id: 'ticket_cluster_start',
          placeholder: '🗺️ Chọn cụm đang gặp vấn đề',
          options: selectOptions.slice(0, 25),
        }],
      });

      await interaction.channel.send({
        flags: 32768,
        components: [{
          type: 17,
          components: containerComponents,
        }],
        files: files.length ? files : undefined
      });
    } else {
      // Tạo embed chính
      const mainEmbed = new EmbedBuilder()
        .setTitle(config.embedTitle)
        .setDescription(config.embedDescription)
        .setTimestamp();

      const cleanColor = config.embedColor && config.embedColor !== 'none'
        ? String(config.embedColor).replace('#', '')
        : '';
      if (/^[0-9a-fA-F]{6}$/.test(cleanColor)) {
        mainEmbed.setColor(parseInt(cleanColor, 16));
      }

      if (config.embedThumbnail) {
        mainEmbed.setThumbnail(config.embedThumbnail);
      }

      if (config.embedImage) {
        mainEmbed.setImage(config.embedImage);
      }

      if (config.embedAuthorIcon) {
        mainEmbed.setAuthor({
          name: config.embedTitle,
          iconURL: config.embedAuthorIcon
        });
      }

      if (config.embedFooter) {
        const footerOptions = { text: config.embedFooter };
        if (config.embedFooterIcon) {
          footerOptions.iconURL = config.embedFooterIcon;
        } else {
          const iconUrl = interaction.guild.iconURL();
          if (iconUrl) footerOptions.iconURL = iconUrl;
        }
        mainEmbed.setFooter(footerOptions);
      }
      const selectOptions = clusters.map((cluster) => ({
        label: cluster.name,
        description: cluster.description || `Hỗ trợ cụm ${cluster.name}`,
        value: cluster.key,
        emoji: cluster.emoji || '🗺️',
      }));

      const ticketSelect = new StringSelectMenuBuilder()
        .setCustomId('ticket_cluster_start')
        .setPlaceholder('🗺️ Chọn cụm đang gặp vấn đề')
        .addOptions(selectOptions.slice(0, 25)); // Discord limit 25 options

      const row = new ActionRowBuilder().addComponents(ticketSelect);

      // Gửi embed vào channel
      await interaction.channel.send({
        embeds: [mainEmbed],
        components: [row],
        files: files.length ? files : undefined
      });
    }

    // Báo thành công
    await interaction.editReply({
      content: `✅ Hệ thống ticket đã được thiết lập thành công trong ${interaction.channel}!`,
    });

    logger.success(
      `Setup ticket system trong #${interaction.channel.name} (${interaction.guild.name}) bởi ${interaction.user.username}`
    );
  } catch (error) {
    logger.error('Lỗi khi setup ticket system:', error.message);

    try {
      await interaction.editReply({
        content: '❌ Có lỗi xảy ra khi thiết lập hệ thống ticket. Vui lòng thử lại!',
      });
    } catch (_) {
      // Ignore nếu không thể reply
    }
  }
}
