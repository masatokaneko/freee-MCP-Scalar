import express from 'express';
import freeeRouter from './freee.js';
import quickbooksRouter from './quickbooks.js';

const router = express.Router();

router.use('/freee', freeeRouter);
router.use('/quickbooks', quickbooksRouter);

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default router;
