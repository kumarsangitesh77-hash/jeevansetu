import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';
import { router } from './routes.js';
import { HttpError } from './lib/errors.js';
import { requestId, securityHeaders, cors, requestLogger, logger } from './lib/http.js';

function apiNotFound(req, res, next) {
  next(new HttpError(404, `No API route matches ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity.
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  // Body-parser failures surface as generic SyntaxErrors.
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = `Request body exceeds the ${config.bodyLimit} limit`;
  } else if (err.code === 'ERR_INVALID_ARG_TYPE') {
    status = 400;
    message = 'Malformed request';
  }

  const isServerError = status >= 500;
  const body = {
    error: {
      message: isServerError && config.isProduction ? 'Internal server error' : message,
      status,
      path: req.originalUrl,
      requestId: req.id
    }
  };
  if (details) body.error.details = details;

  if (isServerError) {
    logger.error('unhandled error', { requestId: req.id, path: req.originalUrl, stack: err.stack });
  } else {
    logger.debug('request error', { requestId: req.id, status, message });
  }

  if (res.headersSent) return;
  res.status(status).json(body);
}

function serveClient(app) {
  const indexHtml = path.join(config.clientDist, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    app.get('/', (req, res) => {
      res
        .status(503)
        .type('text/plain; charset=utf-8')
        .send(
          'JeevanSetu API is running, but no frontend build was found.\n\n' +
          '  Run:  npm run build\n' +
          '  then: npm start\n\n' +
          'For development with hot reload instead run:  npm run dev\n'
        );
    });
    return;
  }

  // Vite emits content-hashed filenames under /assets, so those are immutable.
  // index.html must never be cached or a redeploy serves a stale bundle reference.
  app.use(
    express.static(config.clientDist, {
      index: false,
      etag: true,
      maxAge: config.isProduction ? '1h' : 0,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('.html')) {
          res.setHeader('cache-control', 'no-cache');
        }
      }
    })
  );

  // SPA fallback: any non-API GET that did not match a file renders the app shell.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('cache-control', 'no-cache');
    res.sendFile(indexHtml, (err) => {
      if (err && !res.headersSent) next(err);
    });
  });
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Behind a reverse proxy set TRUST_PROXY=1 so rate limiting sees the real client.
  app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || true : false);
  app.set('json spaces', 0);

  app.use(requestId);
  app.use(securityHeaders);
  app.use(cors);
  app.use(requestLogger);
  app.use(express.json({ limit: config.bodyLimit, strict: true }));
  app.use(express.urlencoded({ extended: false, limit: config.bodyLimit }));

  app.get('/api', (req, res) => {
    res.json({
      service: 'JeevanSetu API',
      version: '2.0.0',
      docs: '/api/health · /api/capabilities · /api/stats',
      notice: 'Demo service using synthetic data. Not a diagnosis and not an emergency service.'
    });
  });

  app.use('/api', router);
  app.use('/api', apiNotFound);

  serveClient(app);

  // Reached only when nothing matched: an unknown non-GET path, or no frontend build.
  // eslint-disable-next-line no-unused-vars
  app.use((req, res, next) => next(new HttpError(404, `Nothing is served at ${req.method} ${req.path}`)));
  app.use(errorHandler);

  return app;
}

export default createApp;
