import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockGetMonthlyTrends = jest.fn();

jest.unstable_mockModule('../../src/services/aggregation.js', () => ({
  getMonthlyTrends: mockGetMonthlyTrends
}));

describe('GET /monthly-trends', () => {
  let app;

  beforeEach(async () => {
    process.env.FREEE_COMPANY_ID = '12345';
    
    app = express();
    app.use(express.json());
    
    const { getMonthlyTrends } = await import('../../src/services/aggregation.js');
    
    app.get('/monthly-trends', async (req, res) => {
      try {
        const { start_date, end_date, group_by_section } = req.query;
        const company_id = process.env.FREEE_COMPANY_ID;
        
        if (!start_date || !end_date) {
          return res.status(400).json({
            error: true,
            message: 'start_date and end_date are required'
          });
        }
        
        const params = {
          company_id,
          start_date,
          end_date,
          group_by_section: group_by_section === 'true'
        };
        
        const result = await getMonthlyTrends(params);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: true, message: err.message });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('月次推移データを正常に取得できること', async () => {
    const mockData = {
      monthly_trends: [
        {
          month: '2024-01',
          accounts: [
            {
              account_item_id: 100,
              account_item_name: '現金',
              debit_amount: 150000,
              credit_amount: 0,
              balance: 150000
            }
          ],
          total_debit: 150000,
          total_credit: 150000
        }
      ],
      metadata: {
        company_id: '12345',
        period: {
          start: '2024-01-01',
          end: '2024-01-31'
        },
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockGetMonthlyTrends.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/monthly-trends')
      .query({ start_date: '2024-01-01', end_date: '2024-01-31' })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockGetMonthlyTrends).toHaveBeenCalledWith({
      company_id: '12345',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      group_by_section: false
    });
  });

  test('部門別集計パラメータが正しく処理されること', async () => {
    const mockData = {
      monthly_trends: [
        {
          month: '2024-01',
          accounts: [],
          total_debit: 100000,
          total_credit: 100000,
          sections: [
            {
              section_id: 1001,
              total_debit: 100000,
              total_credit: 100000,
              accounts: []
            }
          ]
        }
      ],
      metadata: {
        company_id: '12345',
        period: {
          start: '2024-01-01',
          end: '2024-01-31'
        },
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockGetMonthlyTrends.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/monthly-trends')
      .query({
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        group_by_section: 'true'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockGetMonthlyTrends).toHaveBeenCalledWith({
      company_id: '12345',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      group_by_section: true
    });
  });

  test('必須パラメータが不足している場合、400エラーを返すこと', async () => {
    const response = await request(app)
      .get('/monthly-trends')
      .query({ start_date: '2024-01-01' })
      .expect(400);

    expect(response.body).toEqual({
      error: true,
      message: 'start_date and end_date are required'
    });
    expect(mockGetMonthlyTrends).not.toHaveBeenCalled();
  });

  test('サービスエラーが発生した場合、500エラーを返すこと', async () => {
    mockGetMonthlyTrends.mockRejectedValue(new Error('Freee API error'));

    const response = await request(app)
      .get('/monthly-trends')
      .query({ start_date: '2024-01-01', end_date: '2024-01-31' })
      .expect(500);

    expect(response.body).toEqual({
      error: true,
      message: 'Freee API error'
    });
  });
});