#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { getAccountItems } from '../src/services/freeeClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = process.env.FREEE_REPORT_OUTPUT_DIR
  ? path.resolve(process.env.FREEE_REPORT_OUTPUT_DIR)
  : path.resolve(process.cwd(), 'private_reports');

const PL_PREFIXES = new Set([
  '負債及び純資産',
  '純資産',
  '株主資本',
  '利益剰余金',
  'その他利益剰余金',
  '当期純損益金額',
  '税引前当期純損益金額',
  '税引後当期純損益金額'
]);

const BALANCE_SHEET_ROOTS = new Set(['資産', '負債', '純資産']);

const PL_SEGMENTS = new Set([
  '当期純損益金額',
  '税引前当期純損益金額',
  '税引後当期純損益金額',
  '売上総損益金額',
  '営業損益金額',
  '経常損益金額',
  '特別利益',
  '特別損失',
  '営業外収益',
  '営業外費用',
  '販売管理費',
  '当期商品仕入',
  '法人税等',
  '法人税等調整額',
  '売上高'
]);

const REVENUE_KEYWORDS = [
  '売上',
  '収益',
  '割引',
  '受取',
  '利息',
  '配当',
  '雑収入',
  '利益'
];

const EXPENSE_KEYWORDS = [
  '費用',
  '原価',
  '損失',
  '支払',
  '仮払',
  '仕入',
  '償却',
  '手当',
  '給',
  '賞与',
  '福利',
  '旅費',
  '租税',
  '税',
  '賃借',
  '報酬',
  '引当金',
  '外注',
  '雑費'
];

const PL_INDICATOR_KEYWORDS = [
  '売上',
  '収益',
  '費用',
  '原価',
  '損失',
  '仕入',
  '税',
  '賞与',
  '償却',
  '旅費',
  '報酬',
  '手当'
];

const LEVEL1_ORDER = ['資産', '負債', '純資産', '収益', '費用', '振替', '未分類'];

const LEVEL2_ORDER = {
  '資産': ['流動資産', '固定資産', '投資その他の資産', '繰延資産', '諸口', '未分類'],
  '負債': ['流動負債', '固定負債', 'その他負債', '未分類'],
  '純資産': ['株主資本', '利益剰余金', 'その他純資産', '評価・換算差額等', '未分類'],
  '収益': ['売上高', '売上原価', '売上総損益金額', '営業損益金額', '経常損益金額', '営業外収益', '特別利益', '未分類'],
  '費用': ['売上原価', '販売管理費', '営業外費用', '法人税等', '製造原価', '未分類'],
  '振替': ['振替', '未分類'],
  '未分類': ['未分類']
};

const LEVEL3_ORDER = {
  '資産|流動資産': ['現金・預金', '売上債権', '棚卸資産', '他流動資産', '諸口', '未分類'],
  '資産|固定資産': ['有形固定資産', '無形固定資産', '投資その他の資産', '繰延資産', '未分類'],
  '資産|投資その他の資産': ['投資その他の資産', '未分類'],
  '資産|繰延資産': ['繰延資産', '未分類'],
  '負債|流動負債': ['仕入債務', '他流動負債', '未分類'],
  '負債|固定負債': ['固定負債', '未分類'],
  '純資産|株主資本': ['資本金', '資本剰余金', '利益剰余金', '自己株式', '未分類'],
  '収益|売上高': ['売上高', '未分類'],
  '収益|売上原価': ['売上原価', '当期商品仕入', '未分類'],
  '収益|経常損益金額': ['営業外収益', '営業外費用', '未分類'],
  '費用|販売管理費': ['販売管理費', '未分類'],
  '費用|売上原価': ['売上原価', '未分類']
};

function normalizeCategories(rawCategories) {
  if (!rawCategories) {
    return [];
  }
  if (Array.isArray(rawCategories)) {
    return rawCategories
      .map(cat => (typeof cat === 'string' ? cat.trim() : cat))
      .filter(Boolean);
  }
  if (typeof rawCategories === 'string') {
    return rawCategories
      .split('>')
      .map(cat => cat.trim())
      .filter(Boolean);
  }
  return [];
}

function isProfitLossByKeywords(account) {
  const combined = `${account.account_category || ''} ${account.name || ''}`;
  return PL_INDICATOR_KEYWORDS.some(keyword => combined.includes(keyword));
}

function pad(num, len) {
  return String(num).padStart(len, '0');
}

function sanitizeFreeeCode(code, fallback) {
  if (!code) return fallback;
  const trimmed = code.trim();
  if (!trimmed) return fallback;
  return /^[0-9A-Za-z\-]+$/.test(trimmed) ? trimmed : fallback;
}

