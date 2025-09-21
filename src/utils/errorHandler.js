import { log } from './logger.js';

export function errorHandler(err, _req, res, _next) {
  log('error', err.message, { stack: err.stack });
  res.status(500).json({
    error: {
      message: err.message,
    },
  });
}
