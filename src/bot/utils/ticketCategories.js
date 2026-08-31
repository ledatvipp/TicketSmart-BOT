/** Category IDs explicitly configured by admins must never be auto-deleted. */
export function configuredTicketCategoryIds({ options = [], clusters = [] } = {}) {
  return new Set([
    ...options.map((item) => item?.discordCategoryId),
    ...clusters.map((item) => item?.discordCategoryId),
  ].filter(Boolean).map(String));
}

export function isConfiguredTicketCategory(categoryId, data) {
  return Boolean(categoryId) && configuredTicketCategoryIds(data).has(String(categoryId));
}