function createFallbackCode(accountName, id) {
  const base = (accountName || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (base) {
    return `TEMP-${base.slice(0, 20)}`;
  }
  return `TEMP-${id}`;
}

function sortEntries(entries, orderList) {
  const list = Array.from(entries);
  return list.sort((a, b) => {
    if (!orderList || orderList.length === 0) {
      return a[0].localeCompare(b[0]);
    }
    const idxA = orderList.indexOf(a[0]);
    const idxB = orderList.indexOf(b[0]);
    const orderA = idxA === -1 ? orderList.length : idxA;
    const orderB = idxB === -1 ? orderList.length : idxB;
    if (orderA !== orderB) return orderA - orderB;
    return a[0].localeCompare(b[0]);
  });
}

function isProfitLossAccount(account, categories = null) {
  const normalized = categories ?? normalizeCategories(account.categories);
  if (normalized.some(cat => PL_SEGMENTS.has(cat))) {
    return true;
  }
  if (normalized.some(cat => BALANCE_SHEET_ROOTS.has(cat))) {
    return false;
  }
  return isProfitLossByKeywords(account);
}

function isExpenseAccount(account) {
  const combined = `${account.account_category || ''} ${account.name || ''}`;
  return EXPENSE_KEYWORDS.some(keyword => combined.includes(keyword));
}

function isRevenueAccount(account) {
  const combined = `${account.account_category || ''} ${account.name || ''}`;
  return REVENUE_KEYWORDS.some(keyword => combined.includes(keyword));
}

function deriveBalanceLevels(categories, accountCategory) {
  const normalized = categories;
  let startIndex = 0;
  let level1 = normalized[startIndex] || '未分類';

  if (level1 === '負債及び純資産' && normalized.length > 1) {
    startIndex += 1;
    level1 = normalized[startIndex] || level1;
  }

  const level2 = normalized[startIndex + 1] || accountCategory || level1;
  const level3 = normalized[startIndex + 2] || accountCategory || level2;
  const level4 = accountCategory || normalized[startIndex + 3] || level3;

  return { level1, level2, level3, level4 };
}

function deriveProfitLossLevels(account, categories, accountCategory) {
  const expense = isExpenseAccount(account);
  const revenue = isRevenueAccount(account);
  const level1 = expense && !revenue
    ? '費用'
    : (!expense && revenue ? '収益' : (expense ? '費用' : '収益'));

  const cleaned = categories
    .filter(cat => !PL_PREFIXES.has(cat))
    .filter(cat => !BALANCE_SHEET_ROOTS.has(cat))
    .filter(cat => cat !== level1);

  const level2 = cleaned[0] || accountCategory || level1;
  const level3 = cleaned[1] || cleaned[0] || accountCategory || level2;
  const level4 = accountCategory || cleaned[cleaned.length - 1] || level3;

  return { level1, level2, level3, level4 };
}

function deriveLevels(account) {
  const categories = normalizeCategories(account.categories);
  const accountCategory = account.account_category || '未分類';

  if (!isProfitLossAccount(account, categories)) {
    return deriveBalanceLevels(categories, accountCategory);
  }

  return deriveProfitLossLevels(account, categories, accountCategory);
}

function buildAccountCatalog(accountItems) {
  const level1Map = new Map();

  const getOrCreate = (map, key, factory) => {
    if (!map.has(key)) map.set(key, factory());
    return map.get(key);
  };

  for (const item of accountItems) {
    const levels = deriveLevels(item);
    const { level1, level2, level3, level4 } = levels;

    const l1 = getOrCreate(level1Map, level1, () => new Map());
    const l2 = getOrCreate(l1, level2, () => new Map());
    const l3 = getOrCreate(l2, level3, () => new Map());
    const l4 = getOrCreate(l3, level4, () => []);
    l4.push({ item, levels });
  }

  const level1Codes = new Map();
  const level2Codes = new Map();
  const level3Codes = new Map();
  const level4Codes = new Map();
  const accountCatalog = new Map();

  const sortedLevel1 = Array.from(level1Map.entries()).sort((a, b) => {
    const idxA = LEVEL1_ORDER.indexOf(a[0]);
    const idxB = LEVEL1_ORDER.indexOf(b[0]);
    const orderA = idxA === -1 ? LEVEL1_ORDER.length : idxA;
    const orderB = idxB === -1 ? LEVEL1_ORDER.length : idxB;
    if (orderA !== orderB) return orderA - orderB;
    return a[0].localeCompare(b[0]);
  });

  let l1Index = 1;
  for (const [level1, level2Map] of sortedLevel1) {
    const l1Code = pad(l1Index++, 2);
    level1Codes.set(level1, l1Code);

    const level2Order = LEVEL2_ORDER[level1];
    const sortedLevel2 = sortEntries(level2Map.entries(), level2Order);

    let l2Index = 1;
    for (const [level2, level3Map] of sortedLevel2) {
      const l2Code = pad(l2Index++, 2);
      level2Codes.set(`${level1}|${level2}`, l2Code);

      const level3Order = LEVEL3_ORDER[`${level1}|${level2}`];
      const sortedLevel3 = sortEntries(level3Map.entries(), level3Order);

      let l3Index = 1;
      for (const [level3, level4Map] of sortedLevel3) {
        const l3Code = pad(l3Index++, 2);
        level3Codes.set(`${level1}|${level2}|${level3}`, l3Code);

        let l4Index = 1;
        const sortedLevel4 = sortEntries(level4Map.entries(), null);
        for (const [level4, accounts] of sortedLevel4) {
          const l4Code = pad(l4Index++, 2);
          level4Codes.set(`${level1}|${level2}|${level3}|${level4}`, l4Code);

          let acctIndex = 1;
          for (const accountEntry of accounts.sort((a, b) => a.item.name.localeCompare(b.item.name))) {
            const account = accountEntry.item;
            const hierarchicalCode = [
              l1Code,
              l2Code,
              l3Code,
              l4Code,
              pad(acctIndex++, 3)
            ].join('-');

            const freeeCode = sanitizeFreeeCode(account.shortcut_num, `ACCT-${account.id}`);

            accountCatalog.set(account.id, {
              hierarchical_code: hierarchicalCode,
              freee_code: freeeCode,
              name: account.name,
              account_category: account.account_category || '',
              level1,
              level2,
              level3,
              level4,
              group_id: account.group_id || '',
              group_name: account.group_name || '',
              update_date: account.update_date || ''
            });
          }
        }
      }
    }
  }

  const rows = [[
    'hierarchical_code',
    'freee_code',
    'freee_id',
    'name',
    'shortcut_num',
    'level1',
    'level2',
    'level3',
    'level4',
    'account_category',
    'group_id',
    'group_name',
    'update_date'
  ]];

  Array.from(accountCatalog.entries())
    .sort((a, b) => a[1].hierarchical_code.localeCompare(b[1].hierarchical_code))
    .forEach(([id, info]) => {
      const origInfo = accountItems.find(item => item.id === id) || {};
      rows.push([
        info.hierarchical_code,
        info.freee_code,
        id,
        info.name,
        origInfo.shortcut_num || '',
        info.level1,
        info.level2,
        info.level3,
        info.level4,
        info.account_category,
        info.group_id,
        info.group_name,
        info.update_date
      ]);
    });

  return { catalog: accountCatalog, rows };
}

function toCsv(rows) {
  return rows.map(row => row.map(value => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }).join(',')).join('\n');
}

