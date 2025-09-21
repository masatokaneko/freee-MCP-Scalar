import express from 'express';
import dotenv from 'dotenv';
import { initializeTokens } from './src/services/tokenManager.js';
import { requestLoggerMiddleware, errorLoggerMiddleware, cleanOldLogs } from './src/utils/errorLogger.js';
import { initializeCache } from './src/services/cache.js';
import { initializeAuditLog } from './src/services/auditLog.js';
import { initializeBudgetStorage } from './src/services/budgetStorage.js';
import freeeRoutes from './src/routes/freeeRoutes.js';
import auditRoutes from './src/routes/auditRoutes.js';

dotenv.config();

const app = express();
app.use(express.json());

// Global request logging middleware
app.use(requestLoggerMiddleware);

const PORT = process.env.PORT || 3000;

// Initialize services on startup
Promise.all([
  initializeTokens(),
  initializeCache(),
  initializeAuditLog(),
  initializeBudgetStorage()
]).then(() => {
  console.log('Services initialized successfully');
}).catch(err => {
  console.error('Failed to initialize services:', err);
});

// Schedule daily cleanup of old logs
setInterval(() => {
  cleanOldLogs(30).catch(console.error);
}, 24 * 60 * 60 * 1000);

// -----------------------
// Health check endpoint
// -----------------------
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// -----------------------
// API routes
// -----------------------
app.use('/freee', freeeRoutes);
app.use('/audit', auditRoutes);

// -----------------------
// Root endpoint
// -----------------------
app.get('/', (req, res) => {
  res.json({
    name: 'freee MCP Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      freee: {
        journals: '/freee/journals',
        account_items: '/freee/account_items',
        partners: '/freee/partners',
        items: '/freee/items',
        sections: '/freee/sections',
        taxes: '/freee/taxes',
        tags: '/freee/tags',
        variance_analysis: '/freee/variance-analysis',
        monthly_trends: '/freee/monthly-trends',
        entry_route_analysis: '/freee/entry-route-analysis',
        budgets: '/freee/budgets',
        budget_comparison: '/freee/budget-comparison',
        partner_yearly_summary: '/freee/partner-yearly-summary'
      },
      audit: {
        logs: '/audit/logs',
        statistics: '/audit/statistics',
        export: '/audit/export',
        verify: '/audit/verify/:id',
        summary_by_events: '/audit/summary/events',
        summary_by_users: '/audit/summary/users'
      }
    }
  });
});

// -----------------------
// 404 handler
// -----------------------
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: 'Endpoint not found',
    path: req.path
  });
});

// -----------------------
// Error handling middleware
// -----------------------
app.use(errorLoggerMiddleware);

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: true,
    message: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`freee MCP server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});