import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockGetJournals = jest.fn();
const mockGetAccountItems = jest.fn();

jest.unstable_mockModule('../../src/services/freeeClient.js', () => ({
  getJournals: mockGetJournals,
  getAccountItems: mockGetAccountItems
}));

const { saveBudget, getBudget, compareBudgetToActual } = await import('../../src/services/budget.js');

describe('budget service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveBudget', () => {
    test('予算データを正しく保存できること', async () => {
      const budgetData = {
        company_id: '12345',
        fiscal_year: 2024,
        budgets: [
          {
            account_item_id: 200,
            account_item_name: '売上高',
            monthly_budgets: {
              '2024-01': 1000000,
              '2024-02': 1100000,
              '2024-03': 1200000
            },
            annual_budget: 13200000
          },
          {
            account_item_id: 500,
            account_item_name: '売上原価',
            monthly_budgets: {
              '2024-01': 600000,
              '2024-02': 660000,
              '2024-03': 720000
            },
            annual_budget: 7920000
          }
        ]
      };

      const result = await saveBudget(budgetData);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('budget_id');
      expect(result).toHaveProperty('message', 'Budget saved successfully');
      expect(result.summary).toEqual({
        fiscal_year: 2024,
        total_accounts: 2,
        total_annual_budget: 21120000
      });
    });

    test('必須フィールドが不足している場合エラーを返すこと', async () => {
      const invalidData = {
        company_id: '12345',
        // fiscal_year is missing
        budgets: []
      };

      await expect(saveBudget(invalidData)).rejects.toThrow('fiscal_year is required');
    });
  });

  describe('getBudget', () => {
    test('指定された年度の予算データを取得できること', async () => {
      const params = {
        company_id: '12345',
        fiscal_year: 2024
      };

      const result = await getBudget(params);

      expect(result).toHaveProperty('budget_data');
      expect(result.budget_data).toHaveProperty('fiscal_year', 2024);
      expect(result.budget_data).toHaveProperty('budgets');
      expect(result.budget_data.budgets).toHaveLength(2);
    });

    test('指定期間の予算データを取得できること', async () => {
      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-03-31'
      };

      const result = await getBudget(params);

      expect(result).toHaveProperty('budget_data');
      expect(result.budget_data).toHaveProperty('period');
      expect(result.budget_data.period).toEqual({
        start: '2024-01-01',
        end: '2024-03-31'
      });
    });
  });

  describe('compareBudgetToActual', () => {
    test('予算と実績を正しく比較できること', async () => {
      // Mock actual data from Freee
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
                amount: 950000
              }
            ]
          },
          {
            id: 'J002',
            issue_date: '2024-01-20',
            details: [
              {
                account_item_id: 500,
                account_item: { name: '売上原価' },
                entry_side: 'debit',
                amount: 580000
              }
            ]
          }
        ]
      });

      mockGetAccountItems.mockResolvedValue({
        account_items: [
          { id: 200, name: '売上高' },
          { id: 500, name: '売上原価' }
        ]
      });

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      };

      const result = await compareBudgetToActual(params);

      expect(result).toHaveProperty('comparison');
      expect(result.comparison).toHaveLength(2);

      const salesComparison = result.comparison.find(c => c.account_item_id === 200);
      expect(salesComparison).toEqual({
        account_item_id: 200,
        account_item_name: '売上高',
        budget_amount: 1000000,
        actual_amount: 950000,
        variance: -50000,
        variance_rate: -5,
        achievement_rate: 95
      });

      const costComparison = result.comparison.find(c => c.account_item_id === 500);
      expect(costComparison).toEqual({
        account_item_id: 500,
        account_item_name: '売上原価',
        budget_amount: 600000,
        actual_amount: 580000,
        variance: -20000,
        variance_rate: -3.33,
        achievement_rate: 96.67
      });

      expect(result.summary).toEqual({
        total_budget: 1600000,
        total_actual: 1530000,
        total_variance: -70000,
        overall_achievement_rate: 95.63
      });
    });

    test('月次での予実比較ができること', async () => {
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
                amount: 950000
              }
            ]
          },
          {
            id: 'J002',
            issue_date: '2024-02-15',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 1080000
              }
            ]
          }
        ]
      });

      mockGetAccountItems.mockResolvedValue({
        account_items: [
          { id: 200, name: '売上高' }
        ]
      });

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-02-28',
        group_by: 'month'
      };

      const result = await compareBudgetToActual(params);

      expect(result).toHaveProperty('monthly_comparison');
      expect(result.monthly_comparison).toHaveLength(2);

      const janComparison = result.monthly_comparison.find(m => m.month === '2024-01');
      expect(janComparison).toEqual({
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
      });
    });

    test('予算データが存在しない場合でも処理できること', async () => {
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
                amount: 950000
              }
            ]
          }
        ]
      });

      mockGetAccountItems.mockResolvedValue({
        account_items: [
          { id: 200, name: '売上高' }
        ]
      });

      const params = {
        company_id: '99999', // Different company ID to ensure no budget data
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        test_mode: false // Disable test mode to not use mock budget
      };

      const result = await compareBudgetToActual(params);

      expect(result.comparison[0]).toEqual({
        account_item_id: 200,
        account_item_name: '売上高',
        budget_amount: 0,
        actual_amount: 950000,
        variance: 950000,
        variance_rate: null,
        achievement_rate: null
      });

      expect(result.metadata.notes).toContain('No budget data found for some accounts');
    });
  });
});