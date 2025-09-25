import express from 'express';
import { 
  getJournals, 
  getItems, 
  getSections, 
  getTags, 
  getTaxes,
  getPartners,
  getAccountItems 
} from '../services/freeeClient.js';
import { transformFreeeJournals } from '../transformers/freeeTransform.js';
import { analyzeVariance } from '../services/variance.js';
import { getMonthlyTrends } from '../services/aggregation.js';
import { analyzeEntryRoutes } from '../services/entryRoute.js';
import { saveBudget, getBudget, compareBudgetToActual } from '../services/budget.js';
import { getPartnerYearlySummary } from '../services/partnerSummary.js';
import { requestLoggerMiddleware, errorLoggerMiddleware } from '../utils/errorLogger.js';
import { cacheMiddleware, getCacheConfig, invalidateCache } from '../services/cache.js';
import { auditMiddleware, logDataModification } from '../services/auditLog.js';

const router = express.Router();

// Apply request logger to all routes
router.use(requestLoggerMiddleware);

// Apply audit logging middleware
router.use(auditMiddleware());

// Apply cache middleware with endpoint-specific TTLs
const cacheConfig = getCacheConfig();
router.use((req, res, next) => {
  const config = cacheConfig[`/freee${req.path}`];
  if (config) {
    return cacheMiddleware({ ttl: config.ttl })(req, res, next);
  }
  next();
});

// -----------------------
// 仕訳データ取得
// -----------------------
router.get('/journals', async (req, res, next) => {
  try {
    const { detail, ...apiParams } = req.query;
    
    // Ensure company_id is provided
    const params = {
      company_id: apiParams.company_id || process.env.FREEE_COMPANY_ID,
      ...apiParams
    };
    
    if (!params.company_id) {
      return res.status(400).json({
        error: true,
        message: 'company_id is required'
      });
    }
    
    const raw = await getJournals(params);
    const detailLevel = detail || 'standard';
    const transformed = transformFreeeJournals(raw, detailLevel);
    
    res.json({ 
      data: transformed,
      metadata: {
        fetched_at: new Date().toISOString(),
        source: 'freee',
        company_id: params.company_id,
        detail_level: detailLevel,
        count: transformed.length
      }
    });
  } catch (error) {
    next(error);
  }
});

// -----------------------
// マスタデータ取得
// -----------------------
router.get('/account_items', async (req, res, next) => {
  try {
    const data = await getAccountItems(req.query);
    res.json({ account_items: data.account_items || [] });
  } catch (error) {
    next(error);
  }
});

router.get('/partners', async (req, res, next) => {
  try {
    const data = await getPartners(req.query);
    res.json({ partners: data.partners || [] });
  } catch (error) {
    next(error);
  }
});

router.get('/items', async (req, res, next) => {
  try {
    const raw = await getItems(req.query);
    const transformed = (raw.items || []).map(item => ({
      id: item.id.toString(),
      code: item.code || null,
      name: item.name,
      category: item.shortcut1 || null
    }));
    res.json({ items: transformed });
  } catch (error) {
    next(error);
  }
});

router.get('/sections', async (req, res, next) => {
  try {
    const raw = await getSections(req.query);
    const transformed = (raw.sections || []).map(section => ({
      id: section.id.toString(),
      code: section.code || null,
      name: section.name
    }));
    res.json({ sections: transformed });
  } catch (error) {
    next(error);
  }
});

router.get('/taxes', async (req, res, next) => {
  try {
    const raw = await getTaxes(req.query);
    const transformed = (raw.taxes || []).map(tax => ({
      code: tax.code,
      name: tax.name,
      name_ja: tax.name_ja,
      display_category: tax.display_category,
      available: tax.available
    }));
    res.json({ taxes: transformed });
  } catch (error) {
    next(error);
  }
});

router.get('/tags', async (req, res, next) => {
  try {
    const raw = await getTags(req.query);
    const transformed = (raw.tags || []).map(tag => ({
      id: tag.id.toString(),
      name: tag.name,
      shortcut1: tag.shortcut1 || null,
      shortcut2: tag.shortcut2 || null
    }));
    res.json({ tags: transformed });
  } catch (error) {
    next(error);
  }
});

