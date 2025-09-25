import { getJournals, getAccountItems } from './freeeClient.js';

export async function getMonthlyTrends(params) {
  const { company_id, start_date, end_date, group_by_section } = params;

  const [journalsData, accountItemsData] = await Promise.all([
    getJournals({ 
      company_id, 
      start_date, 
      end_date,
      download_type: 'csv'  // csvタイプを使用
    }),
    getAccountItems({ company_id })
  ]);

  const journals = journalsData.journals || [];
  const accountItems = accountItemsData.account_items || [];

  if (journals.length === 0) {
    return {
      monthly_trends: [],
      metadata: {
        company_id,
        period: {
          start: start_date,
          end: end_date
        },
        generated_at: new Date().toISOString()
      }
    };
  }

  const accountItemMap = new Map();
  accountItems.forEach(item => {
    accountItemMap.set(item.id, item);
  });

  const monthlyData = new Map();

  journals.forEach(journal => {
    if (!journal.issue_date || !journal.details) return;

    const month = journal.issue_date.substring(0, 7);
    
    if (!monthlyData.has(month)) {
      monthlyData.set(month, {
        accounts: new Map(),
        sections: group_by_section ? new Map() : null
      });
    }

    const monthData = monthlyData.get(month);

    journal.details.forEach(detail => {
      const accountId = detail.account_item_id;
      const amount = detail.amount || 0;
      const side = detail.entry_side;
      const sectionId = detail.section_id;

      if (!monthData.accounts.has(accountId)) {
        monthData.accounts.set(accountId, {
          debit_amount: 0,
          credit_amount: 0
        });
      }

      const accountData = monthData.accounts.get(accountId);
      if (side === 'debit') {
        accountData.debit_amount += amount;
      } else if (side === 'credit') {
        accountData.credit_amount += amount;
      }

      if (group_by_section && sectionId) {
        if (!monthData.sections.has(sectionId)) {
          monthData.sections.set(sectionId, {
            total_debit: 0,
            total_credit: 0,
            accounts: new Map()
          });
        }

        const sectionData = monthData.sections.get(sectionId);
        if (side === 'debit') {
          sectionData.total_debit += amount;
        } else if (side === 'credit') {
          sectionData.total_credit += amount;
        }

        if (!sectionData.accounts.has(accountId)) {
          sectionData.accounts.set(accountId, {
            debit_amount: 0,
            credit_amount: 0
          });
        }

        const sectionAccountData = sectionData.accounts.get(accountId);
        if (side === 'debit') {
          sectionAccountData.debit_amount += amount;
        } else if (side === 'credit') {
          sectionAccountData.credit_amount += amount;
        }
      }
    });
  });

  const monthly_trends = Array.from(monthlyData.entries()).map(([month, data]) => {
    const accounts = Array.from(data.accounts.entries()).map(([accountId, amounts]) => {
      const accountItem = accountItemMap.get(accountId);
      return {
        account_item_id: accountId,
        account_item_name: accountItem ? accountItem.name : 'Unknown',
        debit_amount: amounts.debit_amount,
        credit_amount: amounts.credit_amount,
        balance: amounts.debit_amount - amounts.credit_amount
      };
    });

    const total_debit = accounts.reduce((sum, acc) => sum + acc.debit_amount, 0);
    const total_credit = accounts.reduce((sum, acc) => sum + acc.credit_amount, 0);

    const result = {
      month,
      accounts,
      total_debit,
      total_credit
    };

    if (group_by_section && data.sections) {
      result.sections = Array.from(data.sections.entries()).map(([sectionId, sectionData]) => {
        return {
          section_id: sectionId,
          total_debit: sectionData.total_debit,
          total_credit: sectionData.total_credit,
          accounts: Array.from(sectionData.accounts.entries()).map(([accountId, amounts]) => {
            const accountItem = accountItemMap.get(accountId);
            return {
              account_item_id: accountId,
              account_item_name: accountItem ? accountItem.name : 'Unknown',
              debit_amount: amounts.debit_amount,
              credit_amount: amounts.credit_amount,
              balance: amounts.debit_amount - amounts.credit_amount
            };
          })
        };
      });
    }

    return result;
  });

  monthly_trends.sort((a, b) => a.month.localeCompare(b.month));

  return {
    monthly_trends,
    metadata: {
      company_id,
      period: {
        start: start_date,
        end: end_date
      },
      generated_at: new Date().toISOString()
    }
  };
}