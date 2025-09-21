import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockGetItems = jest.fn();
jest.unstable_mockModule('../../src/services/freeeClient.js', () => ({
  getItems: mockGetItems
}));

const { getItems } = await import('../../src/services/freeeClient.js');

describe('GET /items', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    app.get('/items', async (_req, res) => {
      try {
        const mockData = await getItems();
        const transformed = mockData.items.map(item => ({
          id: item.id.toString(),
          code: item.code || null,
          name: item.name,
          category: item.shortcut1 || null
        }));
        
        res.json({
          items: transformed
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('正常系', () => {
    test('品目マスタの一覧を取得できること', async () => {
      const mockFreeeResponse = {
        items: [
          {
            id: 1001,
            code: 'ITEM001',
            name: 'ソフトウェアライセンス',
            shortcut1: 'ライセンス',
            shortcut2: 'SW'
          },
          {
            id: 1002,
            code: 'ITEM002',
            name: 'コンサルティング費用',
            shortcut1: 'コンサル',
            shortcut2: null
          }
        ]
      };

      mockGetItems.mockResolvedValue(mockFreeeResponse);

      const response = await request(app)
        .get('/items')
        .expect(200);

      expect(response.body).toEqual({
        items: [
          {
            id: '1001',
            code: 'ITEM001',
            name: 'ソフトウェアライセンス',
            category: 'ライセンス'
          },
          {
            id: '1002',
            code: 'ITEM002',
            name: 'コンサルティング費用',
            category: 'コンサル'
          }
        ]
      });

      expect(mockGetItems).toHaveBeenCalledTimes(1);
    });

    test('品目がない場合は空配列を返すこと', async () => {
      const mockFreeeResponse = {
        items: []
      };

      mockGetItems.mockResolvedValue(mockFreeeResponse);

      const response = await request(app)
        .get('/items')
        .expect(200);

      expect(response.body).toEqual({
        items: []
      });
    });

    test('codeやcategoryがnullの品目も正しく処理されること', async () => {
      const mockFreeeResponse = {
        items: [
          {
            id: 1003,
            code: null,
            name: 'その他費用',
            shortcut1: null,
            shortcut2: null
          }
        ]
      };

      mockGetItems.mockResolvedValue(mockFreeeResponse);

      const response = await request(app)
        .get('/items')
        .expect(200);

      expect(response.body).toEqual({
        items: [
          {
            id: '1003',
            code: null,
            name: 'その他費用',
            category: null
          }
        ]
      });
    });
  });

  describe('異常系', () => {
    test('Freee APIがエラーを返す場合、500エラーを返すこと', async () => {
      mockGetItems.mockRejectedValue(new Error('Freee API error: 401 Unauthorized'));

      const response = await request(app)
        .get('/items')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Freee API error: 401 Unauthorized'
      });
    });

    test('ネットワークエラーの場合も適切にハンドリングされること', async () => {
      mockGetItems.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .get('/items')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Network error'
      });
    });
  });
});