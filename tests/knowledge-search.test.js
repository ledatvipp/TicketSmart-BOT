import test from 'node:test';
import assert from 'node:assert/strict';
import { rankKnowledgeArticles } from '../src/intelligence/knowledgeSearch.js';

const articles = [
  {
    id: 'item-loss', enabled: true, title: 'Quy định hoàn vật phẩm',
    summary: 'Mất đồ do lag hoặc rollback', keywords: 'mất đồ,lag,rollback,inventory',
    category: 'support', content: 'Tạo ticket và cung cấp thời gian cùng danh sách vật phẩm.',
  },
  {
    id: 'staff', enabled: true, title: 'Ứng tuyển Staff',
    summary: 'Đơn xin làm helper', keywords: 'staff,helper,ứng tuyển',
    category: 'recruitment', content: 'Cung cấp kinh nghiệm và thời gian online.',
  },
];

test('knowledge search ưu tiên bài mất đồ khi người dùng nói tự nhiên', () => {
  const result = rankKnowledgeArticles('Tôi chết lúc server lag và bay hết inventory', articles, { threshold: 0.05 });
  assert.equal(result[0].id, 'item-loss');
  assert.ok(result[0].score > 0.1);
});

test('knowledge search lọc kết quả dưới threshold', () => {
  const result = rankKnowledgeArticles('công thức nấu ăn', articles, { threshold: 0.5 });
  assert.equal(result.length, 0);
});