async function writeCsvFile(outputPath, rows) {
  const csv = toCsv(rows);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, csv, 'utf8');
}

function parseArgs(argv) {
const options = {
  outputDir: DEFAULT_OUTPUT_DIR,
  formats: new Set(['csv']),
  groups: ['account']
};

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const [key, value] = arg.split('=');
    switch (key) {
      case '--start':
        options.start = value;
        break;
      case '--end':
        options.end = value;
        break;
      case '--month':
        options.month = value;
        break;
      case '--output-dir':
        options.outputDir = path.resolve(value);
        break;
  case '--format': {
    if (!value) {
      options.formats = new Set(['csv']);
      break;
    }
    const normalized = value.split(',').map(part => part.trim().toLowerCase()).filter(Boolean);
    if (normalized.includes('all')) {
      options.formats = new Set(['csv', 'md', 'json']);
    } else {
      options.formats = new Set(normalized);
    }
    break;
  }
      case '--company-id':
        options.companyId = value;
        break;
      case '--encoding':
        options.encoding = value;
        break;
      case '--pivot':
        options.pivot = value === undefined ? true : value !== 'false';
        break;
      case '--group':
        options.groups = value
          ? value.split(',').map(part => part.trim()).filter(Boolean)
          : ['account'];
        break;
      default:
        console.warn(`Unknown option: ${key}`);
    }
  }

  if (options.month) {
    const [year, month] = options.month.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) {
      throw new Error('Invalid --month format. Use YYYY-MM');
    }
    const lastDay = new Date(year, month, 0).getDate();
    options.start = `${year}-${String(month).padStart(2, '0')}-01`;
    options.end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  if (!options.start || !options.end) {
    throw new Error('Provide --start and --end (YYYY-MM-DD) or --month (YYYY-MM).');
  }

  if (!options.companyId) {
    options.companyId = process.env.FREEE_COMPANY_ID;
  }

  if (!options.companyId) {
    throw new Error('FREEE_COMPANY_ID is not set. Specify via .env or --company-id.');
  }

  const encoding = options.encoding || process.env.FREEE_JOURNAL_EXPORT_ENCODING || 'utf-8';
  options.encoding = encoding;

  const allowedFormats = new Set(['json', 'md', 'csv']);
  options.formats.forEach(format => {
    if (!allowedFormats.has(format)) {
      throw new Error(`Unsupported --format value: ${format}`);
    }
  });

  const allowedGroups = new Set(['account', 'partner', 'item', 'section']);
  options.groups = Array.from(new Set(options.groups));
  options.groups.forEach(group => {
    if (!allowedGroups.has(group)) {
      throw new Error(`Unsupported --group value: ${group}`);
    }
  });

  return options;
}

