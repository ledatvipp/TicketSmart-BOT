export function parseCsvIds(value) {
  return (Array.isArray(value) ? value : String(value || '').split(','))
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

export function staffCanAccessMoveOption(staff, optionId) {
  if (staff?.allOptions === true) return true;
  const allowed = Array.isArray(staff?.allowedOptions)
    ? staff.allowedOptions.map(String)
    : parseCsvIds(staff?.allowedOptions);
  return allowed.length === 0 || allowed.includes(String(optionId));
}

export function optionSupportsMoveCluster(option, clusterKey) {
  if (!clusterKey) return true;
  const scopes = parseCsvIds(option?.clusterKeys || '*');
  return scopes.length === 0 || scopes.includes('*') || scopes.includes(String(clusterKey));
}

export function eligibleMoveTargets(options = [], currentOptionId = null, clusterKey = null) {
  return (Array.isArray(options) ? options : [])
    .filter((option) => option?.isActive !== false)
    .filter((option) => String(option.id) !== String(currentOptionId))
    .filter((option) => optionSupportsMoveCluster(option, clusterKey))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
}

export function summarizeTicketMoves(moves = []) {
  const rows = Array.isArray(moves) ? moves : [];
  const byDestination = new Map();
  const transitions = new Map();
  const movers = new Map();
  const sources = new Map();
  const uniqueTickets = new Set();
  const ticketMoveCounts = new Map();

  for (const move of rows) {
    uniqueTickets.add(move.ticketId);
    ticketMoveCounts.set(move.ticketId, (ticketMoveCounts.get(move.ticketId) || 0) + 1);
    const destKey = move.toOptionId || 'unknown';
    const dest = byDestination.get(destKey) || { optionId: move.toOptionId, optionName: move.toOptionName || 'Unknown', count: 0 };
    dest.count += 1;
    byDestination.set(destKey, dest);

    const transitionKey = `${move.fromOptionId || 'none'}>${move.toOptionId || 'unknown'}`;
    const transition = transitions.get(transitionKey) || {
      fromOptionId: move.fromOptionId || null,
      fromOptionName: move.fromOptionName || 'Không rõ',
      toOptionId: move.toOptionId,
      toOptionName: move.toOptionName || 'Unknown',
      count: 0,
    };
    transition.count += 1;
    transitions.set(transitionKey, transition);

    const moverKey = move.movedById || 'unknown';
    const mover = movers.get(moverKey) || { discordId: move.movedById || null, username: move.movedByName || 'Unknown', count: 0 };
    mover.count += 1;
    mover.username = move.movedByName || mover.username;
    movers.set(moverKey, mover);

    const source = move.source || 'api';
    sources.set(source, (sources.get(source) || 0) + 1);
  }

  const sortCount = (a, b) => b.count - a.count || String(a.optionName || a.toOptionName || a.username || '').localeCompare(String(b.optionName || b.toOptionName || b.username || ''), 'vi');
  const counts = [...ticketMoveCounts.values()];
  return {
    totalMoves: rows.length,
    movedTickets: uniqueTickets.size,
    repeatedMoveTickets: counts.filter((count) => count > 1).length,
    maxMovesOnSingleTicket: counts.length ? Math.max(...counts) : 0,
    averageMovesPerMovedTicket: uniqueTickets.size ? Math.round((rows.length / uniqueTickets.size) * 100) / 100 : 0,
    byDestination: [...byDestination.values()].sort(sortCount),
    topTransitions: [...transitions.values()].sort(sortCount),
    topMovers: [...movers.values()].sort(sortCount),
    bySource: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
  };
}
