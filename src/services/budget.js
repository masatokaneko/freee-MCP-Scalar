import { getJournals, getAccountItems } from './freeeClient.js';
import { 
  initializeBudgetStorage, 
  saveBudgetData, 
  getBudgetData, 
  getBudgetMap 
} from './budgetStorage.js';

// Initialize budget storage on module load
initializeBudgetStorage().catch(console.error);

export async function saveBudget(budgetData) {
  const { company_id, fiscal_year, budgets, created_by } = budgetData;

  if (!fiscal_year) {
    throw new Error('fiscal_year is required');
  }

  if (!company_id) {
    throw new Error('company_id is required');
  }

  if (!budgets || !Array.isArray(budgets)) {
    throw new Error('budgets array is required');
  }

  // Save to database
  return saveBudgetData({
    company_id,
    fiscal_year,
    budgets,
    created_by
  });
}

export async function getBudget(params) {
  const { company_id, fiscal_year, start_date, end_date } = params;

  // Get from database
  const budgetData = await getBudgetData({
    company_id,
    fiscal_year,
    start_date,
    end_date
  });

  // If no data found, return empty result
  if (!budgetData.budgets || budgetData.budgets.length === 0) {
    // Return structure with empty budgets
    if (fiscal_year) {
      return {
        budget_data: {
          fiscal_year,
          budgets: []
        }
      };
    } else {
      return {
        budget_data: {
          period: {
            start: start_date,
            end: end_date
          },
          budgets: []
        }
      };
    }
  }

  return {
    budget_data: budgetData
  };
}

