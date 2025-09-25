import { config } from 'dotenv';
import { getJournals, getAccountItems } from '../../src/services/freeeClient.js';
import fs from 'fs';
import path from 'path';

config();

async function generateMonthlyPLReport(startDate, endDate) {
  const companyId = process.env.FREEE_COMPANY_ID;
  
  console.log(`\n損益計算書月次推移表を生成中...`);
  console.log(`期間: ${startDate} ~ ${endDate}`);
  console.log(`会社ID: ${companyId}`);
  
  try {
    console.log('\n1. 仕訳データを取得中...');
    const [journalsData, accountItemsData] = await Promise.all([
      getJournals({
        company_id: companyId,
        start_date: startDate,
        end_date: endDate,
        download_type: 'generic'
      }),
      getAccountItems({ company_id: companyId })
    ]);

    const journals = journalsData.journals || [];
    const accountItems = accountItemsData.account_items || [];
    
    console.log(`  取得した仕訳数: ${journals.length}件`);
    console.log(`  勘定科目マスタ数: ${accountItems.length}件`);

    const accountItemMap = new Map();
    accountItems.forEach(item => {
      accountItemMap.set(item.id, item);
    });

    console.log('\n2. 月別・勘定科目別に集計中...');
    const monthlyData = new Map();

    journals.forEach(journal => {
      if (!journal.issue_date || !journal.details) return;

      const month = journal.issue_date.substring(0, 7);
      
      if (!monthlyData.has(month)) {
        monthlyData.set(month, new Map());
      }

      const monthData = monthlyData.get(month);

      journal.details.forEach(detail => {
        const accountId = detail.account_item_id;
        const amount = detail.amount || 0;
        const side = detail.entry_side;
        
        if (!accountId) return;

        if (!monthData.has(accountId)) {
          monthData.set(accountId, {
            debit: 0,
            credit: 0,
            accountInfo: accountItemMap.get(accountId) || { name: 'Unknown', categories: ['その他'] }
          });
        }

        const accountData = monthData.get(accountId);
        if (side === 'debit') {
          accountData.debit += amount;
        } else if (side === 'credit') {
          accountData.credit += amount;
        }
      });
    });

    console.log('\n3. 月次推移表を生成中...');
    let markdown = '# 損益計算書 月次推移表\n\n';
    markdown += `期間: ${startDate} ~ ${endDate}\n\n`;
    
    const sortedMonths = Array.from(monthlyData.keys()).sort();
    const accountMonthlyTrends = new Map();
    
    sortedMonths.forEach(month => {
      const monthData = monthlyData.get(month);
      
      monthData.forEach((data, accountId) => {
        if (!accountMonthlyTrends.has(accountId)) {
          accountMonthlyTrends.set(accountId, {
            accountInfo: data.accountInfo,
            monthlyData: new Map()
          });
        }
        
        const accountInfo = data.accountInfo;
        const categoryName = accountInfo.categories?.[0] || 'その他';
        let netAmount = 0;
        
        if (['売上高', '売上総利益', 'その他収益', '営業外収益', '特別利益'].includes(categoryName)) {
          netAmount = data.credit - data.debit;
        } else {
          netAmount = data.debit - data.credit;
        }
        
        accountMonthlyTrends.get(accountId).monthlyData.set(month, netAmount);
      });
    });
    
    const categorizedAccounts = new Map();
    accountMonthlyTrends.forEach((trend, accountId) => {
      const category = trend.accountInfo.categories?.[0] || 'その他';
      if (!categorizedAccounts.has(category)) {
        categorizedAccounts.set(category, []);
      }
      categorizedAccounts.get(category).push({
        id: accountId,
        name: trend.accountInfo.name,
        monthlyData: trend.monthlyData
      });
    });
    
    const categoryOrder = [
      '売上高', '売上原価', '売上総利益',
      '販売費及び一般管理費', '営業利益',
      'その他収益', '営業外収益', '営業外費用', '経常利益',
      '特別利益', '特別損失', '税引前当期純利益',
      'その他'
    ];
    
    markdown += '## 勘定科目別月次推移表\n\n';
    markdown += '| カテゴリー | 勘定科目 |';
    sortedMonths.forEach(month => {
      markdown += ` ${month} |`;
    });
    markdown += '\n';
    markdown += '|------------|----------|';
    sortedMonths.forEach(() => {
      markdown += '----------:|';
    });
    markdown += '\n';
    
    categoryOrder.forEach(category => {
      if (!categorizedAccounts.has(category)) return;
      
      const accounts = categorizedAccounts.get(category);
      accounts.sort((a, b) => a.name.localeCompare(b.name));
      
      accounts.forEach(account => {
        markdown += `| ${category} | ${account.name} |`;
        sortedMonths.forEach(month => {
          const amount = account.monthlyData.get(month) || 0;
          markdown += ` ${amount.toLocaleString()} |`;
        });
        markdown += '\n';
      });
    });
    
    const outputDir = path.resolve(process.cwd(), 'private_reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const filename = `legacy_monthly_pl_${startDate}_${endDate}.md`;
    fs.writeFileSync(path.join(outputDir, filename), markdown, 'utf8');
    
    console.log(`\n✅ レポートを生成しました: ${path.join(outputDir, filename)}`);
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message);
    if (error.response) {
      console.error('APIレスポンス:', error.response);
    }
    throw error;
  }
}

const [startDate = '2025-01-01', endDate = '2025-02-28'] = process.argv.slice(2);

generateMonthlyPLReport(startDate, endDate).catch(console.error);
