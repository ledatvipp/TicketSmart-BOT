// ========================
// Form Fields Helper Utilities
// ========================

/**
 * Resolves the form fields of an option recursively by following the inheritance chain.
 */
export function getOptionFormFields(option, allOptions) {
  if (!option) return [];
  if (option.inheritFormFromId) {
    const parent = allOptions.find((o) => String(o.id) === String(option.inheritFormFromId));
    if (parent) {
      return getOptionFormFields(parent, allOptions);
    }
  }
  try {
    const parsed = JSON.parse(option.formFields || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Checks if a form is complex (requires ephemeral message wizard instead of a single modal).
 */
export function isComplexForm(fields) {
  if (!Array.isArray(fields)) return false;
  if (fields.length > 5) return true;
  for (const f of fields) {
    if (f.type === 'select' || f.type === 'checkbox') return true;
    // Check if any option in a select field contains nested sub-fields
    if (f.options && f.options.some((o) => Array.isArray(o.fields) && o.fields.length > 0)) {
      return true;
    }
  }
  return false;
}