export async function compareBudgetToActual(params) {
  const { company_id, start_date, end_date, group_by } = params;

  // Get actual data from Freee (予実比較にはdetailsフィールドが必要)
  const [journalsData, accountItemsData] = await Promise.all([
    getJournals({ 
      company_id, 
      start_date, 
      end_date,
      visible_tags: 'all',  // freee APIがサポートする詳細度パラメータ
      visible_ids: 'all'
    }),
    getAccountItems({ company_id })
  ]);

  const journals = journalsData.journals || [];
  const accountItems = accountItemsData.account_items || [];

  // Get budget data from database
  const fiscalYear = new Date(start_date).getFullYear();
  const budgetMap = await getBudgetMap({
    company_id,
    fiscal_year: fiscalYear
  });
  
  // Create account map for quick lookup
  const accountMap = new Map();
  accountItems.forEach(item => {
    accountMap.set(item.id, item.name);
  });

  const hasBudgetData = budgetMap.size > 0;

  // Aggregate actual data
  const actualData = new Map();
  const monthlyActualData = new Map();

  journals.forEach(journal => {
    const month = journal.issue_date.substring(0, 7);
    
    if (journal.details) {
      journal.details.forEach(detail => {
        const accountId = detail.account_item_id;
        const accountName = detail.account_item?.name || accountMap.get(accountId) || 'Unknown';
        const amount = detail.amount || 0;

        // Aggregate total
        if (!actualData.has(accountId)) {
          actualData.set(accountId, {
            account_item_id: accountId,
            account_item_name: accountName,
            amount: 0
          });
        }

        const accountActual = actualData.get(accountId);
        if ((detail.entry_side === 'credit' && [200, 201, 202].includes(Math.floor(accountId / 100) * 100)) ||
            (detail.entry_side === 'debit' && ![200, 201, 202].includes(Math.floor(accountId / 100) * 100))) {
          accountActual.amount += amount;
        }

        // Aggregate monthly if needed
        if (group_by === 'month') {
          if (!monthlyActualData.has(month)) {
            monthlyActualData.set(month, new Map());
          }

          const monthData = monthlyActualData.get(month);
          if (!monthData.has(accountId)) {
            monthData.set(accountId, {
              account_item_id: accountId,
              account_item_name: accountName,
              amount: 0
            });
          }

          const monthAccountActual = monthData.get(accountId);
          if ((detail.entry_side === 'credit' && [200, 201, 202].includes(Math.floor(accountId / 100) * 100)) ||
              (detail.entry_side === 'debit' && ![200, 201, 202].includes(Math.floor(accountId / 100) * 100))) {
            monthAccountActual.amount += amount;
          }
        }
      });
    }
  });

  // Compare budget vs actual
  const comparison = [];
  let totalBudget = 0;
  let totalActual = 0;

  // Get all account IDs (from both budget and actual)
  const allAccountIds = new Set([...budgetMap.keys(), ...actualData.keys()]);

  allAccountIds.forEach(accountId => {
    const budget = budgetMap.get(accountId);
    const actual = actualData.get(accountId);
    
    const accountName = actual?.account_item_name || 
                       budget?.account_item_name || 
                       accountMap.get(accountId) || 
                       'Unknown';

    // Calculate budget amount for the period
    let budgetAmount = 0;
    if (budget && budget.monthly_budgets) {
      // Get the specific month from the date range
      const startMonth = start_date.substring(0, 7);
      const endMonth = end_date.substring(0, 7);
      
      Object.entries(budget.monthly_budgets).forEach(([month, amount]) => {
        if (month >= startMonth && month <= endMonth) {
          budgetAmount += amount;
        }
      });
    }

    const actualAmount = actual?.amount || 0;
    const variance = actualAmount - budgetAmount;
    const varianceRate = budgetAmount > 0 ? Number(((variance / budgetAmount) * 100).toFixed(2)) : null;
    const achievementRate = budgetAmount > 0 ? Number(((actualAmount / budgetAmount) * 100).toFixed(2)) : null;

    comparison.push({
      account_item_id: accountId,
      account_item_name: accountName,
      budget_amount: budgetAmount,
      actual_amount: actualAmount,
      variance: variance,
      variance_rate: varianceRate,
      achievement_rate: achievementRate
    });

    totalBudget += budgetAmount;
    totalActual += actualAmount;
  });

  const result = {
    comparison,
    summary: {
      total_budget: totalBudget,
      total_actual: totalActual,
      total_variance: totalActual - totalBudget,
      overall_achievement_rate: totalBudget > 0 ? Number(((totalActual / totalBudget) * 100).toFixed(2)) : null
    },
    metadata: {
      company_id,
      period: {
        start: start_date,
        end: end_date
      },
      generated_at: new Date().toISOString()
    }
  };

  // Add note if no budget data found
  if (!hasBudgetData || budgetMap.size === 0) {
    result.metadata.notes = ['No budget data found for some accounts'];
  }

  // Add monthly comparison if requested
  if (group_by === 'month') {
    const monthlyComparison = [];
    const months = Array.from(monthlyActualData.keys()).sort();

    months.forEach(month => {
      const monthActuals = monthlyActualData.get(month);
      const monthComparisons = [];
      let monthTotalBudget = 0;
      let monthTotalActual = 0;

      // Only process accounts that have actual data for this month
      monthActuals.forEach((actual, accountId) => {
        const budget = budgetMap.get(accountId);
        
        const accountName = actual?.account_item_name || 
                           budget?.account_item_name || 
                           accountMap.get(accountId) || 
                           'Unknown';

        // Get budget for this specific month
        const budgetAmount = budget?.monthly_budgets?.[month] || 0;
        const actualAmount = actual?.amount || 0;
        
        const variance = actualAmount - budgetAmount;
        const varianceRate = budgetAmount > 0 ? Number(((variance / budgetAmount) * 100).toFixed(2)) : null;
        const achievementRate = budgetAmount > 0 ? Number(((actualAmount / budgetAmount) * 100).toFixed(2)) : null;

        monthComparisons.push({
          account_item_id: accountId,
          account_item_name: accountName,
          budget_amount: budgetAmount,
          actual_amount: actualAmount,
          variance: variance,
          variance_rate: varianceRate,
          achievement_rate: achievementRate
        });

        monthTotalBudget += budgetAmount;
        monthTotalActual += actualAmount;
      });

      monthlyComparison.push({
        month,
        comparisons: monthComparisons,
        summary: {
          total_budget: monthTotalBudget,
          total_actual: monthTotalActual,
          total_variance: monthTotalActual - monthTotalBudget,
          achievement_rate: monthTotalBudget > 0 ? Number(((monthTotalActual / monthTotalBudget) * 100).toFixed(2)) : null
        }
      });
    });

    result.monthly_comparison = monthlyComparison;
  }

  return result;
}