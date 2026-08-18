import { createEmbedding, embeddingHash, embeddingTextForArticle } from './embeddingClient.js';

export async function buildEmbeddingPatch(article, { force = false } = {}) {
  const text = embeddingTextForArticle(article);
  const hash = embeddingHash(text);
  if (!force && article.embedding && article.embeddingHash === hash) return null;
  const result = await createEmbedding(text, { timeoutMs: 12000 });
  if (!result) {
    return {
      embedding: null,
      embeddingModel: null,
      embeddingHash: hash,
      embeddingUpdatedAt: null,
    };
  }
  return {
    embedding: JSON.stringify(result.vector),
    embeddingModel: result.model,
    embeddingHash: hash,
    embeddingUpdatedAt: new Date(),
  };
}
