import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockCompareBudgetToActual = jest.fn();

jest.unstable_mockModule('../../src/services/budget.js', () => ({
  saveBudget: jest.fn(),
  getBudget: jest.fn(),
  compareBudgetToActual: mockCompareBudgetToActual
}));

describe('GET /budget-comparison', () => {
  let app;

  beforeEach(async () => {
    process.env.FREEE_COMPANY_ID = '12345';
    
    app = express();
    app.use(express.json());
    
    const { compareBudgetToActual } = await import('../../src/services/budget.js');
    
    app.get('/budget-comparison', async (req, res) => {
      try {
        const { start_date, end_date, group_by } = req.query;
        
        if (!start_date || !end_date) {
          return res.status(400).json({
            error: true,
            message: 'start_date and end_date are required'
          });
        }
        
        const params = {
          company_id: process.env.FREEE_COMPANY_ID,
          start_date,
          end_date
        };
        
        if (group_by) {
          params.group_by = group_by;
        }
        
        const result = await compareBudgetToActual(params);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: true, message: err.message });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('予実比較データを正常に取得できること', async () => {
    const mockData = {
      comparison: [
        {
          account_item_id: 200,
          account_item_name: '売上高',
          budget_amount: 1000000,
          actual_amount: 950000,
          variance: -50000,
          variance_rate: -5,
          achievement_rate: 95
        },
        {
          account_item_id: 500,
          account_item_name: '売上原価',
          budget_amount: 600000,
          actual_amount: 580000,
          variance: -20000,
          variance_rate: -3.33,
          achievement_rate: 96.67
        }
      ],
      summary: {
        total_budget: 1600000,
        total_actual: 1530000,
        total_variance: -70000,
        overall_achievement_rate: 95.63
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

    mockCompareBudgetToActual.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/budget-comparison')
      .query({
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockCompareBudgetToActual).toHaveBeenCalledWith({
      company_id: '12345',
      start_date: '2024-01-01',
      end_date: '2024-01-31'
    });
  });

  test('月次グループでの予実比較ができること', async () => {
    const mockData = {
      comparison: [
        {
          account_item_id: 200,
          account_item_name: '売上高',
          budget_amount: 2000000,
          actual_amount: 1950000,
          variance: -50000,
          variance_rate: -2.5,
          achievement_rate: 97.5
        }
      ],
      monthly_comparison: [
        {
          month: '2024-01',
          comparisons: [
            {
              account_item_id: 200,
              account_item_name: '売上高',
              budget_amount: 1000000,
              actual_amount: 950000,
              variance: -50000,
              variance_rate: -5,
              achievement_rate: 95
            }
          ],
          summary: {
            total_budget: 1000000,
            total_actual: 950000,
            total_variance: -50000,
            achievement_rate: 95
          }
        },
        {
          month: '2024-02',
          comparisons: [
            {
              account_item_id: 200,
              account_item_name: '売上高',
              budget_amount: 1000000,
              actual_amount: 1000000,
              variance: 0,
              variance_rate: 0,
              achievement_rate: 100
            }
          ],
          summary: {
            total_budget: 1000000,
            total_actual: 1000000,
            total_variance: 0,
            achievement_rate: 100
          }
        }
      ],
      summary: {
        total_budget: 2000000,
        total_actual: 1950000,
        total_variance: -50000,
        overall_achievement_rate: 97.5
      },
      metadata: {
        company_id: '12345',
        period: {
          start: '2024-01-01',
          end: '2024-02-28'
        },
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockCompareBudgetToActual.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/budget-comparison')
      .query({
        start_date: '2024-01-01',
        end_date: '2024-02-28',
        group_by: 'month'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockCompareBudgetToActual).toHaveBeenCalledWith({
      company_id: '12345',
      start_date: '2024-01-01',
      end_date: '2024-02-28',
      group_by: 'month'
    });
  });

  test('必須パラメータが不足している場合、400エラーを返すこと', async () => {
    const response = await request(app)
      .get('/budget-comparison')
      .query({ start_date: '2024-01-01' })
      .expect(400);

    expect(response.body).toEqual({
      error: true,
      message: 'start_date and end_date are required'
    });
    expect(mockCompareBudgetToActual).not.toHaveBeenCalled();
  });

  test('サービスエラーが発生した場合、500エラーを返すこと', async () => {
    mockCompareBudgetToActual.mockRejectedValue(new Error('Freee API error'));

    const response = await request(app)
      .get('/budget-comparison')
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