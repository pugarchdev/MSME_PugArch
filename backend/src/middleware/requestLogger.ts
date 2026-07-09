import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

export const requestLogger = pinoHttp({
  logger,
  genReqId: req => req.id,
  autoLogging: {
    ignore: req => req.url?.startsWith('/api/notifications/stream') ?? false
  },
  customLogLevel: (req: any, res: any) => {
    const url = String(req.url || '');
    if (res.statusCode === 401 && (url.includes('/auth/me') || url.includes('/auth/refresh') || url.includes('/auth/logout'))) {
      return 'silent';
    }
    if (res.statusCode === 404 && (url.includes('favicon.ico') || url.includes('favicon.png'))) {
      return 'silent';
    }
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: req => ({
    actorId: (req as any).user?.id,
    actorRole: (req as any).user?.role
  }),
  customSuccessMessage: (req: any, res: any, responseTime: number) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${responseTime}ms`;
  },
  customErrorMessage: (req: any, res: any, err: Error) => {
    return `${req.method} ${req.url} ${res.statusCode} - Error: ${err.message}`;
  },
  serializers: {
    req(req) {
      if (process.env.NODE_ENV === 'production') {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
          remotePort: req.remotePort
        };
      }
      return undefined;
    },
    res(res) {
      if (process.env.NODE_ENV === 'production') {
        return {
          statusCode: res.statusCode
        };
      }
      return undefined;
    }
  }
});

