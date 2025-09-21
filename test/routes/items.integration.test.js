import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockFetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

const fetch = await import('node-fetch');

describe('GET /items integration test', () => {
  let app;

  beforeEach(() => {
    // Setup test environment variables
    process.env.PORT = '3001';
    process.env.FREEE_COMPANY_ID = '12345';
    process.env.FREEE_ACCESS_TOKEN = 'test-token';

    // Create minimal app for testing
    app = express();
    app.use(express.json());

    app.get('/items', async (_req, res) => {
      try {
        const token = process.env.FREEE_ACCESS_TOKEN;
        const response = await fetch.default(
          `https://api.freee.co.jp/api/1/items?company_id=${process.env.FREEE_COMPANY_ID}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`freee API error: ${response.status} ${body}`);
        }

        const data = await response.json();
        const transformed = (data.items ?? []).map(item => ({
          id: item.id.toString(),
          code: item.code || null,
          name: item.name,
          category: item.shortcut1 || null
        }));
        res.json({ items: transformed });
      } catch (err) {
        res.status(500).json({ error: true, message: err.message });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('品目一覧を正常に取得してOpenAPIスキーマ通りに変換できること', async () => {
    const mockFreeeResponse = {
      items: [
        {
          id: 1001,
          code: 'ITEM001',
          name: 'ソフトウェアライセンス',
          shortcut1: 'ライセンス',
          shortcut2: 'SW',
          available: true
        },
        {
          id: 1002,
          code: null,
          name: 'コンサルティング費用',
          shortcut1: null,
          shortcut2: null,
          available: true
        }
      ]
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockFreeeResponse),
      text: jest.fn().mockResolvedValue(JSON.stringify(mockFreeeResponse))
    });

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
          code: null,
          name: 'コンサルティング費用',
          category: null
        }
      ]
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.freee.co.jp/api/1/items?company_id=12345',
      { headers: { Authorization: 'Bearer test-token' } }
    );
  });

  test('Freee APIがエラーを返した場合、適切なエラーレスポンスを返すこと', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('Unauthorized')
    });

    const response = await request(app)
      .get('/items')
      .expect(500);

    expect(response.body).toEqual({
      error: true,
      message: 'freee API error: 401 Unauthorized'
    });
  });
});