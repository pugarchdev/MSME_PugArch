import cors from 'cors';
import express from 'express';
import { corsOptions } from './config/cors.js';
import { applySecurityMiddleware } from './config/security.js';
import apiRouter from './routes/index.js';

export const createApp = () => {
  const app = express();

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  applySecurityMiddleware(app);

  // Unified API Routing layer
  app.use('/api', apiRouter);

  return app;
};