async function startJournalExport({ companyId, start, end, encoding }) {
  const params = new URLSearchParams({
    company_id: companyId,
    start_date: start,
    end_date: end,
    download_type: 'generic_v2',
    encoding
  });

  const url = `https://api.freee.co.jp/api/1/journals?${params}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.FREEE_ACCESS_TOKEN}` }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to start journals export: ${response.status} ${body}`);
  }

  const data = await response.json();
  return data.journals.status_url;
}

async function pollForDownloadUrl(statusUrl, companyId, token, { maxRetries = 120, intervalMs = 1000 } = {}) {
  const url = `${statusUrl}?company_id=${companyId}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Status check failed: ${response.status} ${body}`);
    }

    const data = await response.json();
    if (data.journals?.download_url) {
      return `${data.journals.download_url}?company_id=${companyId}`;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out waiting for journals export to complete');
}

async function downloadCsv(downloadUrl, token, encoding) {
  const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Download failed: ${response.status} ${body}`);
  }

  const buffer = await response.arrayBuffer();
  return new TextDecoder(encoding).decode(buffer);
}

function parseCsv(text) {
  const rows = [];
  let current = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      current.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (value !== '' || current.length > 0) {
        current.push(value);
        rows.push(current);
      }
      current = [];
      value = '';
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
    } else {
      value += char;
    }
  }

  if (value !== '' || current.length > 0) {
    current.push(value);
    rows.push(current);
  }

  return rows.filter(row => row.length > 1);
}

