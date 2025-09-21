import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockGetJournals = jest.fn();

jest.unstable_mockModule('../../src/services/freeeClient.js', () => ({
  getJournals: mockGetJournals
}));

const { analyzeVariance } = await import('../../src/services/variance.js');

describe('variance analysis service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeVariance', () => {
    test('2期間の増減要因を正しく分析できること', async () => {
      const mockBaseData = {
        journals: [
          {
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1000000,
                partner_id: 1001,
                partner: { name: 'A社' },
                item_id: 100,
                item: { name: '商品A' }
              }
            ]
          },
          {
            issue_date: '2024-01-20',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 500000,
                partner_id: 1002,
                partner: { name: 'B社' },
                item_id: 101,
                item: { name: '商品B' }
              }
            ]
          }
        ]
      };

      const mockComparisonData = {
        journals: [
          {
            issue_date: '2024-02-10',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1200000,
                partner_id: 1001,
                partner: { name: 'A社' },
                item_id: 100,
                item: { name: '商品A' }
              }
            ]
          },
          {
            issue_date: '2024-02-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 800000,
                partner_id: 1002,
                partner: { name: 'B社' },
                item_id: 101,
                item: { name: '商品B' }
              }
            ]
          },
          {
            issue_date: '2024-02-20',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 300000,
                partner_id: 1003,
                partner: { name: 'C社' },
                item_id: 102,
                item: { name: '商品C' }
              }
            ]
          }
        ]
      };

      mockGetJournals
        .mockResolvedValueOnce(mockBaseData)
        .mockResolvedValueOnce(mockComparisonData);

      const params = {
        company_id: '12345',
        base_start_date: '2024-01-01',
        base_end_date: '2024-01-31',
        comparison_start_date: '2024-02-01',
        comparison_end_date: '2024-02-29'
      };

      const result = await analyzeVariance(params);

      expect(result).toHaveProperty('variance_analysis');
      expect(result.variance_analysis).toHaveProperty('summary');
      expect(result.variance_analysis.summary).toEqual({
        base_period_total: 1500000,
        comparison_period_total: 2300000,
        total_variance: 800000,
        variance_rate: expect.closeTo(53.33, 2)
      });

      expect(result.variance_analysis).toHaveProperty('by_account');
      const salesAccount = result.variance_analysis.by_account.find(a => a.account_item_id === 200);
      expect(salesAccount).toEqual({
        account_item_id: 200,
        account_item_name: '売上高',
        base_amount: 1500000,
        comparison_amount: 2300000,
        variance: 800000,
        variance_rate: expect.closeTo(53.33, 2)
      });

      expect(result.variance_analysis).toHaveProperty('by_partner');
      expect(result.variance_analysis.by_partner).toHaveLength(3);
      
      const partnerA = result.variance_analysis.by_partner.find(p => p.partner_id === 1001);
      expect(partnerA).toEqual({
        partner_id: 1001,
        partner_name: 'A社',
        base_amount: 1000000,
        comparison_amount: 1200000,
        variance: 200000,
        variance_rate: 20
      });

      const partnerC = result.variance_analysis.by_partner.find(p => p.partner_id === 1003);
      expect(partnerC).toEqual({
        partner_id: 1003,
        partner_name: 'C社',
        base_amount: 0,
        comparison_amount: 300000,
        variance: 300000,
        variance_rate: null
      });

      expect(result.variance_analysis).toHaveProperty('by_item');
      expect(result.variance_analysis.by_item).toHaveLength(3);
    });

    test('比較期間のデータがない場合でも正しく処理できること', async () => {
      const mockBaseData = {
        journals: [
          {
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1000000
              }
            ]
          }
        ]
      };

      const mockComparisonData = {
        journals: []
      };

      mockGetJournals
        .mockResolvedValueOnce(mockBaseData)
        .mockResolvedValueOnce(mockComparisonData);

      const params = {
        company_id: '12345',
        base_start_date: '2024-01-01',
        base_end_date: '2024-01-31',
        comparison_start_date: '2024-02-01',
        comparison_end_date: '2024-02-29'
      };

      const result = await analyzeVariance(params);

      expect(result.variance_analysis.summary).toEqual({
        base_period_total: 1000000,
        comparison_period_total: 0,
        total_variance: -1000000,
        variance_rate: -100
      });
    });

    test('部門別の増減分析ができること', async () => {
      const mockBaseData = {
        journals: [
          {
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 500000,
                section_id: 2001,
                section: { name: '営業部' }
              }
            ]
          }
        ]
      };

      const mockComparisonData = {
        journals: [
          {
            issue_date: '2024-02-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 700000,
                section_id: 2001,
                section: { name: '営業部' }
              },
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 300000,
                section_id: 2002,
                section: { name: '開発部' }
              }
            ]
          }
        ]
      };

      mockGetJournals
        .mockResolvedValueOnce(mockBaseData)
        .mockResolvedValueOnce(mockComparisonData);

      const params = {
        company_id: '12345',
        base_start_date: '2024-01-01',
        base_end_date: '2024-01-31',
        comparison_start_date: '2024-02-01',
        comparison_end_date: '2024-02-29',
        group_by_section: true
      };

      const result = await analyzeVariance(params);

      expect(result.variance_analysis).toHaveProperty('by_section');
      expect(result.variance_analysis.by_section).toHaveLength(2);
      
      const salesSection = result.variance_analysis.by_section.find(s => s.section_id === 2001);
      expect(salesSection).toEqual({
        section_id: 2001,
        section_name: '営業部',
        base_amount: 500000,
        comparison_amount: 700000,
        variance: 200000,
        variance_rate: 40
      });

      const devSection = result.variance_analysis.by_section.find(s => s.section_id === 2002);
      expect(devSection).toEqual({
        section_id: 2002,
        section_name: '開発部',
        base_amount: 0,
        comparison_amount: 300000,
        variance: 300000,
        variance_rate: null
      });
    });
  });
});