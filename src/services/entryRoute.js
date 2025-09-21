import { getJournals } from './freeeClient.js';

export async function analyzeEntryRoutes(params) {
  const {
    company_id,
    start_date,
    end_date,
    group_by_account,
    group_by_partner
  } = params;

  const journalsData = await getJournals({ 
    company_id, 
    start_date, 
    end_date,
    visible_tags: 'all',  // freee APIがサポートする詳細度パラメータ
    visible_ids: 'all'
  });
  const journals = journalsData.journals || [];

  // 計上ルートを判定する関数
  function determineRoute(journal) {
    if (journal.adjustment) {
      return {
        type: 'adjustment',
        name: '決算整理'
      };
    }

    if (journal.type === 'expense' || journal.expense_application_id) {
      return {
        type: 'expense_application',
        name: '経費精算'
      };
    }

    if (journal.type === 'transfer' || journal.walletable_id) {
      return {
        type: 'bank_transfer',
        name: '口座振替'
      };
    }

    if (journal.type === 'deal' || journal.deal_id) {
      return {
        type: 'deal',
        name: '取引'
      };
    }

    if (journal.type === 'manual' || journal.txn_number) {
      return {
        type: 'manual_entry',
        name: '手動仕訳'
      };
    }

    return {
      type: 'unknown',
      name: '不明'
    };
  }

  // 集計用のマップを初期化
  const routeCounts = new Map();
  const routeAmounts = new Map();
  const routeJournals = new Map();
  const accountRoutes = new Map();
  const partnerRoutes = new Map();

  let totalCount = 0;
  const summary = {
    total_count: 0,
    manual_entry_count: 0,
    expense_application_count: 0,
    bank_transfer_count: 0,
    deal_count: 0,
    adjustment_count: 0
  };

  // 仕訳データを処理
  journals.forEach(journal => {
    const route = determineRoute(journal);
    totalCount++;
    summary.total_count++;

    // ルート別カウント
    if (!routeCounts.has(route.type)) {
      routeCounts.set(route.type, 0);
      routeAmounts.set(route.type, 0);
      routeJournals.set(route.type, []);
    }

    routeCounts.set(route.type, routeCounts.get(route.type) + 1);

    // サマリーカウントを更新
    switch (route.type) {
      case 'manual_entry':
        summary.manual_entry_count++;
        break;
      case 'expense_application':
        summary.expense_application_count++;
        break;
      case 'bank_transfer':
        summary.bank_transfer_count++;
        break;
      case 'deal':
        summary.deal_count++;
        break;
      case 'adjustment':
        summary.adjustment_count++;
        break;
    }

    // 金額を集計（詳細から取得）
    let journalAmount = 0;
    if (journal.details && journal.details.length > 0) {
      journal.details.forEach(detail => {
        if (detail.entry_side === 'credit') {
          journalAmount += detail.amount || 0;

          // 勘定科目別の集計
          if (group_by_account && detail.account_item_id) {
            const accountId = detail.account_item_id;
            const accountName = detail.account_item?.name || 'Unknown';

            if (!accountRoutes.has(accountId)) {
              accountRoutes.set(accountId, {
                account_item_id: accountId,
                account_item_name: accountName,
                routes: new Map(),
                total_amount: 0
              });
            }

            const accountData = accountRoutes.get(accountId);
            if (!accountData.routes.has(route.type)) {
              accountData.routes.set(route.type, {
                route_type: route.type,
                route_name: route.name,
                count: 0,
                amount: 0
              });
            }

            const routeData = accountData.routes.get(route.type);
            routeData.count++;
            routeData.amount += detail.amount || 0;
            accountData.total_amount += detail.amount || 0;
          }

          // 取引先別の集計
          if (group_by_partner && detail.partner_id) {
            const partnerId = detail.partner_id;
            const partnerName = detail.partner?.name || journal.partner?.name || 'Unknown';

            if (!partnerRoutes.has(partnerId)) {
              partnerRoutes.set(partnerId, {
                partner_id: partnerId,
                partner_name: partnerName,
                routes: new Map(),
                total_amount: 0
              });
            }

            const partnerData = partnerRoutes.get(partnerId);
            if (!partnerData.routes.has(route.type)) {
              partnerData.routes.set(route.type, {
                route_type: route.type,
                route_name: route.name,
                count: 0,
                amount: 0
              });
            }

            const routeData = partnerData.routes.get(route.type);
            routeData.count++;
            routeData.amount += detail.amount || 0;
            partnerData.total_amount += detail.amount || 0;
          }
        } else if (detail.entry_side === 'debit' && 
                   ['expense_application', 'adjustment'].includes(route.type)) {
          // 経費や決算整理の場合はデビット側も集計
          journalAmount += detail.amount || 0;
        }
      });
    }

    routeAmounts.set(route.type, routeAmounts.get(route.type) + journalAmount);
    routeJournals.get(route.type).push({
      journal_id: journal.id,
      issue_date: journal.issue_date,
      amount: journalAmount
    });
  });

  // ルート別集計結果を作成
  const byRoute = [];
  const routeTypeOrder = ['manual_entry', 'expense_application', 'bank_transfer', 'deal', 'adjustment', 'unknown'];
  const routeNames = {
    manual_entry: '手動仕訳',
    expense_application: '経費精算',
    bank_transfer: '口座振替',
    deal: '取引',
    adjustment: '決算整理',
    unknown: '不明'
  };

  routeTypeOrder.forEach(routeType => {
    if (routeCounts.has(routeType)) {
      byRoute.push({
        route_type: routeType,
        route_name: routeNames[routeType],
        count: routeCounts.get(routeType),
        total_amount: routeAmounts.get(routeType),
        percentage: totalCount > 0 ? (routeCounts.get(routeType) / totalCount) * 100 : 0,
        journals: routeJournals.get(routeType)
      });
    }
  });

  const result = {
    entry_routes: {
      summary,
      by_route: byRoute
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

  // 勘定科目別集計を追加
  if (group_by_account) {
    result.entry_routes.by_account = Array.from(accountRoutes.values()).map(account => ({
      account_item_id: account.account_item_id,
      account_item_name: account.account_item_name,
      routes: Array.from(account.routes.values()),
      total_amount: account.total_amount
    }));
  }

  // 取引先別集計を追加
  if (group_by_partner) {
    result.entry_routes.by_partner = Array.from(partnerRoutes.values()).map(partner => ({
      partner_id: partner.partner_id,
      partner_name: partner.partner_name,
      routes: Array.from(partner.routes.values()),
      total_amount: partner.total_amount
    }));
  }

  return result;
}