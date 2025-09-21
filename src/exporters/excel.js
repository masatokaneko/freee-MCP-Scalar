import XLSX from 'xlsx';

const SHEET_LIMIT = 31;

function appendSheet(workbook, rows, sheetName) {
  const safeName = (sheetName && sheetName.substring(0, SHEET_LIMIT)) || 'Sheet';
  const worksheet = Array.isArray(rows)
    ? XLSX.utils.json_to_sheet(rows)
    : XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
}

function appendMetadata(workbook, metadata) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return;
  }
  appendSheet(workbook, [metadata], 'Metadata');
}

function handleJournals(workbook, data) {
  const journalData = data.data || data.journals || [];

  if (journalData.length === 0) {
    appendSheet(workbook, [['No data']], 'Journals');
    return;
  }

  const sample = journalData[0];

  if (sample.debit_account_item !== undefined || sample.credit_account_item !== undefined) {
    const rows = journalData.map(row => ({
      no: row.no || '',
      transaction_date: row.transaction_date || row.date || '',
      slip_id: row.slip_id || row.entryId || '',
      slip_number: row.slip_number || '',
      debit_account_item: row.debit_account_item || '',
      debit_amount: row.debit_amount ?? '',
      credit_account_item: row.credit_account_item || '',
      credit_amount: row.credit_amount ?? '',
      content: row.content || row.memo || '',
      created_at: row.created_at || '',
      updated_at: row.updated_at || ''
    }));
    appendSheet(workbook, rows, 'Journals');
    return;
  }

  if (sample.debit_items || sample.credit_items) {
    appendSheet(workbook, journalData, 'Journals');
    return;
  }

  appendSheet(workbook, journalData, 'Journals');
}

function handleVariance(workbook, data) {
  if (data.variance_analysis) {
    const analysis = data.variance_analysis.by_account || data.variance_analysis;
    appendSheet(workbook, analysis, 'Variance Analysis');
  }
  if (data.summary) {
    appendSheet(workbook, [data.summary], 'Summary');
  }
}

function handleTrends(workbook, data) {
  const trends = data.monthly_trends || data.trends || [];
  if (trends.length > 0) {
    appendSheet(workbook, trends, 'Monthly Trends');
  }

  const monthlyData = data.monthly_data || {};
  Object.entries(monthlyData).forEach(([month, rows]) => {
    appendSheet(workbook, rows, `Month ${month}`);
  });
}

function handleEntryRoutes(workbook, data) {
  const routes = data.entry_routes || data.routes || {};

  if (routes.by_route) {
    appendSheet(workbook, routes.by_route, 'Entry Routes');
  }
  if (routes.summary) {
    appendSheet(workbook, [routes.summary], 'Summary');
  }
  if (routes.by_account) {
    Object.entries(routes.by_account).forEach(([accountName, rows]) => {
      appendSheet(workbook, rows, accountName || 'Account');
    });
  }
  if (routes.by_partner) {
    Object.entries(routes.by_partner).forEach(([partnerName, rows]) => {
      appendSheet(workbook, rows, partnerName || 'Partner');
    });
  }
}

function handleBudgets(workbook, data) {
  const budgetData = data.budget_data || {};
  const budgets = budgetData.budgets || [];
  if (budgets.length === 0) {
    return;
  }

  const annualRows = budgets.map(budget => ({
    account_item_id: budget.account_item_id,
    account_item_name: budget.account_item_name,
    annual_budget: budget.annual_budget ?? Object.values(budget.monthly_budgets || {}).reduce((sum, value) => sum + value, 0)
  }));
  appendSheet(workbook, annualRows, 'Annual Budgets');

  const months = new Set();
  budgets.forEach(budget => {
    Object.keys(budget.monthly_budgets || {}).forEach(month => months.add(month));
  });

  const sortedMonths = Array.from(months).sort();
  if (sortedMonths.length > 0) {
    const monthlyRows = budgets.map(budget => {
      const row = {
        account_item_id: budget.account_item_id,
        account_item_name: budget.account_item_name
      };
      sortedMonths.forEach(month => {
        row[month] = budget.monthly_budgets?.[month] ?? 0;
      });
      return row;
    });
    appendSheet(workbook, monthlyRows, 'Monthly Budgets');
  }
}

function handleBudgetComparison(workbook, data) {
  if (data.comparison) {
    appendSheet(workbook, data.comparison, 'Budget Comparison');
  }

  if (data.monthly_comparison) {
    data.monthly_comparison.forEach(monthData => {
      appendSheet(workbook, monthData.comparisons || [], `Month ${monthData.month}`);
      if (monthData.summary) {
        appendSheet(workbook, [monthData.summary], `Summary ${monthData.month}`);
      }
    });
  }

  if (data.summary) {
    appendSheet(workbook, [data.summary], 'Summary');
  }
}

function handlePartnerSummary(workbook, data) {
  const partners = data.partner_summary || data.partners || [];
  if (partners.length > 0) {
    appendSheet(workbook, partners, 'Partner Summary');
  }
  if (data.summary) {
    appendSheet(workbook, [data.summary], 'Summary');
  }
}

function handleAuditLogs(workbook, data) {
  if (data.logs) {
    const rows = data.logs.map(log => ({
      id: log.id,
      timestamp: new Date(log.timestamp).toISOString(),
      event_type: log.event_type,
      user_id: log.user_id,
      method: log.method,
      endpoint: log.endpoint,
      response_status: log.response_status,
      response_time: log.response_time
    }));
    appendSheet(workbook, rows, 'Audit Logs');
  }
}

function handleAuditStats(workbook, data) {
  const stats = data.statistics || {};
  const summaries = stats.summaries || data.summaries || [];
  if (summaries.length > 0) {
    appendSheet(workbook, summaries, 'Statistics');
  }
  if (stats.totals || data.totals) {
    appendSheet(workbook, [stats.totals || data.totals], 'Totals');
  }
}

const handlers = {
  journals: handleJournals,
  variance: handleVariance,
  trends: handleTrends,
  'entry-routes': handleEntryRoutes,
  budgets: handleBudgets,
  'budget-comparison': handleBudgetComparison,
  'partner-summary': handlePartnerSummary,
  'audit-logs': handleAuditLogs,
  'audit-stats': handleAuditStats
};

export function createWorkbook(data, reportType) {
  const workbook = XLSX.utils.book_new();
  const handler = handlers[reportType] || ((wb, value) => appendSheet(wb, value, 'Data'));
  handler(workbook, data || {});

  if (data?.metadata) {
    appendMetadata(workbook, data.metadata);
  }

  return workbook;
}

export default {
  createWorkbook
};
