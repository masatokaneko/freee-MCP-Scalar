import { getJournals, getPartners } from './freeeClient.js';

export async function getPartnerYearlySummary(params) {
  const { 
    company_id, 
    fiscal_year, 
    start_date, 
    end_date,
    group_by_account,
    sort_by,
    include_zero
  } = params;

  // Determine the date range
  let dateStart, dateEnd;
  if (fiscal_year) {
    dateStart = `${fiscal_year}-01-01`;
    dateEnd = `${fiscal_year}-12-31`;
  } else if (start_date && end_date) {
    dateStart = start_date;
    dateEnd = end_date;
  } else {
    throw new Error('Either fiscal_year or both start_date and end_date are required');
  }

  // Fetch data in parallel
  const [journalsData, partnersData] = await Promise.all([
    getJournals({ company_id, start_date: dateStart, end_date: dateEnd }),
    getPartners({ company_id })
  ]);

  const journals = journalsData.journals || [];
  const partners = partnersData.partners || [];

  // Create partner map for quick lookup
  const partnerMap = new Map();
  partners.forEach(partner => {
    partnerMap.set(partner.id, {
      id: partner.id,
      name: partner.name,
      code: partner.code || ''
    });
  });

  // Initialize aggregation maps
  const partnerAggregation = new Map();

  // Process journals
  journals.forEach(journal => {
    if (!journal.details) return;

    const month = journal.issue_date.substring(0, 7);
    const monthNum = parseInt(journal.issue_date.substring(5, 7));
    const quarter = `Q${Math.ceil(monthNum / 3)}`;

    journal.details.forEach(detail => {
      const partnerId = detail.partner_id;
      if (!partnerId) return;

      // Initialize partner data if not exists
      if (!partnerAggregation.has(partnerId)) {
        const partnerInfo = partnerMap.get(partnerId) || {
          id: partnerId,
          name: detail.partner?.name || 'Unknown',
          code: ''
        };

        partnerAggregation.set(partnerId, {
          partner_id: partnerId,
          partner_name: partnerInfo.name,
          partner_code: partnerInfo.code,
          total_amount: 0,
          transaction_count: 0,
          monthly_breakdown: {},
          quarterly_breakdown: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
          account_breakdown: new Map(),
          is_revenue: false,
          is_expense: false
        });
      }

      const partnerData = partnerAggregation.get(partnerId);
      let amount = detail.amount || 0;

      // Determine if it's revenue or expense
      if (detail.entry_side === 'credit' && 
          detail.account_item_id >= 200 && detail.account_item_id < 300) {
        // Revenue account
        partnerData.is_revenue = true;
      } else if (detail.entry_side === 'debit' && 
                 detail.account_item_id >= 500 && detail.account_item_id < 600) {
        // Expense account
        partnerData.is_expense = true;
      } else {
        // Skip other account types for main aggregation
        amount = 0;
      }

      if (amount > 0) {
        // Update total amount and transaction count
        partnerData.total_amount += amount;
        partnerData.transaction_count++;

        // Update monthly breakdown
        if (!partnerData.monthly_breakdown[month]) {
          partnerData.monthly_breakdown[month] = 0;
        }
        partnerData.monthly_breakdown[month] += amount;

        // Update quarterly breakdown
        partnerData.quarterly_breakdown[quarter] += amount;

        // Update account breakdown if requested
        if (group_by_account) {
          const accountId = detail.account_item_id;
          const accountName = detail.account_item?.name || 'Unknown';
          
          if (!partnerData.account_breakdown.has(accountId)) {
            partnerData.account_breakdown.set(accountId, {
              account_item_id: accountId,
              account_item_name: accountName,
              amount: 0,
              transaction_count: 0
            });
          }
          
          const accountData = partnerData.account_breakdown.get(accountId);
          accountData.amount += amount;
          accountData.transaction_count++;
        }
      }
    });
  });

  // Add partners with no transactions if requested
  if (include_zero) {
    partners.forEach(partner => {
      if (!partnerAggregation.has(partner.id)) {
        partnerAggregation.set(partner.id, {
          partner_id: partner.id,
          partner_name: partner.name,
          partner_code: partner.code || '',
          total_amount: 0,
          transaction_count: 0,
          monthly_breakdown: {},
          quarterly_breakdown: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 },
          percentage_of_total: 0
        });
      }
    });
  }

  // Calculate totals
  let totalRevenue = 0;
  let totalExpense = 0;
  let grandTotal = 0;

  partnerAggregation.forEach(partner => {
    if (partner.is_revenue) {
      totalRevenue += partner.total_amount;
    }
    if (partner.is_expense) {
      totalExpense += partner.total_amount;
    }
    grandTotal += partner.total_amount;
  });

  // Convert to array and calculate percentages
  let partnerSummary = Array.from(partnerAggregation.values()).map(partner => {
    const summary = {
      partner_id: partner.partner_id,
      partner_name: partner.partner_name,
      partner_code: partner.partner_code,
      total_amount: partner.total_amount,
      transaction_count: partner.transaction_count,
      monthly_breakdown: partner.monthly_breakdown,
      quarterly_breakdown: partner.quarterly_breakdown,
      percentage_of_total: grandTotal > 0 ? 
        Number(((partner.total_amount / grandTotal) * 100).toFixed(2)) : 0
    };

    // Add account breakdown if requested
    if (group_by_account && partner.account_breakdown.size > 0) {
      summary.account_breakdown = Array.from(partner.account_breakdown.values());
    }

    // Remove internal flags
    delete partner.is_revenue;
    delete partner.is_expense;

    return summary;
  });

  // Sort partners if requested
  if (sort_by === 'amount_desc') {
    partnerSummary.sort((a, b) => b.total_amount - a.total_amount);
    // Add ranking
    partnerSummary.forEach((partner, index) => {
      partner.ranking = index + 1;
    });
  } else if (sort_by === 'amount_asc') {
    partnerSummary.sort((a, b) => a.total_amount - b.total_amount);
    partnerSummary.forEach((partner, index) => {
      partner.ranking = index + 1;
    });
  } else if (sort_by === 'name') {
    partnerSummary.sort((a, b) => a.partner_name.localeCompare(b.partner_name));
  }

  // Create result object
  const result = {
    partner_summary: partnerSummary,
    summary: {
      total_partners: partnerSummary.length,
      total_revenue: totalRevenue,
      total_expense: totalExpense,
      net_total: totalRevenue - totalExpense,
      average_per_partner: partnerSummary.length > 0 ? 
        Number((grandTotal / partnerSummary.length).toFixed(0)) : 0
    },
    metadata: {
      company_id,
      generated_at: new Date().toISOString()
    }
  };

  // Add period or fiscal year to metadata
  if (fiscal_year) {
    result.metadata.fiscal_year = fiscal_year;
  } else {
    result.metadata.period = {
      start: dateStart,
      end: dateEnd
    };
  }

  return result;
}