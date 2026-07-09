import cors from 'cors';
import express from 'express';
import compression from 'compression';
import { corsOptions, preflightCors } from './config/cors.js';
import { applySecurityMiddleware } from './config/security.js';
import apiRouter from './routes/index.js';

export const createApp = () => {
  const app = express();

  app.use(preflightCors);
  app.use(cors(corsOptions));
  app.use(compression());
  applySecurityMiddleware(app);

  // Handle favicon requests gracefully to avoid 404 warnings
  app.get('/favicon.ico', (_req, res) => { res.status(204).end(); });
  app.get('/favicon.png', (_req, res) => { res.status(204).end(); });

  // Unified API Routing layer
  app.use('/api', apiRouter);

  return app;
};

