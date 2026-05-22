import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

export const requestLogger = pinoHttp({
  logger,
  genReqId: req => req.id,
  autoLogging: {
    ignore: req => req.url?.startsWith('/api/notifications/stream') ?? false
  },
  customProps: req => ({
    actorId: (req as any).user?.id,
    actorRole: (req as any).user?.role
  }),
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort
      };
    }
  }
});
