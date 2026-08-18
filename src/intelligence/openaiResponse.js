export function extractResponseText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (Array.isArray(payload.output) ? payload.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((content) => content?.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('')
    .trim();
}
