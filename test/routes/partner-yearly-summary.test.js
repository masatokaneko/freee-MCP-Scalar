import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

const mockGetPartnerYearlySummary = jest.fn();

jest.unstable_mockModule('../../src/services/partnerSummary.js', () => ({
  getPartnerYearlySummary: mockGetPartnerYearlySummary
}));

describe('GET /partner-yearly-summary', () => {
  let app;

  beforeEach(async () => {
    process.env.FREEE_COMPANY_ID = '12345';
    
    app = express();
    app.use(express.json());
    
    const { getPartnerYearlySummary } = await import('../../src/services/partnerSummary.js');
    
    app.get('/partner-yearly-summary', async (req, res) => {
      try {
        const { 
          fiscal_year, 
          start_date, 
          end_date,
          group_by_account,
          sort_by,
          include_zero
        } = req.query;
        
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
        
        if (group_by_account === 'true') params.group_by_account = true;
        if (sort_by) params.sort_by = sort_by;
        if (include_zero === 'true') params.include_zero = true;
        
        const result = await getPartnerYearlySummary(params);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: true, message: err.message });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('年度指定で取引先別年間集計を取得できること', async () => {
    const mockData = {
      partner_summary: [
        {
          partner_id: 1001,
          partner_name: 'A社',
          partner_code: 'A001',
          total_amount: 2500000,
          transaction_count: 2,
          monthly_breakdown: {
            '2024-01': 1000000,
            '2024-02': 1500000
          },
          quarterly_breakdown: {
            Q1: 2500000,
            Q2: 0,
            Q3: 0,
            Q4: 0
          },
          percentage_of_total: 55.56
        },
        {
          partner_id: 1002,
          partner_name: 'B社',
          partner_code: 'B001',
          total_amount: 2000000,
          transaction_count: 1,
          monthly_breakdown: {
            '2024-03': 2000000
          },
          quarterly_breakdown: {
            Q1: 2000000,
            Q2: 0,
            Q3: 0,
            Q4: 0
          },
          percentage_of_total: 44.44
        }
      ],
      summary: {
        total_partners: 2,
        total_revenue: 4500000,
        total_expense: 0,
        net_total: 4500000,
        average_per_partner: 2250000
      },
      metadata: {
        company_id: '12345',
        fiscal_year: 2024,
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockGetPartnerYearlySummary.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/partner-yearly-summary')
      .query({ fiscal_year: '2024' })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockGetPartnerYearlySummary).toHaveBeenCalledWith({
      company_id: '12345',
      fiscal_year: 2024
    });
  });

  test('期間指定で取引先別集計を取得できること', async () => {
    const mockData = {
      partner_summary: [
        {
          partner_id: 1001,
          partner_name: 'A社',
          partner_code: 'A001',
          total_amount: 1000000,
          transaction_count: 1,
          monthly_breakdown: {
            '2024-01': 1000000
          },
          quarterly_breakdown: {
            Q1: 1000000,
            Q2: 0,
            Q3: 0,
            Q4: 0
          },
          percentage_of_total: 100
        }
      ],
      summary: {
        total_partners: 1,
        total_revenue: 1000000,
        total_expense: 0,
        net_total: 1000000,
        average_per_partner: 1000000
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

    mockGetPartnerYearlySummary.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/partner-yearly-summary')
      .query({
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockGetPartnerYearlySummary).toHaveBeenCalledWith({
      company_id: '12345',
      start_date: '2024-01-01',
      end_date: '2024-01-31'
    });
  });

  test('ソートオプションが正しく処理されること', async () => {
    const mockData = {
      partner_summary: [
        {
          partner_id: 1002,
          partner_name: 'B社',
          partner_code: 'B001',
          total_amount: 3000000,
          ranking: 1
        },
        {
          partner_id: 1001,
          partner_name: 'A社',
          partner_code: 'A001',
          total_amount: 2000000,
          ranking: 2
        }
      ],
      summary: {
        total_partners: 2,
        total_revenue: 5000000,
        total_expense: 0,
        net_total: 5000000,
        average_per_partner: 2500000
      },
      metadata: {
        company_id: '12345',
        fiscal_year: 2024,
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockGetPartnerYearlySummary.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/partner-yearly-summary')
      .query({
        fiscal_year: '2024',
        sort_by: 'amount_desc'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockGetPartnerYearlySummary).toHaveBeenCalledWith({
      company_id: '12345',
      fiscal_year: 2024,
      sort_by: 'amount_desc'
    });
  });

  test('勘定科目別グループオプションが正しく処理されること', async () => {
    const mockData = {
      partner_summary: [
        {
          partner_id: 1001,
          partner_name: 'A社',
          partner_code: 'A001',
          total_amount: 1600000,
          account_breakdown: [
            {
              account_item_id: 200,
              account_item_name: '売上高',
              amount: 1000000,
              transaction_count: 1
            },
            {
              account_item_id: 500,
              account_item_name: '仕入高',
              amount: 600000,
              transaction_count: 1
            }
          ]
        }
      ],
      summary: {
        total_partners: 1,
        total_revenue: 1000000,
        total_expense: 600000,
        net_total: 400000,
        average_per_partner: 1600000
      },
      metadata: {
        company_id: '12345',
        fiscal_year: 2024,
        generated_at: '2024-01-21T10:00:00.000Z'
      }
    };

    mockGetPartnerYearlySummary.mockResolvedValue(mockData);

    const response = await request(app)
      .get('/partner-yearly-summary')
      .query({
        fiscal_year: '2024',
        group_by_account: 'true'
      })
      .expect(200);

    expect(response.body).toEqual(mockData);
    expect(mockGetPartnerYearlySummary).toHaveBeenCalledWith({
      company_id: '12345',
      fiscal_year: 2024,
      group_by_account: true
    });
  });

  test('必須パラメータが不足している場合、400エラーを返すこと', async () => {
    const response = await request(app)
      .get('/partner-yearly-summary')
      .query({})
      .expect(400);

    expect(response.body).toEqual({
      error: true,
      message: 'Either fiscal_year or both start_date and end_date are required'
    });
    expect(mockGetPartnerYearlySummary).not.toHaveBeenCalled();
  });

  test('サービスエラーが発生した場合、500エラーを返すこと', async () => {
    mockGetPartnerYearlySummary.mockRejectedValue(new Error('Freee API error'));

    const response = await request(app)
      .get('/partner-yearly-summary')
      .query({ fiscal_year: '2024' })
      .expect(500);

    expect(response.body).toEqual({
      error: true,
      message: 'Freee API error'
    });
  });
});