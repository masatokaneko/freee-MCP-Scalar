import { describe, test, expect, beforeAll } from '@jest/globals';
import XLSX from 'xlsx';

let createWorkbook;

beforeAll(async () => {
  ({ createWorkbook } = await import('../../src/exporters/excel.js'));
});

describe('Excel エクスポータ', () => {
  test('monthly_trends データを "Monthly Trends" シートに出力する', () => {
    const data = {
      monthly_trends: [
        {
          month: '2024-01',
          total_debit: 0,
          total_credit: 1000,
          accounts: [
            {
              account_item_id: 200,
              account_item_name: '売上高',
              debit_amount: 0,
              credit_amount: 1000,
              balance: -1000
            }
          ]
        }
      ],
      metadata: {
        company_id: '12345',
        generated_at: '2024-03-10T12:00:00Z'
      }
    };

    const wb = createWorkbook(data, 'trends');
    expect(wb.SheetNames).toContain('Monthly Trends');
    const sheet = wb.Sheets['Monthly Trends'];
    const rows = XLSX.utils.sheet_to_json(sheet);
    expect(rows[0]).toMatchObject({
      month: '2024-01',
      total_debit: 0,
      total_credit: 1000
    });
  });

  test('entry_routes データを "Entry Routes" シートに出力する', () => {
    const data = {
      entry_routes: {
        summary: {
          total_count: 10
        },
        by_route: [
          {
            route_type: 'manual_entry',
            route_name: '手動仕訳',
            count: 5,
            total_amount: 5000
          }
        ]
      },
      metadata: {
        period: {
          start: '2024-01-01',
          end: '2024-01-31'
        }
      }
    };

    const wb = createWorkbook(data, 'entry-routes');
    expect(wb.SheetNames).toContain('Entry Routes');
    const sheet = wb.Sheets['Entry Routes'];
    const rows = XLSX.utils.sheet_to_json(sheet);
    expect(rows[0]).toMatchObject({
      route_type: 'manual_entry',
      total_amount: 5000
    });
  });

  test('partner_summary データを "Partner Summary" シートに出力する', () => {
    const data = {
      partner_summary: [
        {
          partner_id: 'P-1',
          partner_name: '取引先A',
          total_amount: 120000,
          transaction_count: 12
        }
      ],
      summary: {
        total_partners: 1
      }
    };

    const wb = createWorkbook(data, 'partner-summary');
    expect(wb.SheetNames).toContain('Partner Summary');
    const sheet = wb.Sheets['Partner Summary'];
    const rows = XLSX.utils.sheet_to_json(sheet);
    expect(rows[0]).toMatchObject({
      partner_name: '取引先A',
      transaction_count: 12
    });
  });
});