// -----------------------
// 分析機能エンドポイント
// -----------------------
router.get('/variance-analysis', async (req, res, next) => {
  try {
    const params = {
      company_id: req.query.company_id || process.env.FREEE_COMPANY_ID,
      ...req.query
    };
    
    if (!params.company_id) {
      return res.status(400).json({
        error: true,
        message: 'company_id is required'
      });
    }
    
    const result = await analyzeVariance(params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/monthly-trends', async (req, res, next) => {
  try {
    // startMonthとendMonthをstart_dateとend_dateに変換
    const { startMonth, endMonth, company_id, ...otherParams } = req.query;
    
    const params = {
      company_id: company_id || process.env.FREEE_COMPANY_ID,
      start_date: startMonth ? `${startMonth}-01` : undefined,
      end_date: endMonth ? `${endMonth}-31` : undefined,
      ...otherParams
    };
    
    if (!params.company_id) {
      return res.status(400).json({
        error: true,
        message: 'company_id is required'
      });
    }
    
    if (!params.start_date || !params.end_date) {
      return res.status(400).json({
        error: true,
        message: 'startMonth and endMonth are required'
      });
    }
    
    const result = await getMonthlyTrends(params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/entry-route-analysis', async (req, res, next) => {
  try {
    const params = {
      company_id: req.query.company_id || process.env.FREEE_COMPANY_ID,
      ...req.query
    };
    
    if (!params.company_id) {
      return res.status(400).json({
        error: true,
        message: 'company_id is required'
      });
    }
    
    const result = await analyzeEntryRoutes(params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// -----------------------
// 予算管理エンドポイント
// -----------------------
router.post('/budgets', async (req, res, next) => {
  try {
    const budgetData = {
      company_id: process.env.FREEE_COMPANY_ID,
      ...req.body
    };
    
    if (!budgetData.fiscal_year) {
      return res.status(400).json({
        error: true,
        message: 'fiscal_year is required'
      });
    }
    
    if (!budgetData.budgets || !Array.isArray(budgetData.budgets)) {
      return res.status(400).json({
        error: true,
        message: 'budgets array is required'
      });
    }
    
    const result = await saveBudget(budgetData);
    
    // Log data modification
    await logDataModification({
      session_id: req.auditSessionId,
      user_id: req.user?.id || 'system',
      resource_type: 'budget',
      resource_id: `${budgetData.fiscal_year}`,
      action: 'CREATE',
      new_value: budgetData,
      metadata: { fiscal_year: budgetData.fiscal_year }
    });
    
    // Invalidate related caches
    await invalidateCache('/freee/budgets');
    await invalidateCache('/freee/budget-comparison');
    
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/budgets', async (req, res, next) => {
  try {
    const { fiscal_year, start_date, end_date } = req.query;
    
    if (!fiscal_year && (!start_date || !end_date)) {
      return res.status(400).json({
        error: true,
        message: 'Either fiscal_year or both start_date and end_date are required'
      });
    }
    
    const params = {
      company_id: process.env.FREEE_COMPANY_ID
    };
    
    if (fiscal_year) {
      params.fiscal_year = parseInt(fiscal_year);
    } else {
      params.start_date = start_date;
      params.end_date = end_date;
    }
    
    const result = await getBudget(params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/budget-comparison', async (req, res, next) => {
  try {
    const { start_date, end_date, group_by } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({
        error: true,
        message: 'start_date and end_date are required'
      });
    }
    
    const params = {
      company_id: process.env.FREEE_COMPANY_ID,
      start_date,
      end_date
    };
    
    if (group_by) {
      params.group_by = group_by;
    }
    
    const result = await compareBudgetToActual(params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// -----------------------
// 取引先年次集計
// -----------------------
router.get('/partner-yearly-summary', async (req, res, next) => {
  try {
    const { 
      fiscal_year, 
      start_date, 
      end_date,
      group_by_account,
      sort_by,
      include_zero
    } = req.query;
    
    if (!fiscal_year && (!start_date || !end_date)) {
      return res.status(400).json({
        error: true,
        message: 'Either fiscal_year or both start_date and end_date are required'
      });
    }
    
    const params = {
      company_id: process.env.FREEE_COMPANY_ID
    };
    
    if (fiscal_year) {
      params.fiscal_year = parseInt(fiscal_year);
    } else {
      params.start_date = start_date;
      params.end_date = end_date;
    }
    
    if (group_by_account === 'true') params.group_by_account = true;
    if (sort_by) params.sort_by = sort_by;
    if (include_zero === 'true') params.include_zero = true;
    
    const result = await getPartnerYearlySummary(params);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Error logging middleware
router.use(errorLoggerMiddleware);

export default router;