import { getJournals } from './freeeClient.js';

export async function analyzeVariance(params) {
  const {
    company_id,
    base_start_date,
    base_end_date,
    comparison_start_date,
    comparison_end_date,
    group_by_section
  } = params;

  // 基準期間と比較期間のデータを並列取得 (分析にはdetailsフィールドが必要)
  const [baseData, comparisonData] = await Promise.all([
    getJournals({ 
      company_id, 
      start_date: base_start_date, 
      end_date: base_end_date,
      visible_tags: 'all',  // freee APIがサポートする詳細度パラメータ
      visible_ids: 'all'
    }),
    getJournals({ 
      company_id, 
      start_date: comparison_start_date, 
      end_date: comparison_end_date,
      visible_tags: 'all',
      visible_ids: 'all'
    })
  ]);

  const baseJournals = baseData.journals || [];
  const comparisonJournals = comparisonData.journals || [];

  // 集計用のマップを初期化
  const baseAmounts = {
    byAccount: new Map(),
    byPartner: new Map(),
    byItem: new Map(),
    bySection: new Map(),
    total: 0
  };

  const comparisonAmounts = {
    byAccount: new Map(),
    byPartner: new Map(),
    byItem: new Map(),
    bySection: new Map(),
    total: 0
  };

  // 基準期間のデータを集計
  aggregateJournals(baseJournals, baseAmounts, group_by_section);

  // 比較期間のデータを集計
  aggregateJournals(comparisonJournals, comparisonAmounts, group_by_section);

  // 増減分析の結果を生成
  const variance_analysis = {
    summary: {
      base_period_total: baseAmounts.total,
      comparison_period_total: comparisonAmounts.total,
      total_variance: comparisonAmounts.total - baseAmounts.total,
      variance_rate: calculateVarianceRate(baseAmounts.total, comparisonAmounts.total)
    },
    by_account: [],
    by_partner: [],
    by_item: []
  };

  // 勘定科目別の増減分析
  variance_analysis.by_account = generateVarianceReport(
    baseAmounts.byAccount,
    comparisonAmounts.byAccount,
    'account'
  );

  // 取引先別の増減分析
  variance_analysis.by_partner = generateVarianceReport(
    baseAmounts.byPartner,
    comparisonAmounts.byPartner,
    'partner'
  );

  // 品目別の増減分析
  variance_analysis.by_item = generateVarianceReport(
    baseAmounts.byItem,
    comparisonAmounts.byItem,
    'item'
  );

  // 部門別の増減分析（オプション）
  if (group_by_section) {
    variance_analysis.by_section = generateVarianceReport(
      baseAmounts.bySection,
      comparisonAmounts.bySection,
      'section'
    );
  }

  return {
    variance_analysis,
    metadata: {
      company_id,
      base_period: {
        start: base_start_date,
        end: base_end_date
      },
      comparison_period: {
        start: comparison_start_date,
        end: comparison_end_date
      },
      generated_at: new Date().toISOString()
    }
  };
}

function aggregateJournals(journals, amounts, includeSection = false) {
  journals.forEach(journal => {
    if (!journal.details) return;

    journal.details.forEach(detail => {
      const amount = detail.amount || 0;
      const side = detail.entry_side;
      
      // クレジット側のみを売上として集計（簡略化のため）
      if (side === 'credit') {
        amounts.total += amount;

        // 勘定科目別
        const accountId = detail.account_item_id;
        if (accountId) {
          if (!amounts.byAccount.has(accountId)) {
            amounts.byAccount.set(accountId, {
              id: accountId,
              name: detail.account_item?.name || 'Unknown',
              amount: 0
            });
          }
          amounts.byAccount.get(accountId).amount += amount;
        }

        // 取引先別
        const partnerId = detail.partner_id;
        if (partnerId) {
          if (!amounts.byPartner.has(partnerId)) {
            amounts.byPartner.set(partnerId, {
              id: partnerId,
              name: detail.partner?.name || 'Unknown',
              amount: 0
            });
          }
          amounts.byPartner.get(partnerId).amount += amount;
        }

        // 品目別
        const itemId = detail.item_id;
        if (itemId) {
          if (!amounts.byItem.has(itemId)) {
            amounts.byItem.set(itemId, {
              id: itemId,
              name: detail.item?.name || 'Unknown',
              amount: 0
            });
          }
          amounts.byItem.get(itemId).amount += amount;
        }

        // 部門別
        if (includeSection) {
          const sectionId = detail.section_id;
          if (sectionId) {
            if (!amounts.bySection.has(sectionId)) {
              amounts.bySection.set(sectionId, {
                id: sectionId,
                name: detail.section?.name || 'Unknown',
                amount: 0
              });
            }
            amounts.bySection.get(sectionId).amount += amount;
          }
        }
      }
    });
  });
}

function generateVarianceReport(baseMap, comparisonMap, type) {
  const allKeys = new Set([...baseMap.keys(), ...comparisonMap.keys()]);
  const report = [];

  allKeys.forEach(key => {
    const baseData = baseMap.get(key);
    const comparisonData = comparisonMap.get(key);

    const baseAmount = baseData ? baseData.amount : 0;
    const comparisonAmount = comparisonData ? comparisonData.amount : 0;
    const variance = comparisonAmount - baseAmount;
    const variance_rate = calculateVarianceRate(baseAmount, comparisonAmount);

    const name = baseData?.name || comparisonData?.name || 'Unknown';

    let entry;
    if (type === 'account') {
      entry = {
        account_item_id: key,
        account_item_name: name,
        base_amount: baseAmount,
        comparison_amount: comparisonAmount,
        variance: variance,
        variance_rate: variance_rate
      };
    } else {
      entry = {
        [`${type}_id`]: key,
        [`${type}_name`]: name,
        base_amount: baseAmount,
        comparison_amount: comparisonAmount,
        variance: variance,
        variance_rate: variance_rate
      };
    }

    report.push(entry);
  });

  return report.sort((a, b) => b.variance - a.variance);
}

function calculateVarianceRate(base, comparison) {
  if (base === 0) {
    return comparison === 0 ? 0 : null;
  }
  return Math.round(((comparison - base) / base) * 10000) / 100;
}