import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockGetJournals = jest.fn();
const mockGetAccountItems = jest.fn();

jest.unstable_mockModule('../../src/services/freeeClient.js', () => ({
  getJournals: mockGetJournals,
  getAccountItems: mockGetAccountItems
}));

const { getMonthlyTrends } = await import('../../src/services/aggregation.js');

describe('aggregation service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMonthlyTrends', () => {
    test('指定期間の月次推移データを正しく集計できること', async () => {
      const mockJournalsData = {
        journals: [
          {
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 100,
                entry_side: 'debit',
                amount: 100000
              },
              {
                account_item_id: 200,
                entry_side: 'credit',
                amount: 100000
              }
            ]
          },
          {
            issue_date: '2024-01-20',
            details: [
              {
                account_item_id: 100,
                entry_side: 'debit',
                amount: 50000
              },
              {
                account_item_id: 300,
                entry_side: 'credit',
                amount: 50000
              }
            ]
          },
          {
            issue_date: '2024-02-10',
            details: [
              {
                account_item_id: 100,
                entry_side: 'debit',
                amount: 200000
              },
              {
                account_item_id: 200,
                entry_side: 'credit',
                amount: 200000
              }
            ]
          }
        ]
      };

      const mockAccountItems = {
        account_items: [
          { id: 100, name: '現金', account_category_id: 1 },
          { id: 200, name: '売上高', account_category_id: 4 },
          { id: 300, name: '売掛金', account_category_id: 1 }
        ]
      };

      mockGetJournals.mockResolvedValue(mockJournalsData);
      mockGetAccountItems.mockResolvedValue(mockAccountItems);

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-02-28'
      };

      const result = await getMonthlyTrends(params);

      expect(result).toHaveProperty('monthly_trends');
      expect(result.monthly_trends).toHaveLength(2);

      const january = result.monthly_trends.find(m => m.month === '2024-01');
      expect(january).toEqual({
        month: '2024-01',
        accounts: [
          {
            account_item_id: 100,
            account_item_name: '現金',
            debit_amount: 150000,
            credit_amount: 0,
            balance: 150000
          },
          {
            account_item_id: 200,
            account_item_name: '売上高',
            debit_amount: 0,
            credit_amount: 100000,
            balance: -100000
          },
          {
            account_item_id: 300,
            account_item_name: '売掛金',
            debit_amount: 0,
            credit_amount: 50000,
            balance: -50000
          }
        ],
        total_debit: 150000,
        total_credit: 150000
      });

      const february = result.monthly_trends.find(m => m.month === '2024-02');
      expect(february).toEqual({
        month: '2024-02',
        accounts: [
          {
            account_item_id: 100,
            account_item_name: '現金',
            debit_amount: 200000,
            credit_amount: 0,
            balance: 200000
          },
          {
            account_item_id: 200,
            account_item_name: '売上高',
            debit_amount: 0,
            credit_amount: 200000,
            balance: -200000
          }
        ],
        total_debit: 200000,
        total_credit: 200000
      });
    });

    test('仕訳データが空の場合、空の月次推移を返すこと', async () => {
      mockGetJournals.mockResolvedValue({ journals: [] });
      mockGetAccountItems.mockResolvedValue({ account_items: [] });

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      };

      const result = await getMonthlyTrends(params);

      expect(result).toEqual({
        monthly_trends: [],
        metadata: {
          company_id: '12345',
          period: {
            start: '2024-01-01',
            end: '2024-01-31'
          },
          generated_at: expect.any(String)
        }
      });
    });

    test('部門別の集計ができること', async () => {
      const mockJournalsData = {
        journals: [
          {
            issue_date: '2024-01-15',
            details: [
              {
                account_item_id: 100,
                entry_side: 'debit',
                amount: 100000,
                section_id: 1001
              },
              {
                account_item_id: 200,
                entry_side: 'credit',
                amount: 100000,
                section_id: 1001
              }
            ]
          },
          {
            issue_date: '2024-01-20',
            details: [
              {
                account_item_id: 100,
                entry_side: 'debit',
                amount: 50000,
                section_id: 1002
              },
              {
                account_item_id: 200,
                entry_side: 'credit',
                amount: 50000,
                section_id: 1002
              }
            ]
          }
        ]
      };

      const mockAccountItems = {
        account_items: [
          { id: 100, name: '現金', account_category_id: 1 },
          { id: 200, name: '売上高', account_category_id: 4 }
        ]
      };

      mockGetJournals.mockResolvedValue(mockJournalsData);
      mockGetAccountItems.mockResolvedValue(mockAccountItems);

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        group_by_section: true
      };

      const result = await getMonthlyTrends(params);

      expect(result.monthly_trends[0]).toHaveProperty('sections');
      expect(result.monthly_trends[0].sections).toHaveLength(2);
      
      const section1001 = result.monthly_trends[0].sections.find(s => s.section_id === 1001);
      expect(section1001.total_debit).toBe(100000);
      expect(section1001.total_credit).toBe(100000);

      const section1002 = result.monthly_trends[0].sections.find(s => s.section_id === 1002);
      expect(section1002.total_debit).toBe(50000);
      expect(section1002.total_credit).toBe(50000);
    });
  });
});