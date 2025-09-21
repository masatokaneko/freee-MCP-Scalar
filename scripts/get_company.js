#!/usr/bin/env node
import 'dotenv/config';
import fetch from 'node-fetch';

const ACCESS_TOKEN = process.env.FREEE_ACCESS_TOKEN;
const API_BASE_URL = process.env.FREEE_API_BASE_URL || 'https://api.freee.co.jp';

async function getCompanies() {
  if (!ACCESS_TOKEN) {
    console.error('Error: FREEE_ACCESS_TOKEN not found in environment variables');
    console.error('Please run scripts/get_token.js first to obtain an access token');
    process.exit(1);
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/1/companies`, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }
    
    const data = await response.json();
    
    if (!data.companies || data.companies.length === 0) {
      console.log('No companies found for this account');
      return;
    }
    
    console.log('\n✅ Companies found:\n');
    data.companies.forEach((company, index) => {
      console.log(`Company ${index + 1}:`);
      console.log(`  ID: ${company.id}`);
      console.log(`  Name: ${company.display_name}`);
      console.log(`  Role: ${company.role}`);
      console.log('');
    });
    
    if (data.companies.length === 1) {
      console.log(`\nAdd this to your .env file:`);
      console.log(`FREEE_COMPANY_ID=${data.companies[0].id}`);
    } else {
      console.log(`\nChoose one company ID and add to your .env file:`);
      console.log(`FREEE_COMPANY_ID=<chosen_company_id>`);
    }
    
    return data.companies;
  } catch (error) {
    console.error('Error fetching companies:', error.message);
    process.exit(1);
  }
}

getCompanies();