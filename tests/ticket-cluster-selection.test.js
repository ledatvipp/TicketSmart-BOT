import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultOptionForCluster, optionsForCluster } from '../src/bot/handlers/selectMenuHandler.js';
import { showDestinationTicketFormModal } from '../src/bot/handlers/formModalHandler.js';
import { canReceiveTicketChannelAccess } from '../src/bot/handlers/ticketManager.js';
import { configuredTicketCategoryIds, isConfiguredTicketCategory } from '../src/bot/utils/ticketCategories.js';
import { getOpenTicketLimit, MAX_OPEN_TICKETS_PER_USER } from '../src/services/ticketLimit.js';

test('ticket type menu only offers options available for the selected cluster', () => {
  const options = [
    { id: 'all', clusterKeys: '*', isActive: true },
    { id: 'sky', clusterKeys: 'skyblock, boxpvp', isActive: true },
    { id: 'survival', clusterKeys: 'survival', isActive: true },
  ];

  assert.deepEqual(optionsForCluster(options, 'skyblock').map((option) => option.id), ['all', 'sky']);
  assert.deepEqual(optionsForCluster(options, 'survival').map((option) => option.id), ['all', 'survival']);
});

test('only Discord user IDs can become ticket-channel permission overwrites', () => {
  assert.equal(canReceiveTicketChannelAccess({ discordId: '123456789012345678', allowedOptions: '' }, 'option-1'), true);
  assert.equal(canReceiveTicketChannelAccess({ discordId: 'local:null2', allowedOptions: '' }, 'option-1'), false);
  assert.equal(canReceiveTicketChannelAccess({ discordId: '123456789012345678', allowedOptions: 'other-option' }, 'option-1'), false);
});

test('destination only resolves its configured active in-scope default ticket option', () => {
  const cluster = { key: 'ung-ho', defaultOptionId: 'payment' };
  const options = [
    { id: 'general', clusterKeys: '*', isActive: true },
    { id: 'payment', clusterKeys: 'ung-ho', isActive: true },
    { id: 'inactive', clusterKeys: 'ung-ho', isActive: false },
  ];
  assert.equal(defaultOptionForCluster(cluster, options)?.id, 'payment');
  assert.equal(defaultOptionForCluster({ ...cluster, defaultOptionId: 'general' }, options)?.id, 'general');
  assert.equal(defaultOptionForCluster({ ...cluster, defaultOptionId: 'inactive' }, options)?.id, 'general');
  assert.equal(defaultOptionForCluster({ key: 'ung-ho' }, options)?.id, 'general');
  assert.equal(defaultOptionForCluster({ key: 'empty' }, []), null);
});

test('configured category ownership includes ticket options and service destinations', () => {
  const data = {
    options: [{ discordCategoryId: 'option-category' }],
    clusters: [{ discordCategoryId: 'support-category' }, { discordCategoryId: null }],
  };
  assert.deepEqual([...configuredTicketCategoryIds(data)].sort(), ['option-category', 'support-category']);
  assert.equal(isConfiguredTicketCategory('support-category', data), true);
  assert.equal(isConfiguredTicketCategory('generated-category', data), false);
});

test('a ticket creator can never exceed two concurrent tickets', () => {
  assert.equal(MAX_OPEN_TICKETS_PER_USER, 2);
  assert.equal(getOpenTicketLimit(0), 2);
  assert.equal(getOpenTicketLimit(1), 1);
  assert.equal(getOpenTicketLimit(2), 2);
  assert.equal(getOpenTicketLimit(99), 2);
});

test('destination selection opens the native two-field IGN and support-request modal', async () => {
  let modal = null;
  await showDestinationTicketFormModal({ showModal: async (value) => { modal = value; } }, { id: 'option-1' }, { key: 'ung-ho', name: 'Ủng hộ' });
  const payload = modal.toJSON();
  assert.equal(payload.custom_id, 'ticket_destination_form:option-1:ung-ho');
  assert.equal(payload.components.length, 2);
  assert.deepEqual(payload.components.map((row) => row.components[0].custom_id), ['minecraft_name', 'support_request']);
  assert.equal(payload.components[1].components[0].style, 2);
});
