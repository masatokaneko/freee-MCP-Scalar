import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockSaveBudget = jest.fn();
const mockGetBudget = jest.fn();

jest.unstable_mockModule('../../src/services/budget.js', () => ({
  saveBudget: mockSaveBudget,
  getBudget: mockGetBudget,
  compareBudgetToActual: jest.fn()
}));

describe('Budget API endpoints', () => {
  let app;

  beforeEach(async () => {
    process.env.FREEE_COMPANY_ID = '12345';
    
    app = express();
    app.use(express.json());
    
    const { saveBudget, getBudget } = await import('../../src/services/budget.js');
    
    // POST /budgets endpoint
    app.post('/budgets', async (req, res) => {
      try {
        const budgetData = {
          company_id: process.env.FREEE_COMPANY_ID,
          ...req.body
        };
        
        if (!budgetData.fiscal_year) {
          return res.status(400).json({
            error: true,
            message: 'fiscal_year is required'
          });
        }
        
        if (!budgetData.budgets || !Array.isArray(budgetData.budgets)) {
          return res.status(400).json({
            error: true,
            message: 'budgets array is required'
          });
        }
        
        const result = await saveBudget(budgetData);
        res.status(201).json(result);
      } catch (err) {
        res.status(500).json({ error: true, message: err.message });
      }
    });
    
    // GET /budgets endpoint
    app.get('/budgets', async (req, res) => {
      try {
        const { fiscal_year, start_date, end_date } = req.query;
        
        if (!fiscal_year && (!start_date || !end_date)) {
          return res.status(400).json({
            error: true,
            message: 'Either fiscal_year or both start_date and end_date are required'
          });
        }
        
        const params = {
          company_id: process.env.FREEE_COMPANY_ID
        };
        
        if (fiscal_year) {
          params.fiscal_year = parseInt(fiscal_year);
        } else {
          params.start_date = start_date;
          params.end_date = end_date;
        }
        
        const result = await getBudget(params);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: true, message: err.message });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /budgets', () => {
    test('予算データを正常に保存できること', async () => {
      const budgetData = {
        fiscal_year: 2024,
        budgets: [
          {
            account_item_id: 200,
            account_item_name: '売上高',
            monthly_budgets: {
              '2024-01': 1000000,
              '2024-02': 1100000
            },
            annual_budget: 12000000
          }
        ]
      };

      const mockResult = {
        success: true,
        budget_id: 'BUD-12345-2024-123456',
        message: 'Budget saved successfully',
        summary: {
          fiscal_year: 2024,
          total_accounts: 1,
          total_annual_budget: 12000000
        }
      };

      mockSaveBudget.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/budgets')
        .send(budgetData)
        .expect(201);

      expect(response.body).toEqual(mockResult);
      expect(mockSaveBudget).toHaveBeenCalledWith({
        company_id: '12345',
        fiscal_year: 2024,
        budgets: budgetData.budgets
      });
    });

    test('必須パラメータが不足している場合、400エラーを返すこと', async () => {
      const response = await request(app)
        .post('/budgets')
        .send({ budgets: [] })
        .expect(400);

      expect(response.body).toEqual({
        error: true,
        message: 'fiscal_year is required'
      });
      expect(mockSaveBudget).not.toHaveBeenCalled();
    });

    test('budgets配列が不正な場合、400エラーを返すこと', async () => {
      const response = await request(app)
        .post('/budgets')
        .send({ fiscal_year: 2024 })
        .expect(400);

      expect(response.body).toEqual({
        error: true,
        message: 'budgets array is required'
      });
      expect(mockSaveBudget).not.toHaveBeenCalled();
    });

    test('サービスエラーが発生した場合、500エラーを返すこと', async () => {
      mockSaveBudget.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/budgets')
        .send({
          fiscal_year: 2024,
          budgets: []
        })
        .expect(500);

      expect(response.body).toEqual({
        error: true,
        message: 'Database error'
      });
    });
  });

  describe('GET /budgets', () => {
    test('年度指定で予算データを取得できること', async () => {
      const mockData = {
        budget_data: {
          fiscal_year: 2024,
          budgets: [
            {
              account_item_id: 200,
              account_item_name: '売上高',
              annual_budget: 12000000
            }
          ]
        }
      };

      mockGetBudget.mockResolvedValue(mockData);

      const response = await request(app)
        .get('/budgets')
        .query({ fiscal_year: '2024' })
        .expect(200);

      expect(response.body).toEqual(mockData);
      expect(mockGetBudget).toHaveBeenCalledWith({
        company_id: '12345',
        fiscal_year: 2024
      });
    });

    test('期間指定で予算データを取得できること', async () => {
      const mockData = {
        budget_data: {
          period: {
            start: '2024-01-01',
            end: '2024-03-31'
          },
          budgets: [
            {
              account_item_id: 200,
              account_item_name: '売上高',
              monthly_budgets: {
                '2024-01': 1000000,
                '2024-02': 1100000,
                '2024-03': 1200000
              }
            }
          ]
        }
      };

      mockGetBudget.mockResolvedValue(mockData);

      const response = await request(app)
        .get('/budgets')
        .query({
          start_date: '2024-01-01',
          end_date: '2024-03-31'
        })
        .expect(200);

      expect(response.body).toEqual(mockData);
      expect(mockGetBudget).toHaveBeenCalledWith({
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-03-31'
      });
    });

    test('必須パラメータが不足している場合、400エラーを返すこと', async () => {
      const response = await request(app)
        .get('/budgets')
        .query({})
        .expect(400);

      expect(response.body).toEqual({
        error: true,
        message: 'Either fiscal_year or both start_date and end_date are required'
      });
      expect(mockGetBudget).not.toHaveBeenCalled();
    });

    test('期間指定が不完全な場合、400エラーを返すこと', async () => {
      const response = await request(app)
        .get('/budgets')
        .query({ start_date: '2024-01-01' })
        .expect(400);

      expect(response.body).toEqual({
        error: true,
        message: 'Either fiscal_year or both start_date and end_date are required'
      });
      expect(mockGetBudget).not.toHaveBeenCalled();
    });
  });
});