#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  fetchTrialPL,
  fetchTrialPLSections,
  fetchTrialPLItems,
  fetchTrialBS,
  downloadJournalsGenericV2,
} from '../src/services/freeeReports.js';
import { getSections, getItems } from '../src/services/freeeClient.js';
import generateMonthlyReport from './generate_pl_report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_REPORTS = [
  'trial_pl',
  'trial_bs',
  'pl_monthly',
  'pl_sections',
  'pl_items',
  'journals',
];

function parseArgs(argv) {
  const options = {
    start: null,
    end: null,
    outputDir: path.resolve('private_reports'),
    reports: new Set(DEFAULT_REPORTS),
  };

  argv.slice(2).forEach(arg => {
    if (!arg.startsWith('--')) return;
    const [key, value] = arg.split('=');
    switch (key) {
      case '--start':
        options.start = value;
        break;
      case '--end':
        options.end = value;
        break;
      case '--output-dir':
        options.outputDir = path.resolve(value);
        break;
      case '--reports':
        if (value) {
          options.reports = new Set(value.split(',').map(v => v.trim()).filter(Boolean));
        }
        break;
      default:
        console.warn(`Unknown option: ${key}`);
    }
  });

  if (!options.start || !options.end) {
    throw new Error('Please specify --start=YYYY-MM-DD and --end=YYYY-MM-DD');
  }

  return options;
}

function ensureCsvRow(row) {
  return row.map(value => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }).join(',');
}

async function writeCsv(outputPath, rows) {
  const csv = rows.map(ensureCsvRow).join('\n');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, csv, 'utf8');
  return outputPath;
}

