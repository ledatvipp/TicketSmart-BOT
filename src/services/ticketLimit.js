export const MAX_OPEN_TICKETS_PER_USER = 2;

/** Per-option caps may be stricter, but no route may exceed the public limit. */
export function getOpenTicketLimit(optionMax) {
  const requested = Math.max(0, Number(optionMax || 0));
  return requested > 0 ? Math.min(MAX_OPEN_TICKETS_PER_USER, requested) : MAX_OPEN_TICKETS_PER_USER;
}
