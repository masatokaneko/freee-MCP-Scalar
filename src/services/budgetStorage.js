import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'budget.db');

let db = null;

/**
 * Initialize SQLite database for budget storage
 */
export async function initializeBudgetStorage() {
  try {
    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database
    });

    // Create budget table with comprehensive fields
    await db.exec(`
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget_id TEXT UNIQUE NOT NULL,
        company_id TEXT NOT NULL,
        fiscal_year INTEGER NOT NULL,
        account_item_id INTEGER NOT NULL,
        account_item_name TEXT NOT NULL,
        account_item_code TEXT,
        monthly_budgets TEXT NOT NULL, -- JSON string
        annual_budget REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT,
        notes TEXT,
        UNIQUE(company_id, fiscal_year, account_item_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_company_fiscal ON budgets(company_id, fiscal_year);
      CREATE INDEX IF NOT EXISTS idx_budget_id ON budgets(budget_id);
      CREATE INDEX IF NOT EXISTS idx_account_item ON budgets(account_item_id);
    `);

    // Create budget history table for tracking changes
    await db.exec(`
      CREATE TABLE IF NOT EXISTS budget_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget_id TEXT NOT NULL,
        company_id TEXT NOT NULL,
        fiscal_year INTEGER NOT NULL,
        account_item_id INTEGER NOT NULL,
        old_value TEXT,
        new_value TEXT,
        change_type TEXT, -- 'CREATE', 'UPDATE', 'DELETE'
        changed_at TEXT NOT NULL,
        changed_by TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_history_budget ON budget_history(budget_id);
      CREATE INDEX IF NOT EXISTS idx_history_date ON budget_history(changed_at);
    `);

    console.log('Budget storage database initialized');
    return db;
  } catch (error) {
    console.error('Failed to initialize budget storage database:', error);
    throw error;
  }
}

/**
 * Save budget data to database
 * @param {Object} budgetData - Budget data to save
 * @returns {Object} Save result
 */