function formatNumber(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function buildTrialPLRows(trialPl, { start, end }) {
  const rows = [[
    '開始日',
    '終了日',
    '階層レベル',
    '親勘定科目',
    '勘定科目カテゴリ',
    '勘定科目グループ',
    '勘定科目名',
    '勘定科目ID',
    '期首残高',
    '借方金額',
    '貸方金額',
    '期末残高',
    '構成比',
    '合計行'
  ]];

  (trialPl.balances || []).forEach(entry => {
    rows.push([
      start,
      end,
      entry.hierarchy_level || '',
      entry.parent_account_category_name || '',
      entry.account_category_name || '',
      entry.account_group_name || '',
      entry.account_item_name || entry.account_category_name || '',
      entry.account_item_id || '',
      formatNumber(entry.opening_balance),
      formatNumber(entry.debit_amount),
      formatNumber(entry.credit_amount),
      formatNumber(entry.closing_balance),
      entry.composition_ratio !== undefined ? entry.composition_ratio : '',
      entry.total_line ? 'TRUE' : 'FALSE'
    ]);
  });

  return rows;
}

function buildTrialBSRows(trialBs, { start, end }) {
  const rows = [[
    '開始日',
    '終了日',
    '階層レベル',
    '親勘定科目',
    '勘定科目カテゴリ',
    '勘定科目グループ',
    '勘定科目名',
    '勘定科目ID',
    '期首残高',
    '借方金額',
    '貸方金額',
    '期末残高',
    '構成比',
    '合計行'
  ]];

  (trialBs.balances || []).forEach(entry => {
    rows.push([
      start,
      end,
      entry.hierarchy_level || '',
      entry.parent_account_category_name || '',
      entry.account_category_name || '',
      entry.account_group_name || '',
      entry.account_item_name || entry.account_category_name || '',
      entry.account_item_id || '',
      formatNumber(entry.opening_balance),
      formatNumber(entry.debit_amount),
      formatNumber(entry.credit_amount),
      formatNumber(entry.closing_balance),
      entry.composition_ratio !== undefined ? entry.composition_ratio : '',
      entry.total_line ? 'TRUE' : 'FALSE'
    ]);
  });

  return rows;
}

function buildPLSectionRows(sectionResponses, { start, end }) {
  const header = [
    '開始日',
    '終了日',
    '部門ID',
    '部門名',
    '階層レベル',
    '親勘定科目',
    '勘定科目カテゴリ',
    '勘定科目名',
    '勘定科目ID',
    '借方金額',
    '貸方金額',
    '期末残高'
  ];
  const rows = [header];

  sectionResponses.forEach(({ section, balances }) => {
    (balances || []).forEach(entry => {
      const closing = formatNumber(entry.closing_balance);
      const debit = closing > 0 ? closing : 0;
      const credit = closing < 0 ? Math.abs(closing) : 0;

      rows.push([
        start,
        end,
        section.id,
        section.name,
        entry.hierarchy_level || '',
        entry.parent_account_category_name || '',
        entry.account_category_name || '',
        entry.account_item_name || entry.account_category_name || '',
        entry.account_item_id || '',
        debit,
        credit,
        closing
      ]);
    });
  });

  return rows;
}

function buildPLItemRows(trialPlItems, { start, end }) {
  const header = [
    '開始日',
    '終了日',
    '勘定科目名',
    '勘定科目ID',
    '品目名',
    '品目ID',
    '借方金額',
    '貸方金額',
    '期末残高',
    '構成比'
  ];

  const rows = [header];
  (trialPlItems.trial_pl_items?.items || []).forEach(item => {
    rows.push([
      start,
      end,
      item.account_item_name || '',
      item.account_item_id || '',
      item.item_name || '',
      item.item_id || '',
      formatNumber(item.debit_amount),
      formatNumber(item.credit_amount),
      formatNumber(item.closing_balance),
      item.composition_ratio !== undefined ? item.composition_ratio : ''
    ]);
  });

  return rows;
}

async function ensureMonthlyReports({ start, end, outputDir }) {
  const args = [
    'node',
    'scripts/generate_pl_report.js',
    `--start=${start}`,
    `--end=${end}`,
    '--group=account,partner,item,section',
    '--format=csv',
    '--pivot',
    `--output-dir=${outputDir}`
  ];
  await generateMonthlyReport(args);
  const tag = `${start.replace(/-/g, '')}_${end.replace(/-/g, '')}`;

  const renameMap = [
    [`pl_trial_balance_${tag}.csv`, 'pl_account_monthly.csv'],
    [`pl_trial_balance_pivot_${tag}.csv`, 'pl_account_pivot.csv'],
    [`pl_trial_balance_partner_${tag}.csv`, 'pl_partner_monthly.csv'],
    [`pl_trial_balance_partner_pivot_${tag}.csv`, 'pl_partner_pivot.csv'],
    [`pl_trial_balance_item_${tag}.csv`, 'pl_item_monthly.csv'],
    [`pl_trial_balance_item_pivot_${tag}.csv`, 'pl_item_pivot.csv'],
    [`pl_trial_balance_section_${tag}.csv`, 'pl_section_monthly.csv'],
    [`pl_trial_balance_section_pivot_${tag}.csv`, 'pl_section_pivot.csv'],
  ];

  for (const [source, target] of renameMap) {
    const sourcePath = path.join(outputDir, source);
    try {
      await fs.access(sourcePath);
      await fs.copyFile(sourcePath, path.join(outputDir, target));
    } catch {
      // ignore missing files
    }
  }
}

async function exportReports(options) {
  const { start, end, outputDir, reports } = options;
  await fs.mkdir(outputDir, { recursive: true });

  if (reports.has('pl_monthly') || reports.has('pl_sections') || reports.has('pl_items')) {
    await ensureMonthlyReports({ start, end, outputDir });
  }

  if (reports.has('trial_pl')) {
    const trialPl = await fetchTrialPL({
      companyId: process.env.FREEE_COMPANY_ID,
      startDate: start,
      endDate: end,
      displayType: 'group',
    });
    const rows = buildTrialPLRows(trialPl.trial_pl, { start, end });
    await writeCsv(path.join(outputDir, 'trial_pl_full.csv'), rows);
  }

  if (reports.has('trial_bs')) {
    const trialBs = await fetchTrialBS({
      companyId: process.env.FREEE_COMPANY_ID,
      startDate: start,
      endDate: end,
      displayType: 'group',
    });
    const rows = buildTrialBSRows(trialBs.trial_bs, { start, end });
    await writeCsv(path.join(outputDir, 'trial_bs_full.csv'), rows);
  }

  if (reports.has('pl_sections')) {
    const sectionsResponse = await getSections({ company_id: process.env.FREEE_COMPANY_ID });
    const sections = (sectionsResponse.sections || []).filter(section => section.available !== false);
    const sectionResults = [];
    for (const section of sections) {
      try {
        const result = await fetchTrialPLSections({
          companyId: process.env.FREEE_COMPANY_ID,
          startDate: start,
          endDate: end,
          sectionId: section.id,
        });
        sectionResults.push({ section, balances: result.trial_pl_sections?.balances || [] });
      } catch (error) {
        console.error(`Failed to fetch PL section for ${section.name}:`, error.message);
      }
    }
    const rows = buildPLSectionRows(sectionResults, { start, end });
    await writeCsv(path.join(outputDir, 'pl_sections_summary.csv'), rows);
  }

  if (reports.has('pl_items')) {
    try {
      await getItems({ company_id: process.env.FREEE_COMPANY_ID });
      const trialPlItems = await fetchTrialPLItems({
        companyId: process.env.FREEE_COMPANY_ID,
        startDate: start,
        endDate: end,
      });
      const rows = buildPLItemRows(trialPlItems, { start, end });
      await writeCsv(path.join(outputDir, 'pl_items_summary.csv'), rows);
    } catch (error) {
      console.warn('Skipping PL items summary:', error.message || error);
    }
  }

  if (reports.has('journals')) {
    const buffer = await downloadJournalsGenericV2({
      companyId: process.env.FREEE_COMPANY_ID,
      startDate: start,
      endDate: end,
    });
    const csv = Buffer.from(buffer).toString('utf8');
    await fs.writeFile(path.join(outputDir, 'journals_generic_v2.csv'), csv, 'utf8');
  }
}

async function main(argv = process.argv) {
  try {
    const options = parseArgs(argv);
    await exportReports(options);
    console.log('Reports exported to', options.outputDir);
  } catch (error) {
    console.error('Failed to export reports');
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export default main;
