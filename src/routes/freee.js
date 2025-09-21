import express from 'express';
import { getJournals, getItems } from '../services/freeeClient.js';
import { transformFreeeJournals } from '../transformers/freeeTransform.js';

const router = express.Router();

router.get('/journals', async (req, res, next) => {
  try {
    const raw = await getJournals(req.query);
    const transformed = transformFreeeJournals(raw);
    res.json({ data: transformed });
  } catch (error) {
    next(error);
  }
});

router.get('/items', async (req, res, next) => {
  try {
    const raw = await getItems(req.query);
    const transformed = raw.items.map(item => ({
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

export default router;