function normalizeMonth(dateString) {
  if (!dateString) return null;
  const [year, month] = dateString.split(/[\/\-]/);
  if (!year || !month) return null;
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}`;
}

function toNumber(text) {
  if (!text) return 0;
  return Number(text.replace(/,/g, '')) || 0;
}

const DIMENSION_CONFIG = {
  account: {
    id: 'account',
    label: '勘定科目',
    accountCodeColumns: ['借方勘定科目ショートカット２（勘定科目コード）', '貸方勘定科目ショートカット２（勘定科目コード）'],
    accountNameColumns: ['借方勘定科目', '貸方勘定科目'],
    dimensionCodeColumns: ['借方勘定科目ショートカット２（勘定科目コード）', '貸方勘定科目ショートカット２（勘定科目コード）'],
    dimensionNameColumns: ['借方勘定科目', '貸方勘定科目'],
    header: ['勘定コード', '勘定科目', 'freeeコード', '区分'],
    rowBuilder: (entity) => [entity.account_code || '-', entity.account_name, entity.freee_code || '', entity.account_category || ''],
    pivotHeader: ['勘定コード', '勘定科目', 'freeeコード', '区分'],
    pivotRowBuilder: (entity) => [entity.account_code || '-', entity.account_name, entity.freee_code || '', entity.account_category || ''],
    metaLookup: (code, name, accountLookup) =>
      accountLookup.byCode.get(code) || accountLookup.byName.get(name) || null
  },
  partner: {
    id: 'partner',
    label: '取引先',
    accountCodeColumns: ['借方勘定科目ショートカット２（勘定科目コード）', '貸方勘定科目ショートカット２（勘定科目コード）'],
    accountNameColumns: ['借方勘定科目', '貸方勘定科目'],
    dimensionCodeColumns: ['借方取引先コード', '貸方取引先コード'],
    dimensionNameColumns: ['借方取引先名', '貸方取引先名'],
    header: ['勘定コード', '勘定科目', 'freeeコード', '取引先コード', '取引先名'],
    rowBuilder: (entity) => [entity.account_code || '-', entity.account_name, entity.freee_code || '', entity.dimension_code || '-', entity.dimension_name || '(未設定)'],
    pivotHeader: ['勘定コード', '勘定科目', 'freeeコード', '取引先コード', '取引先名'],
    pivotRowBuilder: (entity) => [entity.account_code || '-', entity.account_name, entity.freee_code || '', entity.dimension_code || '-', entity.dimension_name || '(未設定)'],
    metaLookup: (code, name, accountLookup) =>
      accountLookup.byCode.get(code) || accountLookup.byName.get(name) || null
  },
  item: {
    id: 'item',
    label: '品目',
    accountCodeColumns: ['借方勘定科目ショートカット２（勘定科目コード）', '貸方勘定科目ショートカット２（勘定科目コード）'],
    accountNameColumns: ['借方勘定科目', '貸方勘定科目'],
    dimensionCodeColumns: ['借方品目ショートカット２', '貸方品目ショートカット２'],
    dimensionNameColumns: ['借方品目', '貸方品目'],
    header: ['勘定コード', '勘定科目', 'freeeコード', '品目コード', '品目名'],
    rowBuilder: (entity) => [entity.account_code || '-', entity.account_name, entity.freee_code || '', entity.dimension_code || '-', entity.dimension_name || '(未設定)'],
    pivotHeader: ['勘定コード', '勘定科目', 'freeeコード', '品目コード', '品目名'],
    pivotRowBuilder: (entity) => [entity.account_code || '-', entity.account_name, entity.freee_code || '', entity.dimension_code || '-', entity.dimension_name || '(未設定)'],
    metaLookup: (code, name, accountLookup) =>
      accountLookup.byCode.get(code) || accountLookup.byName.get(name) || null
  },
  section: {
    id: 'section',
    label: '部門',
    accountCodeColumns: ['借方勘定科目ショートカット２（勘定科目コード）', '貸方勘定科目ショートカット２（勘定科目コード）'],
    accountNameColumns: ['借方勘定科目', '貸方勘定科目'],
    dimensionCodeColumns: ['借方部門ショートカット２', '貸方部門ショートカット２'],
    dimensionNameColumns: ['借方部門', '貸方部門'],
    header: ['勘定コード', '勘定科目', 'freeeコード', '部門コード', '部門名'],
    rowBuilder: (entity) => [entity.account_code || '-', entity.account_name, entity.freee_code || '', entity.dimension_code || '-', entity.dimension_name || '(未設定)'],
    pivotHeader: ['勘定コード', '勘定科目', 'freeeコード', '部門コード', '部門名'],
    pivotRowBuilder: (entity) => [entity.account_code || '-', entity.account_name, entity.freee_code || '', entity.dimension_code || '-', entity.dimension_name || '(未設定)'],
    metaLookup: (code, name, accountLookup) =>
      accountLookup.byCode.get(code) || accountLookup.byName.get(name) || null
  }
};

function aggregateByMonth(rows, indexMap, dimension, accountLookup) {
  const config = DIMENSION_CONFIG[dimension];
  const months = new Map();

  const pick = (row, column) => {
    if (!column) return '';
    const idx = indexMap[column];
    if (idx === undefined) return '';
    return row[idx];
  };

  function addEntry(month, accountCode, accountName, dimensionCode, dimensionName, amount) {
    if (!month || (!accountName && !accountCode)) return;

    const safeDimensionName = (dimensionName && String(dimensionName).trim()) || '(未設定)';
    const safeDimensionCode = (dimensionCode && String(dimensionCode).trim()) || '';

    if (!months.has(month)) {
      months.set(month, new Map());
    }

    const monthMap = months.get(month);
    const key = `${accountCode || ''}:${accountName || ''}:${safeDimensionCode}:${safeDimensionName}`;
    if (!monthMap.has(key)) {
      const meta = config.metaLookup(accountCode, accountName, accountLookup);
      const fallback = createFallbackCode(accountName, meta?.id || 'UNKNOWN');
      const hierarchicalCode = meta?.hierarchical_code || fallback;
      const freeeCode = meta?.freee_code || fallback;

      monthMap.set(key, {
        account_code: hierarchicalCode,
        freee_code: freeeCode,
        account_name: accountName || '(未設定)',
        account_category: meta?.account_category || '',
        dimension_code: safeDimensionCode,
        dimension_name: safeDimensionName,
        meta,
        debit: 0,
        credit: 0
      });
    }

    const record = monthMap.get(key);
    if (amount > 0) {
      record.debit += amount;
    } else {
      record.credit += Math.abs(amount);
    }
  }

  for (const row of rows) {
    const date = row[indexMap['取引日']];
    const month = normalizeMonth(date);

    const debitAmount = toNumber(row[indexMap['借方金額']]);
    const creditAmount = toNumber(row[indexMap['貸方金額']]);

    const debitAccountCode = pick(row, config.accountCodeColumns[0]);
    const debitAccountName = pick(row, config.accountNameColumns[0]);
    const debitDimensionCode = pick(row, config.dimensionCodeColumns[0]);
    const debitDimensionName = pick(row, config.dimensionNameColumns[0]);
    if (debitAmount) {
      addEntry(month, debitAccountCode, debitAccountName, debitDimensionCode, debitDimensionName, debitAmount);
    }

    const creditAccountCode = pick(row, config.accountCodeColumns[1]);
    const creditAccountName = pick(row, config.accountNameColumns[1]);
    const creditDimensionCode = pick(row, config.dimensionCodeColumns[1]);
    const creditDimensionName = pick(row, config.dimensionNameColumns[1]);
    if (creditAmount) {
      addEntry(month, creditAccountCode, creditAccountName, creditDimensionCode, creditDimensionName, -creditAmount);
    }
  }

  return months;
}

function buildDimensionReport({ start, end, companyId, rows, header, accountLookup, dimension }) {
  const config = DIMENSION_CONFIG[dimension];
  const indexMap = Object.fromEntries(header.map((column, idx) => [column, idx]));
  const monthsMap = aggregateByMonth(rows, indexMap, dimension, accountLookup);

  const months = Array.from(monthsMap.entries())
    .sort(([monthA], [monthB]) => monthA.localeCompare(monthB))
    .map(([month, entitiesMap]) => {
      const entities = Array.from(entitiesMap.values())
        .map(entity => ({
          account_code: entity.account_code,
          freee_code: entity.freee_code,
          account_name: entity.account_name,
          account_category: entity.account_category,
          dimension_code: entity.dimension_code,
          dimension_name: entity.dimension_name,
          debit: entity.debit,
          credit: entity.credit,
          balance: entity.debit - entity.credit,
          meta: entity.meta
        }))
        .filter(entity => entity.debit !== 0 || entity.credit !== 0)
        .sort((a, b) =>
          (a.account_code || '').localeCompare(b.account_code || '') ||
          a.account_name.localeCompare(b.account_name) ||
          (a.dimension_code || '').localeCompare(b.dimension_code || '') ||
          a.dimension_name.localeCompare(b.dimension_name)
        );

      const totals = entities.reduce((acc, entity) => {
        acc.debit += entity.debit;
        acc.credit += entity.credit;
        return acc;
      }, { debit: 0, credit: 0 });
      totals.balance = totals.debit - totals.credit;

      return {
        month,
        totals,
        entities
      };
    });

  return {
    dimension,
    label: config.label,
    company_id: companyId,
    period: { start, end },
    generated_at: new Date().toISOString(),
    months
  };
}

function buildReport({ start, end, companyId, rows, header, accountLookup, dimensions }) {
  const reports = {};
  for (const dimension of dimensions) {
    reports[dimension] = buildDimensionReport({
      start,
      end,
      companyId,
      rows,
      header,
      accountLookup,
      dimension
    });
  }

  const report = {
    company_id: companyId,
    period: { start, end },
    generated_at: new Date().toISOString(),
    dimensions: reports
  };

  verifySubdimensionTotals(report);

  return report;
}

function verifySubdimensionTotals(report) {
  const accountReport = report.dimensions.account;
  if (!accountReport) {
    return;
  }

  const toKey = (accountCode, accountName) => `${accountCode || ''}::${accountName || ''}`;
  const accountTotalsByMonth = new Map();

  accountReport.months.forEach(monthEntry => {
    const map = new Map();
    monthEntry.entities.forEach(entity => {
      const key = toKey(entity.account_code, entity.account_name);
      map.set(key, {
        balance: entity.balance,
        debit: entity.debit,
        credit: entity.credit,
        name: entity.account_name
      });
    });
    accountTotalsByMonth.set(monthEntry.month, map);
  });

  const tolerance = 1; // yen
  const verification = {};

  for (const [dimensionId, dimensionReport] of Object.entries(report.dimensions)) {
    if (dimensionId === 'account') continue;
    const mismatches = [];

    dimensionReport.months.forEach(monthEntry => {
      const accountTotals = accountTotalsByMonth.get(monthEntry.month) || new Map();
      const detailTotals = new Map();

      monthEntry.entities.forEach(entity => {
        const key = toKey(entity.account_code, entity.account_name);
        detailTotals.set(key, (detailTotals.get(key) || 0) + entity.balance);
      });

      for (const [accountKey, accountInfo] of accountTotals.entries()) {
        const detailTotal = detailTotals.get(accountKey) || 0;
        const diff = accountInfo.balance - detailTotal;
        if (Math.abs(diff) > tolerance) {
          const [code, name] = accountKey.split('::');
          mismatches.push({
            month: monthEntry.month,
            account_code: code || '',
            account_name: name || '',
            account_balance: accountInfo.balance,
            detail_balance: detailTotal,
            difference: diff
          });
        }
      }
    });

    if (mismatches.length > 0) {
      mismatches.forEach(mismatch => {
        console.warn(`⚠️ ${dimensionReport.label}集計: 月 ${mismatch.month} / 勘定科目 ${mismatch.account_code || '-'} ${mismatch.account_name} に差異 ${mismatch.difference} 円があります`);
      });
    }

    verification[dimensionId] = mismatches;
  }

  report.verification = verification;
}

function formatNumber(value) {
  return value.toLocaleString('ja-JP');
}

function renderMarkdown(report, dimension) {
  const dimensionReport = report.dimensions[dimension];
  const lines = [];
  lines.push(`# 月次試算表（${dimensionReport.label}別）`);
  lines.push('');
  lines.push(`- 会社ID: ${dimensionReport.company_id}`);
  lines.push(`- 期間: ${dimensionReport.period.start} 〜 ${dimensionReport.period.end}`);
  lines.push(`- 作成日時: ${new Date(dimensionReport.generated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  lines.push('');

  dimensionReport.months.forEach(monthEntry => {
    lines.push(`## ${monthEntry.month}`);
    lines.push('');
    lines.push(`- 合計借方: ${formatNumber(monthEntry.totals.debit)} 円`);
    lines.push(`- 合計貸方: ${formatNumber(monthEntry.totals.credit)} 円`);
    lines.push(`- 差額: ${formatNumber(monthEntry.totals.balance)} 円`);
    lines.push('');
    const header = DIMENSION_CONFIG[dimension].header;
    lines.push(`| ${[...header, '借方金額 (円)', '貸方金額 (円)', '差額 (円)'].join(' | ')} |`);
    lines.push(`| ${[...header.map(() => '---'), '---:', '---:', '---:'].join(' | ')} |`);

    monthEntry.entities.forEach(entity => {
      const row = DIMENSION_CONFIG[dimension].rowBuilder(entity);
      lines.push(`| ${[...row, formatNumber(entity.debit), formatNumber(entity.credit), formatNumber(entity.balance)].join(' | ')} |`);
    });

    lines.push('');
  });

  return lines.join('\n');
}