export async function saveBudgetData(budgetData) {
  if (!db) {
    await initializeBudgetStorage();
  }

  const { company_id, fiscal_year, budgets, created_by } = budgetData;
  const created_at = new Date().toISOString();
  const updated_at = created_at;

  // Start transaction
  await db.run('BEGIN TRANSACTION');

  try {
    // Generate budget ID
    const budgetId = `BUD-${company_id}-${fiscal_year}-${Date.now()}`;
    
    // Delete existing budgets for this fiscal year (if any)
    const existingBudgets = await db.all(
      'SELECT * FROM budgets WHERE company_id = ? AND fiscal_year = ?',
      [company_id, fiscal_year]
    );

    if (existingBudgets.length > 0) {
      // Log to history
      for (const existing of existingBudgets) {
        await db.run(
          `INSERT INTO budget_history (
            budget_id, company_id, fiscal_year, account_item_id,
            old_value, new_value, change_type, changed_at, changed_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            existing.budget_id, company_id, fiscal_year, existing.account_item_id,
            JSON.stringify(existing), null, 'DELETE', created_at, created_by
          ]
        );
      }

      // Delete old budgets
      await db.run(
        'DELETE FROM budgets WHERE company_id = ? AND fiscal_year = ?',
        [company_id, fiscal_year]
      );
    }

    // Insert new budgets
    let totalAnnualBudget = 0;
    const insertStmt = await db.prepare(
      `INSERT INTO budgets (
        budget_id, company_id, fiscal_year, account_item_id,
        account_item_name, account_item_code, monthly_budgets,
        annual_budget, created_at, updated_at, created_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const budget of budgets) {
      const annualBudget = budget.annual_budget || 
        Object.values(budget.monthly_budgets || {}).reduce((sum, val) => sum + val, 0);
      
      totalAnnualBudget += annualBudget;

      await insertStmt.run(
        budgetId,
        company_id,
        fiscal_year,
        budget.account_item_id,
        budget.account_item_name,
        budget.account_item_code || null,
        JSON.stringify(budget.monthly_budgets || {}),
        annualBudget,
        created_at,
        updated_at,
        created_by || null,
        budget.notes || null
      );

      // Log to history
      await db.run(
        `INSERT INTO budget_history (
          budget_id, company_id, fiscal_year, account_item_id,
          old_value, new_value, change_type, changed_at, changed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          budgetId, company_id, fiscal_year, budget.account_item_id,
          null, JSON.stringify(budget), 'CREATE', created_at, created_by
        ]
      );
    }

    await insertStmt.finalize();
    await db.run('COMMIT');

    return {
      success: true,
      budget_id: budgetId,
      message: 'Budget saved successfully',
      summary: {
        fiscal_year,
        total_accounts: budgets.length,
        total_annual_budget: totalAnnualBudget
      }
    };
  } catch (error) {
    await db.run('ROLLBACK');
    console.error('Failed to save budget data:', error);
    throw error;
  }
}

/**
 * Get budget data from database
 * @param {Object} params - Query parameters
 * @returns {Object} Budget data
 */
export async function getBudgetData(params) {
  if (!db) {
    await initializeBudgetStorage();
  }

  const { company_id, fiscal_year, start_date, end_date } = params;

  try {
    let budgets = [];

    if (fiscal_year) {
      // Get budget for specific fiscal year
      budgets = await db.all(
        `SELECT * FROM budgets 
         WHERE company_id = ? AND fiscal_year = ?
         ORDER BY account_item_id`,
        [company_id, fiscal_year]
      );
    } else if (start_date && end_date) {
      // Get budget for fiscal year based on start date
      const year = new Date(start_date).getFullYear();
      budgets = await db.all(
        `SELECT * FROM budgets 
         WHERE company_id = ? AND fiscal_year = ?
         ORDER BY account_item_id`,
        [company_id, year]
      );
    }

    // Parse JSON fields and format response
    const formattedBudgets = budgets.map(budget => ({
      account_item_id: budget.account_item_id,
      account_item_name: budget.account_item_name,
      account_item_code: budget.account_item_code,
      monthly_budgets: JSON.parse(budget.monthly_budgets || '{}'),
      annual_budget: budget.annual_budget
    }));

    // Filter by date range if specified
    if (start_date && end_date && !fiscal_year) {
      const startMonth = start_date.substring(0, 7);
      const endMonth = end_date.substring(0, 7);

      formattedBudgets.forEach(budget => {
        const filteredMonthly = {};
        Object.entries(budget.monthly_budgets).forEach(([month, amount]) => {
          if (month >= startMonth && month <= endMonth) {
            filteredMonthly[month] = amount;
          }
        });
        budget.monthly_budgets = filteredMonthly;
      });
    }

    const result = fiscal_year ? {
      fiscal_year,
      budgets: formattedBudgets
    } : {
      period: {
        start: start_date,
        end: end_date
      },
      budgets: formattedBudgets
    };

    return result;
  } catch (error) {
    console.error('Failed to get budget data:', error);
    throw error;
  }
}

/**
 * Get budget map for comparison
 * @param {Object} params - Query parameters
 * @returns {Map} Budget map
 */
export async function getBudgetMap(params) {
  if (!db) {
    await initializeBudgetStorage();
  }

  const { company_id, fiscal_year } = params;
  const budgetMap = new Map();

  try {
    const budgets = await db.all(
      `SELECT * FROM budgets 
       WHERE company_id = ? AND fiscal_year = ?`,
      [company_id, fiscal_year]
    );

    budgets.forEach(budget => {
      budgetMap.set(budget.account_item_id, {
        account_item_id: budget.account_item_id,
        account_item_name: budget.account_item_name,
        monthly_budgets: JSON.parse(budget.monthly_budgets || '{}'),
        annual_budget: budget.annual_budget
      });
    });

    return budgetMap;
  } catch (error) {
    console.error('Failed to get budget map:', error);
    return budgetMap;
  }
}

/**
 * Get budget history
 * @param {Object} params - Query parameters
 * @returns {Array} Budget history records
 */
export async function getBudgetHistory(params) {
  if (!db) {
    await initializeBudgetStorage();
  }

  const { company_id, fiscal_year, start_date, end_date } = params;

  try {
    let query = `SELECT * FROM budget_history WHERE company_id = ?`;
    const queryParams = [company_id];

    if (fiscal_year) {
      query += ' AND fiscal_year = ?';
      queryParams.push(fiscal_year);
    }

    if (start_date) {
      query += ' AND changed_at >= ?';
      queryParams.push(start_date);
    }

    if (end_date) {
      query += ' AND changed_at <= ?';
      queryParams.push(end_date);
    }

    query += ' ORDER BY changed_at DESC';

    const history = await db.all(query, queryParams);

    return history.map(record => ({
      ...record,
      old_value: record.old_value ? JSON.parse(record.old_value) : null,
      new_value: record.new_value ? JSON.parse(record.new_value) : null
    }));
  } catch (error) {
    console.error('Failed to get budget history:', error);
    return [];
  }
}