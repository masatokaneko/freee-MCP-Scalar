import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockGetJournals = jest.fn();

jest.unstable_mockModule('../../src/services/freeeClient.js', () => ({
  getJournals: mockGetJournals
}));

const { analyzeEntryRoutes } = await import('../../src/services/entryRoute.js');

describe('entry route analysis service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeEntryRoutes', () => {
    test('取引の計上ルートを正しく判定できること', async () => {
      const mockJournalsData = {
        journals: [
          {
            id: 'J001',
            issue_date: '2024-01-15',
            type: 'manual',
            adjustment: false,
            txn_number: 'MAN-001',
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 100000
              }
            ]
          },
          {
            id: 'J002',
            issue_date: '2024-01-20',
            type: 'expense',
            adjustment: false,
            expense_application_id: 'EXP-001',
            details: [
              {
                account_item_id: 500,
                account_item: { name: '旅費交通費' },
                entry_side: 'debit',
                amount: 5000
              }
            ]
          },
          {
            id: 'J003',
            issue_date: '2024-01-25',
            type: 'transfer',
            adjustment: false,
            walletable_id: 'BANK-001',
            details: [
              {
                account_item_id: 100,
                account_item: { name: '現金' },
                entry_side: 'debit',
                amount: 50000
              }
            ]
          },
          {
            id: 'J004',
            issue_date: '2024-01-30',
            type: 'deal',
            adjustment: false,
            deal_id: 123,
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 200000
              }
            ]
          },
          {
            id: 'J005',
            issue_date: '2024-01-31',
            type: 'manual',
            adjustment: true,
            txn_number: 'ADJ-001',
            details: [
              {
                account_item_id: 600,
                account_item: { name: '雑費' },
                entry_side: 'debit',
                amount: 1000
              }
            ]
          }
        ]
      };

      mockGetJournals.mockResolvedValue(mockJournalsData);

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      };

      const result = await analyzeEntryRoutes(params);

      expect(result).toHaveProperty('entry_routes');
      expect(result.entry_routes).toHaveProperty('summary');
      
      const summary = result.entry_routes.summary;
      expect(summary).toEqual({
        total_count: 5,
        manual_entry_count: 1,
        expense_application_count: 1,
        bank_transfer_count: 1,
        deal_count: 1,
        adjustment_count: 1
      });

      expect(result.entry_routes).toHaveProperty('by_route');
      expect(result.entry_routes.by_route).toHaveLength(5);

      const manualEntry = result.entry_routes.by_route.find(r => r.route_type === 'manual_entry');
      expect(manualEntry).toEqual({
        route_type: 'manual_entry',
        route_name: '手動仕訳',
        count: 1,
        total_amount: 100000,
        percentage: 20,
        journals: expect.arrayContaining([
          expect.objectContaining({
            journal_id: 'J001',
            amount: 100000
          })
        ])
      });

      const expenseRoute = result.entry_routes.by_route.find(r => r.route_type === 'expense_application');
      expect(expenseRoute).toEqual({
        route_type: 'expense_application',
        route_name: '経費精算',
        count: 1,
        total_amount: 5000,
        percentage: 20,
        journals: expect.arrayContaining([
          expect.objectContaining({
            journal_id: 'J002',
            amount: 5000
          })
        ])
      });
    });

    test('勘定科目別の計上ルート分析ができること', async () => {
      const mockJournalsData = {
        journals: [
          {
            id: 'J001',
            issue_date: '2024-01-15',
            type: 'manual',
            adjustment: false,
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 100000
              }
            ]
          },
          {
            id: 'J002',
            issue_date: '2024-01-20',
            type: 'deal',
            adjustment: false,
            deal_id: 123,
            details: [
              {
                account_item_id: 200,
                account_item: { name: '売上高' },
                entry_side: 'credit',
                amount: 200000
              }
            ]
          }
        ]
      };

      mockGetJournals.mockResolvedValue(mockJournalsData);

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        group_by_account: true
      };

      const result = await analyzeEntryRoutes(params);

      expect(result.entry_routes).toHaveProperty('by_account');
      expect(result.entry_routes.by_account).toHaveLength(1);

      const salesAccount = result.entry_routes.by_account[0];
      expect(salesAccount).toEqual({
        account_item_id: 200,
        account_item_name: '売上高',
        routes: [
          {
            route_type: 'manual_entry',
            route_name: '手動仕訳',
            count: 1,
            amount: 100000
          },
          {
            route_type: 'deal',
            route_name: '取引',
            count: 1,
            amount: 200000
          }
        ],
        total_amount: 300000
      });
    });

    test('取引先別の計上ルート分析ができること', async () => {
      const mockJournalsData = {
        journals: [
          {
            id: 'J001',
            issue_date: '2024-01-15',
            type: 'manual',
            partner_id: 1001,
            partner: { name: 'A社' },
            details: [
              {
                account_item_id: 200,
                entry_side: 'credit',
                amount: 100000,
                partner_id: 1001,
                partner: { name: 'A社' }
              }
            ]
          },
          {
            id: 'J002',
            issue_date: '2024-01-20',
            type: 'deal',
            deal_id: 123,
            partner_id: 1001,
            partner: { name: 'A社' },
            details: [
              {
                account_item_id: 200,
                entry_side: 'credit',
                amount: 200000,
                partner_id: 1001,
                partner: { name: 'A社' }
              }
            ]
          }
        ]
      };

      mockGetJournals.mockResolvedValue(mockJournalsData);

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        group_by_partner: true
      };

      const result = await analyzeEntryRoutes(params);

      expect(result.entry_routes).toHaveProperty('by_partner');
      expect(result.entry_routes.by_partner).toHaveLength(1);

      const partnerA = result.entry_routes.by_partner[0];
      expect(partnerA).toEqual({
        partner_id: 1001,
        partner_name: 'A社',
        routes: [
          {
            route_type: 'manual_entry',
            route_name: '手動仕訳',
            count: 1,
            amount: 100000
          },
          {
            route_type: 'deal',
            route_name: '取引',
            count: 1,
            amount: 200000
          }
        ],
        total_amount: 300000
      });
    });

    test('データがない場合でも正しく処理できること', async () => {
      mockGetJournals.mockResolvedValue({ journals: [] });

      const params = {
        company_id: '12345',
        start_date: '2024-01-01',
        end_date: '2024-01-31'
      };

      const result = await analyzeEntryRoutes(params);

      expect(result.entry_routes.summary).toEqual({
        total_count: 0,
        manual_entry_count: 0,
        expense_application_count: 0,
        bank_transfer_count: 0,
        deal_count: 0,
        adjustment_count: 0
      });
      expect(result.entry_routes.by_route).toEqual([]);
    });
  });
});