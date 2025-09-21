import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockAnalyzeEntryRoutes = jest.fn();

jest.unstable_mockModule('../../src/services/entryRoute.js', () => ({
  analyzeEntryRoutes: mockAnalyzeEntryRoutes
}));

describe('GET /entry-route-analysis', () => {
  let app;

  beforeEach(async () => {
    process.env.FREEE_COMPANY_ID = '12345';
    
    app = express();
    app.use(express.json());
    
    const { analyzeEntryRoutes } = await import('../../src/services/entryRoute.js');
    
    app.get('/entry-route-analysis', async (req, res) => {
      try {
        const { start_date, end_date, group_by_account, group_by_partner } = req.query;
        
        if (!start_date || !end_date) {
          return res.status(400).json({
            error: true,
            message: 'start_date and end_date are required'
          });
        }
        
        const params = {
          company_id: process.env.FREEE_COMPANY_ID,
          start_date,
          end_date,
          group_by_account: group_by_account === 'true',
          group_by_partner: group_by_partner === 'true'
        };
        
        const result = await analyzeEntryRoutes(params);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: true, message: err.message });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('計上ルート分析データを正常に取得できること', async () => {
    const mockData = {
      entry_routes: {
        summary: {
          total_count: 5,
          manual_entry_count: 1,
          expense_application_count: 1,
          bank_transfer_count: 1,
          deal_count: 1,
          adjustment_count: 1
        },
        by_route: [
          {
            route_type: 'manual_entry',
            route_name: '手動仕訳',
            count: 1,
            total_amount: 100000,
            percentage: 20,
            journals: []
          }
        ]
      },
      metadata: {
        company_id: '12345',
        period: {
          start: '2024-01-01',
          end: '2024-01-31'
        },
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockAnalyzeEntryRoutes.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/entry-route-analysis')
      .query({
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockAnalyzeEntryRoutes).toHaveBeenCalledWith({
      company_id: '12345',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      group_by_account: false,
      group_by_partner: false
    });
  });

  test('勘定科目別グループ化パラメータが正しく処理されること', async () => {
    const mockData = {
      entry_routes: {
        summary: {
          total_count: 2,
          manual_entry_count: 1,
          expense_application_count: 0,
          bank_transfer_count: 0,
          deal_count: 1,
          adjustment_count: 0
        },
        by_route: [],
        by_account: [
          {
            account_item_id: 200,
            account_item_name: '売上高',
            routes: [
              {
                route_type: 'manual_entry',
                route_name: '手動仕訳',
                count: 1,
                amount: 100000
              }
            ],
            total_amount: 100000
          }
        ]
      },
      metadata: {
        company_id: '12345',
        period: {
          start: '2024-01-01',
          end: '2024-01-31'
        },
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockAnalyzeEntryRoutes.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/entry-route-analysis')
      .query({
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        group_by_account: 'true'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockAnalyzeEntryRoutes).toHaveBeenCalledWith({
      company_id: '12345',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      group_by_account: true,
      group_by_partner: false
    });
  });

  test('取引先別グループ化パラメータが正しく処理されること', async () => {
    const mockData = {
      entry_routes: {
        summary: {
          total_count: 2,
          manual_entry_count: 1,
          expense_application_count: 0,
          bank_transfer_count: 0,
          deal_count: 1,
          adjustment_count: 0
        },
        by_route: [],
        by_partner: [
          {
            partner_id: 1001,
            partner_name: 'A社',
            routes: [
              {
                route_type: 'manual_entry',
                route_name: '手動仕訳',
                count: 1,
                amount: 100000
              }
            ],
            total_amount: 100000
          }
        ]
      },
      metadata: {
        company_id: '12345',
        period: {
          start: '2024-01-01',
          end: '2024-01-31'
        },
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockAnalyzeEntryRoutes.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/entry-route-analysis')
      .query({
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        group_by_partner: 'true'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockAnalyzeEntryRoutes).toHaveBeenCalledWith({
      company_id: '12345',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      group_by_account: false,
      group_by_partner: true
    });
  });

  test('必須パラメータが不足している場合、400エラーを返すこと', async () => {
    const response = await request(app)
      .get('/entry-route-analysis')
      .query({ start_date: '2024-01-01' })
      .expect(400);

    expect(response.body).toEqual({
      error: true,
      message: 'start_date and end_date are required'
    });
    expect(mockAnalyzeEntryRoutes).not.toHaveBeenCalled();
  });

  test('サービスエラーが発生した場合、500エラーを返すこと', async () => {
    mockAnalyzeEntryRoutes.mockRejectedValue(new Error('Freee API error'));

    const response = await request(app)
      .get('/entry-route-analysis')
      .query({
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      })
      .expect(500);

    expect(response.body).toEqual({
      error: true,
      message: 'Freee API error'
    });
  });
});