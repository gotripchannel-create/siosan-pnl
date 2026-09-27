// Универсальный Node-сервер для Timeweb App Platform.
// Vercel вызывает каждый файл из api/ отдельно; здесь те же обработчики работают
// в одном контейнере вместе со статической React-сборкой.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(rootDir, 'dist');
const port = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 8 * 1024 * 1024;

const apiModules = {
  '/api/ai-assistant': () => import('./api/ai-assistant.js'),
  '/api/cron-sync-invoices': () => import('./api/cron-sync-invoices.js'),
  '/api/iiko-cashshifts': () => import('./api/iiko-cashshifts.js'),
  '/api/iiko-dashboard': () => import('./api/iiko-dashboard.js'),
  '/api/iiko-day-report': () => import('./api/iiko-day-report.js'),
  '/api/iiko-expenses': () => import('./api/iiko-expenses.js'),
  '/api/iiko-invoices': () => import('./api/iiko-invoices.js'),
  '/api/iiko-menu': () => import('./api/iiko-menu.js'),
  '/api/iiko-test': () => import('./api/iiko-test.js'),
  '/api/insights': () => import('./api/insights.js'),
  '/api/parse-report': () => import('./api/parse-report.js'),
  '/api/vk-callback': () => import('./api/vk-callback.js'),
};

const mime = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
};

function responseAdapter(res) {
  return {
    status(code) { res.statusCode = code; return this; },
    setHeader(name, value) { res.setHeader(name, value); return this; },
    json(data) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    },
    send(data) { res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : String(data ?? '')); },
    end(data) { res.end(data); },
  };
}

async function readJsonBody(req) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE');
    parts.push(part);
  }
  const text = Buffer.concat(parts).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Error('INVALID_JSON'); }
}

async function serveFile(res, pathname) {
  const safePath = normalize(pathname).replace(/^([/\\])+/, '');
  const candidate = join(publicDir, safePath || 'index.html');
  if (!candidate.startsWith(publicDir)) return false;
  try {
    const info = await stat(candidate);
    if (!info.isFile()) return false;
    const extension = extname(candidate);
    res.statusCode = 200;
    res.setHeader('Content-Type', mime[extension] || 'application/octet-stream');
    res.setHeader('Cache-Control', extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
    res.end(await readFile(candidate));
    return true;
  } catch { return false; }
}

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const apiLoader = apiModules[url.pathname];
  if (apiLoader) {
    try {
      req.body = await readJsonBody(req);
      const { default: handler } = await apiLoader();
      await handler(req, responseAdapter(res));
    } catch (error) {
      if (!res.writableEnded) {
        const message = error?.message === 'REQUEST_TOO_LARGE' ? 'Запрос слишком большой.' : error?.message === 'INVALID_JSON' ? 'Некорректный JSON.' : 'Внутренняя ошибка сервера.';
        res.statusCode = error?.message === 'REQUEST_TOO_LARGE' ? 413 : 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: message }));
      }
      console.error('API error:', error);
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405; res.end('Method not allowed'); return;
  }
  if (await serveFile(res, decodeURIComponent(url.pathname))) return;
  // SPA fallback: ссылки вида /#dashboard и будущие клиентские маршруты.
  await serveFile(res, 'index.html');
}).listen(port, '0.0.0.0', () => console.log(`SIOSAN listening on :${port}`));
