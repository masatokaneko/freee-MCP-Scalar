import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockGetJournals = jest.fn();
const mockGetPartners = jest.fn();

jest.unstable_mockModule('../../src/services/freeeClient.js', () => ({
  getJournals: mockGetJournals,
  getPartners: mockGetPartners,
  getAccountItems: jest.fn(),
  getSections: jest.fn(),
  getTaxes: jest.fn(),
  getTags: jest.fn()
}));

const { getPartnerYearlySummary } = await import('../../src/services/partnerSummary.js');

describe('partner summary service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPartnerYearlySummary', () => {
    test('取引先別の年間集計を正しく計算できること', async () => {
      // Mock partners data
      mockGetPartners.mockResolvedValue({
        partners: [
          { id: 1001, name: 'A社', code: 'A001' },
          { id: 1002, name: 'B社', code: 'B001' },
          { id: 1003, name: 'C社', code: 'C001' }
        ]
      });

      // Mock journals data
      mockGetJournals.mockResolvedValue({
        journals: [
          {
            id: 'J001',
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1000000,
                partner_id: 1001,
                partner: { name: 'A社' }
              }
            ]
          },
          {
            id: 'J002',
            issue_date: '2024-02-20',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1500000,
                partner_id: 1001,
                partner: { name: 'A社' }
              }
            ]
          },
          {
            id: 'J003',
            issue_date: '2024-03-25',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 2000000,
                partner_id: 1002,
                partner: { name: 'B社' }
              }
            ]
          },
          {
            id: 'J004',
            issue_date: '2024-01-30',
            details: [
              {
                account_item_id: 500,
                account_item: { name: '仕入高' },
                entry_side: 'debit',
                amount: 500000,
                partner_id: 1003,
                partner: { name: 'C社' }
              }
            ]
          }
        ]
      });

      const params = {
        company_id: '12345',
        fiscal_year: 2024
      };

      const result = await getPartnerYearlySummary(params);

      expect(result).toHaveProperty('partner_summary');
      expect(result.partner_summary).toHaveLength(3);

      // Check A社 summary
      const partnerA = result.partner_summary.find(p => p.partner_id === 1001);
      expect(partnerA).toEqual({
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
        percentage_of_total: expect.any(Number)
      });

      // Check B社 summary
      const partnerB = result.partner_summary.find(p => p.partner_id === 1002);
      expect(partnerB).toEqual({
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
        percentage_of_total: expect.any(Number)
      });

      expect(result.summary).toEqual({
        total_partners: 3,
        total_revenue: 4500000,
        total_expense: 500000,
        net_total: 4000000,
        average_per_partner: expect.any(Number)
      });

      expect(result.metadata).toEqual({
        company_id: '12345',
        fiscal_year: 2024,
        generated_at: expect.any(String)
      });
    });

    test('勘定科目別の取引先集計ができること', async () => {
      mockGetPartners.mockResolvedValue({
        partners: [
          { id: 1001, name: 'A社', code: 'A001' }
        ]
      });

      mockGetJournals.mockResolvedValue({
        journals: [
          {
            id: 'J001',
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1000000,
                partner_id: 1001
              }
            ]
          },
          {
            id: 'J002',
            issue_date: '2024-02-20',
            details: [
              {
                account_item_id: 500,
                account_item: { name: '仕入高' },
                entry_side: 'debit',
                amount: 600000,
                partner_id: 1001
              }
            ]
          }
        ]
      });

      const params = {
        company_id: '12345',
        fiscal_year: 2024,
        group_by_account: true
      };

      const result = await getPartnerYearlySummary(params);

      const partnerA = result.partner_summary[0];
      expect(partnerA).toHaveProperty('account_breakdown');
      expect(partnerA.account_breakdown).toEqual([
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
      ]);
    });

    test('期間指定での取引先集計ができること', async () => {
      mockGetPartners.mockResolvedValue({
        partners: [
          { id: 1001, name: 'A社', code: 'A001' }
        ]
      });

      mockGetJournals.mockResolvedValue({
        journals: [
          {
            id: 'J001',
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1000000,
                partner_id: 1001
              }
            ]
          },
          {
            id: 'J002',
            issue_date: '2024-02-20',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1500000,
                partner_id: 1001
              }
            ]
          }
        ]
      });

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-02-28'
      };

      const result = await getPartnerYearlySummary(params);

      expect(result.partner_summary[0].total_amount).toBe(2500000);
      expect(result.partner_summary[0].transaction_count).toBe(2);
      expect(result.metadata.period).toEqual({
        start: '2024-01-01',
        end: '2024-02-28'
      });
    });

    test('取引先のランキングを正しく計算できること', async () => {
      mockGetPartners.mockResolvedValue({
        partners: [
          { id: 1001, name: 'A社', code: 'A001' },
          { id: 1002, name: 'B社', code: 'B001' },
          { id: 1003, name: 'C社', code: 'C001' }
        ]
      });

      mockGetJournals.mockResolvedValue({
        journals: [
          {
            id: 'J001',
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 3000000,
                partner_id: 1002
              }
            ]
          },
          {
            id: 'J002',
            issue_date: '2024-02-20',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 2000000,
                partner_id: 1001
              }
            ]
          },
          {
            id: 'J003',
            issue_date: '2024-03-25',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1000000,
                partner_id: 1003
              }
            ]
          }
        ]
      });

      const params = {
        company_id: '12345',
        fiscal_year: 2024,
        sort_by: 'amount_desc'
      };

      const result = await getPartnerYearlySummary(params);

      // Should be sorted by amount in descending order
      expect(result.partner_summary[0].partner_id).toBe(1002); // B社: 3,000,000
      expect(result.partner_summary[0].ranking).toBe(1);
      expect(result.partner_summary[1].partner_id).toBe(1001); // A社: 2,000,000
      expect(result.partner_summary[1].ranking).toBe(2);
      expect(result.partner_summary[2].partner_id).toBe(1003); // C社: 1,000,000
      expect(result.partner_summary[2].ranking).toBe(3);
    });

    test('取引がない取引先も含めて集計できること', async () => {
      mockGetPartners.mockResolvedValue({
        partners: [
          { id: 1001, name: 'A社', code: 'A001' },
          { id: 1002, name: 'B社', code: 'B001' },
          { id: 1003, name: 'C社', code: 'C001' } // No transactions
        ]
      });

      mockGetJournals.mockResolvedValue({
        journals: [
          {
            id: 'J001',
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1000000,
                partner_id: 1001
              }
            ]
          }
        ]
      });

      const params = {
        company_id: '12345',
        fiscal_year: 2024,
        include_zero: true
      };

      const result = await getPartnerYearlySummary(params);

      expect(result.partner_summary).toHaveLength(3);
      
      const partnerC = result.partner_summary.find(p => p.partner_id === 1003);
      expect(partnerC).toEqual({
        partner_id: 1003,
        partner_name: 'C社',
        partner_code: 'C001',
        total_amount: 0,
        transaction_count: 0,
        monthly_breakdown: {},
        quarterly_breakdown: {
          Q1: 0,
          Q2: 0,
          Q3: 0,
          Q4: 0
        },
        percentage_of_total: 0
      });
    });
  });
});