function renderPivotMarkdown(report, dimension) {
  const dimensionReport = report.dimensions[dimension];
  const months = dimensionReport.months.map(monthEntry => monthEntry.month);
  const entityMap = new Map();

  for (const monthEntry of dimensionReport.months) {
    for (const entity of monthEntry.entities) {
      const key = `${entity.account_code || ''}::${entity.account_name}::${entity.dimension_code || ''}::${entity.dimension_name}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, {
          account_code: entity.account_code || '',
          account_name: entity.account_name,
          account_category: entity.account_category || '',
          dimension_code: entity.dimension_code || '',
          dimension_name: entity.dimension_name || '(未設定)',
          balances: new Map(months.map(month => [month, 0]))
        });
      }
      entityMap.get(key).balances.set(monthEntry.month, entity.balance);
    }
  }

  const header = [...DIMENSION_CONFIG[dimension].pivotHeader, ...months].join(' | ');
  const separator = [...DIMENSION_CONFIG[dimension].pivotHeader.map(() => '---'), ...months.map(() => '---:')].join(' | ');

  const rows = Array.from(entityMap.values()).sort((a, b) => {
    return (
      (a.account_code || '').localeCompare(b.account_code || '') ||
      a.account_name.localeCompare(b.account_name) ||
      (a.dimension_code || '').localeCompare(b.dimension_code || '') ||
      a.dimension_name.localeCompare(b.dimension_name)
    );
  });

  const lines = [];
  lines.push(`# 月次試算表（${dimensionReport.label}別, ピボット）`);
  lines.push('');
  lines.push(`- 会社ID: ${dimensionReport.company_id}`);
  lines.push(`- 期間: ${dimensionReport.period.start} 〜 ${dimensionReport.period.end}`);
  lines.push(`- 作成日時: ${new Date(dimensionReport.generated_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  lines.push('');
  lines.push(`| ${header} |`);
  lines.push(`| ${separator} |`);

  for (const row of rows) {
    const base = DIMENSION_CONFIG[dimension].pivotRowBuilder(row);
    const values = months.map(month => formatNumber(row.balances.get(month) || 0));
    lines.push(`| ${[...base, ...values].join(' | ')} |`);
  }

  return lines.join('\n');
}

function renderCsv(report, dimension) {
  const dimensionReport = report.dimensions[dimension];
  const baseHeader = DIMENSION_CONFIG[dimension].header;
  const rows = [[ 'month', ...baseHeader, 'debit', 'credit', 'balance' ]];

  dimensionReport.months.forEach(monthEntry => {
    monthEntry.entities.forEach(entity => {
      const baseRow = DIMENSION_CONFIG[dimension].rowBuilder(entity);
      rows.push([
        monthEntry.month,
        ...baseRow,
        entity.debit,
        entity.credit,
        entity.balance
      ]);
    });
  });

  return rows;
}

function renderPivotCsv(report, dimension) {
  const dimensionReport = report.dimensions[dimension];
  const months = dimensionReport.months.map(monthEntry => monthEntry.month);
  const entityMap = new Map();

  for (const monthEntry of dimensionReport.months) {
    for (const entity of monthEntry.entities) {
      const key = `${entity.account_code || ''}::${entity.account_name}::${entity.dimension_code || ''}::${entity.dimension_name}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, {
          entity,
          balances: new Map(months.map(month => [month, 0]))
        });
      }
      entityMap.get(key).balances.set(monthEntry.month, entity.balance);
    }
  }

  const header = [...DIMENSION_CONFIG[dimension].pivotHeader, ...months];
  const rows = [header];

  for (const { entity, balances } of entityMap.values()) {
    const base = DIMENSION_CONFIG[dimension].pivotRowBuilder(entity);
    const values = months.map(month => balances.get(month) || 0);
    rows.push([...base, ...values]);
  }

  return rows;
}

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function main(argv = process.argv) {
  try {
    const options = parseArgs(argv);
    const token = process.env.FREEE_ACCESS_TOKEN;

    if (!token) {
      throw new Error('FREEE_ACCESS_TOKEN is not set. Authenticate first.');
    }

    console.log('=== freee 月次試算表レポート生成 ===');
    console.log(`会社ID: ${options.companyId}`);
    console.log(`期間: ${options.start} 〜 ${options.end}`);
    console.log('1) 仕訳エクスポートを開始します...');

    const statusUrl = await startJournalExport({
      companyId: options.companyId,
      start: options.start,
      end: options.end,
      encoding: options.encoding
    });

    console.log('2) エクスポート完了を待機中...');
    const downloadUrl = await pollForDownloadUrl(statusUrl, options.companyId, token);

    console.log('3) CSVデータをダウンロード中...');
    const csvText = await downloadCsv(downloadUrl, token, options.encoding);
    const rows = parseCsv(csvText);
    const header = rows.shift();

    console.log('4) 勘定科目マスタを取得中...');
    const accountItems = await getAccountItems({ company_id: options.companyId });
    const { catalog, rows: catalogRows } = buildAccountCatalog(accountItems.account_items || []);
    await writeCsvFile(path.resolve(options.outputDir, 'account_code_catalog.csv'), catalogRows);

    const accountLookup = {
      byName: new Map(),
      byCode: new Map(),
      byId: new Map()
    };

    for (const item of accountItems.account_items || []) {
      const catalogInfo = catalog.get(item.id) || {};
      const meta = {
        ...item,
        hierarchical_code: catalogInfo.hierarchical_code,
        freee_code: catalogInfo.freee_code,
        account_category: catalogInfo.account_category || item.account_category || ''
      };

      accountLookup.byName.set(item.name, meta);
      if (item.shortcut_num) {
        accountLookup.byCode.set(item.shortcut_num, meta);
      }
      accountLookup.byId.set(item.id, meta);
    }

    console.log('5) レポートを集計中...');
    const report = buildReport({
      start: options.start,
      end: options.end,
      companyId: options.companyId,
      rows,
      header,
      accountLookup,
      dimensions: options.groups
    });

    await fs.mkdir(options.outputDir, { recursive: true });
    const tag = `${options.start}_${options.end}`.replace(/-/g, '');

    if (options.formats.has('json')) {
      const jsonPath = path.join(options.outputDir, `pl_trial_balance_${tag}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
      console.log(`JSONレポートを保存しました: ${jsonPath}`);
    }

    for (const dimension of options.groups) {
      const suffix = dimension === 'account' ? '' : `_${dimension}`;

      if (options.formats.has('md')) {
        const markdown = renderMarkdown(report, dimension);
        const mdPath = path.join(options.outputDir, `pl_trial_balance${suffix}_${tag}.md`);
        await fs.writeFile(mdPath, markdown, 'utf8');
        console.log(`Markdownレポートを保存しました: ${mdPath}`);
      }

      if (options.formats.has('csv')) {
        const csvRows = renderCsv(report, dimension);
        const csvPath = path.join(options.outputDir, `pl_trial_balance${suffix}_${tag}.csv`);
        await writeCsvFile(csvPath, csvRows);
        console.log(`CSVレポートを保存しました: ${csvPath}`);
      }

      if (options.pivot) {
        if (options.formats.has('md')) {
          const pivotMarkdown = renderPivotMarkdown(report, dimension);
          const pivotPath = path.join(options.outputDir, `pl_trial_balance${suffix}_pivot_${tag}.md`);
          await fs.writeFile(pivotPath, pivotMarkdown, 'utf8');
          console.log(`Pivotレポートを保存しました: ${pivotPath}`);
        }
        if (options.formats.has('csv')) {
          const pivotCsvRows = renderPivotCsv(report, dimension);
          const pivotCsvPath = path.join(options.outputDir, `pl_trial_balance${suffix}_pivot_${tag}.csv`);
          await writeCsvFile(pivotCsvPath, pivotCsvRows);
          console.log(`Pivot CSVレポートを保存しました: ${pivotCsvPath}`);
        }
      }
    }

    console.log('✅ レポート生成が完了しました');
  } catch (error) {
    console.error('❌ レポート生成に失敗しました');
    console.error(error.message);
    process.exitCode = 1;
  }
}

const invokedFromCli = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (invokedFromCli) {
  await main();
}

export { deriveLevels, buildAccountCatalog, parseCsv, toCsv };
export default main;
