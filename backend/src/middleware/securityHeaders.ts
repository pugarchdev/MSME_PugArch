import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "font-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'", "https:", "wss:"],
      "form-action": ["'self'"],
      "upgrade-insecure-requests": []
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  hsts: {
    maxAge: 15552000,
    includeSubDomains: true,
    preload: false
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' }
});
