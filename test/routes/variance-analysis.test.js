import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockAnalyzeVariance = jest.fn();

jest.unstable_mockModule('../../src/services/variance.js', () => ({
  analyzeVariance: mockAnalyzeVariance
}));

describe('GET /variance-analysis', () => {
  let app;

  beforeEach(async () => {
    process.env.FREEE_COMPANY_ID = '12345';
    
    app = express();
    app.use(express.json());
    
    const { analyzeVariance } = await import('../../src/services/variance.js');
    
    app.get('/variance-analysis', async (req, res) => {
      try {
        const {
          base_start_date,
          base_end_date,
          comparison_start_date,
          comparison_end_date,
          group_by_section
        } = req.query;
        
        if (!base_start_date || !base_end_date || !comparison_start_date || !comparison_end_date) {
          return res.status(400).json({
            error: true,
            message: 'base_start_date, base_end_date, comparison_start_date, and comparison_end_date are required'
          });
        }
        
        const params = {
          company_id: process.env.FREEE_COMPANY_ID,
          base_start_date,
          base_end_date,
          comparison_start_date,
          comparison_end_date,
          group_by_section: group_by_section === 'true'
        };
        
        const result = await analyzeVariance(params);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: true, message: err.message });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('増減分析データを正常に取得できること', async () => {
    const mockData = {
      variance_analysis: {
        summary: {
          base_period_total: 1500000,
          comparison_period_total: 2300000,
          total_variance: 800000,
          variance_rate: 53.33
        },
        by_account: [
          {
            account_item_id: 200,
            account_item_name: '売上高',
            base_amount: 1500000,
            comparison_amount: 2300000,
            variance: 800000,
            variance_rate: 53.33
          }
        ],
        by_partner: [],
        by_item: []
      },
      metadata: {
        company_id: '12345',
        base_period: {
          start: '2024-01-01',
          end: '2024-01-31'
        },
        comparison_period: {
          start: '2024-02-01',
          end: '2024-02-29'
        },
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockAnalyzeVariance.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/variance-analysis')
      .query({
        base_start_date: '2024-01-01',
        base_end_date: '2024-01-31',
        comparison_start_date: '2024-02-01',
        comparison_end_date: '2024-02-29'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockAnalyzeVariance).toHaveBeenCalledWith({
      company_id: '12345',
      base_start_date: '2024-01-01',
      base_end_date: '2024-01-31',
      comparison_start_date: '2024-02-01',
      comparison_end_date: '2024-02-29',
      group_by_section: false
    });
  });

  test('部門別集計パラメータが正しく処理されること', async () => {
    const mockData = {
      variance_analysis: {
        summary: {
          base_period_total: 500000,
          comparison_period_total: 1000000,
          total_variance: 500000,
          variance_rate: 100
        },
        by_account: [],
        by_partner: [],
        by_item: [],
        by_section: [
          {
            section_id: 2001,
            section_name: '営業部',
            base_amount: 500000,
            comparison_amount: 700000,
            variance: 200000,
            variance_rate: 40
          }
        ]
      },
      metadata: {
        company_id: '12345',
        base_period: {
          start: '2024-01-01',
          end: '2024-01-31'
        },
        comparison_period: {
          start: '2024-02-01',
          end: '2024-02-29'
        },
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockAnalyzeVariance.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/variance-analysis')
      .query({
        base_start_date: '2024-01-01',
        base_end_date: '2024-01-31',
        comparison_start_date: '2024-02-01',
        comparison_end_date: '2024-02-29',
        group_by_section: 'true'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockAnalyzeVariance).toHaveBeenCalledWith({
      company_id: '12345',
      base_start_date: '2024-01-01',
      base_end_date: '2024-01-31',
      comparison_start_date: '2024-02-01',
      comparison_end_date: '2024-02-29',
      group_by_section: true
    });
  });

  test('必須パラメータが不足している場合、400エラーを返すこと', async () => {
    const response = await request(app)
      .get('/variance-analysis')
      .query({
        base_start_date: '2024-01-01',
        base_end_date: '2024-01-31'
      })
      .expect(400);

    expect(response.body).toEqual({
      error: true,
      message: 'base_start_date, base_end_date, comparison_start_date, and comparison_end_date are required'
    });
    expect(mockAnalyzeVariance).not.toHaveBeenCalled();
  });

  test('サービスエラーが発生した場合、500エラーを返すこと', async () => {
    mockAnalyzeVariance.mockRejectedValue(new Error('Freee API error'));

    const response = await request(app)
      .get('/variance-analysis')
      .query({
        base_start_date: '2024-01-01',
        base_end_date: '2024-01-31',
        comparison_start_date: '2024-02-01',
        comparison_end_date: '2024-02-29'
      })
      .expect(500);

    expect(response.body).toEqual({
      error: true,
      message: 'Freee API error'
    });
  });
});