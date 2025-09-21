const levels = ['error', 'warn', 'info', 'debug'];
const currentLevel = process.env.LOG_LEVEL || 'info';

function shouldLog(level) {
  return levels.indexOf(level) <= levels.indexOf(currentLevel);
}

export function log(level, message, meta = {}) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = { level, message, ...meta };
  console.log(JSON.stringify(payload));
}

export function requestLogger(req, _res, next) {
  log('info', 'request', { method: req.method, path: req.path });
  next();
}
