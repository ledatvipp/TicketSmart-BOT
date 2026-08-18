import test from 'node:test';
import assert from 'node:assert/strict';
import { optionsForCluster } from '../src/bot/handlers/selectMenuHandler.js';
import { canReceiveTicketChannelAccess } from '../src/bot/handlers/ticketManager.js';

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
