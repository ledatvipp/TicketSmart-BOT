// ========================
// Event: interactionCreate
// Route tất cả interaction về đúng handler
// ========================

import { handleTicketTypeSelect, handleTicketClusterPreselect, handleTicketClusterStart, handleTicketTypePreselect } from '../handlers/selectMenuHandler.js';
import { handleClaimButton, handleCloseButton, handleCloseTypeSelect, handleCloseModalSubmit } from '../handlers/buttonHandler.js';
import { handleFormModalSubmit } from '../handlers/formModalHandler.js';
import { handleRatingButton } from '../handlers/ratingHandler.js';
import {
  handleWizardModalSubmit,
  handleWizardSelect,
  handleWizardFillTextButton,
  handleWizardSubmit,
  handleWizardCancel
} from '../handlers/formWizardHandler.js';
import * as historyCmd from '../commands/history.js';
import * as setupCommand from '../commands/setup.js';
import logger from '../utils/logger.js';
import { handleSmartButton } from '../handlers/smartButtonHandler.js';
import {
  handleTicketQuickActionSelect,
  handleTicketClusterSelect,
  handleTicketQuickButton,
  handleTicketStaffActionSelect,
  handleTicketAiButton,
  handleTicketAiQuestionModal,
  handleTicketAddDetailsModal,
  handleTicketMoveButton,
  handleTicketMovePage,
  handleTicketMoveSelect,
} from '../handlers/ticketInteractionHandler.js';
import { handleSmartLearnButton, handleSmartLearnModal } from '../handlers/smartLearnHandler.js';

export const name = 'interactionCreate';
export const once = false; // Chạy mỗi khi có interaction

export async function execute(interaction) {
  try {
    // ---- Autocomplete ----
    if (interaction.isAutocomplete()) {
      const cmd = interaction.client.commands?.get(interaction.commandName);
      if (cmd?.autocomplete) await cmd.autocomplete(interaction);
      return;
    }

    // ---- Slash Commands ----
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
      return;
    }

    // ---- Select Menus ----
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return;
    }

    // ---- Buttons ----
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    // ---- Modal submit ----
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('ticket_form:') || interaction.customId.startsWith('ticket_destination_form:')) {
        await handleFormModalSubmit(interaction);
      } else if (interaction.customId.startsWith('ticket_close_modal:')) {
        await handleCloseModalSubmit(interaction);
      } else if (interaction.customId === 'wizard_modal_text') {
        await handleWizardModalSubmit(interaction);
      } else if (interaction.customId.startsWith('ticket_ai_question:')) {
        await handleTicketAiQuestionModal(interaction);
      } else if (interaction.customId.startsWith('ticket_add_details:')) {
        await handleTicketAddDetailsModal(interaction);
      } else if (interaction.customId.startsWith('smartlearn_reject:') || interaction.customId.startsWith('smartlearn_alternative:')) {
        await handleSmartLearnModal(interaction);
      }
      return;
    }
  } catch (error) {
    logger.error(`Lỗi xử lý interaction [${interaction.customId || interaction.commandName}]:`, error.message);

    // Cố gắng reply lỗi cho user
    try {
      const errorMsg = { content: '❌ Có lỗi xảy ra. Vui lòng thử lại sau!', ephemeral: true };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMsg);
      } else {
        await interaction.reply(errorMsg);
      }
    } catch (_) {
      // Bỏ qua nếu không thể reply
    }
  }
}

/**
 * Xử lý slash commands
 */
async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  logger.info(`Slash command: /${commandName} bởi ${interaction.user.username}`);

  // Tìm command trong client.commands collection
  const command = interaction.client.commands?.get(commandName);

  if (command) {
    await command.execute(interaction);
    return;
  }

  // Fallback: xử lý trực tiếp các command đã biết
  switch (commandName) {
    case 'setup':
      await setupCommand.execute(interaction);
      break;

    default:
      logger.warn(`Unknown command: /${commandName}`);
      await interaction.reply({
        content: '❌ Lệnh không tồn tại!',
        ephemeral: true,
      });
  }
}

/**
 * Xử lý select menus
 */
async function handleSelectMenu(interaction) {
  const { customId } = interaction;

  logger.info(`Select menu: ${customId} bởi ${interaction.user.username}`);

  switch (true) {
    case customId === 'ticket_type_select':
      await handleTicketTypeSelect(interaction);
      break;
    case customId === 'ticket_cluster_start':
      await handleTicketClusterStart(interaction);
      break;
    case customId.startsWith('wizard_select:'):
      await handleWizardSelect(interaction);
      break;
    case customId.startsWith('history_select:'):
      await historyCmd.handleSelect(interaction);
      break;
    case customId === 'ticket_close_type':
      await handleCloseTypeSelect(interaction);
      break;
    case customId === 'ticket_quick_actions':
      await handleTicketQuickActionSelect(interaction);
      break;
    case customId === 'ticket_staff_actions':
      await handleTicketStaffActionSelect(interaction, handleClaimButton);
      break;
    case customId === 'ticket_cluster_select':
      await handleTicketClusterSelect(interaction);
      break;
    case customId.startsWith('ticket_move_select:'):
      await handleTicketMoveSelect(interaction);
      break;
    case customId.startsWith('ticket_cluster_preselect:'):
      await handleTicketClusterPreselect(interaction);
      break;
    case customId.startsWith('ticket_type_preselect:'):
      await handleTicketTypePreselect(interaction);
      break;
    default:
      logger.warn(`Unknown select menu: ${customId}`);
  }
}

/**
 * Xử lý buttons
 */
async function handleButton(interaction) {
  const { customId } = interaction;

  logger.info(`Button: ${customId} bởi ${interaction.user.username}`);

  switch (customId) {
    // Button Claim ticket
    case 'ticket_claim':
      await handleClaimButton(interaction);
      break;

    // Button Close ticket
    case 'ticket_close':
      await handleCloseButton(interaction);
      break;

    case 'ticket_move':
      await handleTicketMoveButton(interaction);
      break;

    case 'ticket_quick_ai':
    case 'ticket_quick_details':
    case 'ticket_quick_status':
    case 'ticket_quick_human':
    case 'ticket_quick_close':
      await handleTicketQuickButton(interaction);
      break;

    case 'wizard_fill_text':
      await handleWizardFillTextButton(interaction);
      break;
    case 'wizard_submit':
      await handleWizardSubmit(interaction);
      break;
    case 'wizard_cancel':
      await handleWizardCancel(interaction);
      break;

    default:
      if (customId.startsWith('ticket_move_page:')) {
        await handleTicketMovePage(interaction);
        return;
      }
      if (customId.startsWith('smartlearn:')) {
        await handleSmartLearnButton(interaction);
        return;
      }
      if (customId.startsWith('ticket_ai_')) {
        await handleTicketAiButton(interaction);
        return;
      }
      if (customId.startsWith('smart:')) {
        await handleSmartButton(interaction);
        return;
      }
      // Rating buttons: rate:<ticketId>:<score>
      if (customId.startsWith('rate:')) {
        await handleRatingButton(interaction);
        return;
      }
      // History buttons: history_send:<id>, history_dm:<id>, history_back:<userId>
      if (customId.startsWith('history_')) {
        await historyCmd.handleButton(interaction);
        return;
      }
      logger.warn(`Unknown button: ${customId}`);
  }
}
