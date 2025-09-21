#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';

async function main() {
  const baseUrl = process.argv[2] || 'http://localhost:3000/freee/journals';
  const params = process.argv[3] || 'start_date=2024-01-01&end_date=2024-01-31';

  try {
    const response = await fetch(`${baseUrl}?${params}`);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Request failed: ${response.status} ${body}`);
    }
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Failed to fetch journals:', error.message);
    process.exit(1);
  }
}

main();
