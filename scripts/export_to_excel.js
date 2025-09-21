#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';
import path from 'path';
import XLSX from 'xlsx';
import { pathToFileURL } from 'url';
import { createWorkbook } from '../src/exporters/excel.js';

const BASE_URL = process.env.SERVER_URL || 'http://localhost:3000';

export const ENDPOINTS = {
  journals: '/freee/journals',
  variance: '/freee/variance-analysis',
  trends: '/freee/monthly-trends',
  'entry-routes': '/freee/entry-route-analysis',
  budgets: '/freee/budgets',
  'budget-comparison': '/freee/budget-comparison',
  'partner-summary': '/freee/partner-yearly-summary',
  'audit-logs': '/audit/logs',
  'audit-stats': '/audit/statistics'
};

export async function fetchData(endpoint, params = '') {
  const url = `${BASE_URL}${endpoint}?${params}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed: ${response.status} ${body}`);
  }
  return response.json();
}

export async function main(argv = process.argv) {
  const reportType = argv[2];
  const params = argv[3] || '';
  const outputFile = argv[4] || `${reportType}_${Date.now()}.xlsx`;

  if (!reportType || !ENDPOINTS[reportType]) {
    console.error('Usage: node export_to_excel.js [endpoint] [params] [output_file]');
    console.error('Available endpoints:', Object.keys(ENDPOINTS).join(', '));
    process.exit(1);
  }

  try {
    const endpoint = ENDPOINTS[reportType];
    const data = await fetchData(endpoint, params);
    const workbook = createWorkbook(data, reportType);
    const outputPath = path.resolve(outputFile);
    XLSX.writeFile(workbook, outputPath);
    console.log(`Report successfully saved to: ${outputPath}`);
  } catch (error) {
    console.error('Failed to generate Excel report:', error.message);
    process.exit(1);
  }
}

// CLI 実行時のみ main を起動
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
