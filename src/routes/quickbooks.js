import express from 'express';
import { getQuickBooksJournals } from '../services/quickbooksClient.js';
import { transformQuickBooksJournals } from '../transformers/qbTransform.js';

const router = express.Router();

router.get('/journals', async (req, res, next) => {
  try {
    const raw = await getQuickBooksJournals(req.query);
    const transformed = transformQuickBooksJournals(raw);
    res.json({ data: transformed });
  } catch (error) {
    next(error);
  }
});

export default router;
