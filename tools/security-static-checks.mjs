import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const requiredDocs = [
  'SECURITY.md',
  'THREAT_MODEL.md',
  'DATA_CLASSIFICATION.md',
  'API_SECURITY_CHECKLIST.md',
  'DEPLOYMENT_SECURITY_CHECKLIST.md',
  'INCIDENT_RESPONSE.md',
  'AUDIT_LOG_EVENTS.md'
];

for (const doc of requiredDocs) {
  assert.ok(fs.existsSync(path.join(root, doc)), `${doc} is required for audit evidence`);
}

const gitignore = read('.gitignore');
assert.match(gitignore, /^\.env$/m, '.env must be ignored');
assert.match(gitignore, /^\.env\.local$/m, '.env.local must be ignored');

const backendIndex = read('backend/index.ts');
const backendSecuritySurface = [
  backendIndex,
  read('backend/src/app.ts'),
  read('backend/src/config/security.ts'),
  read('backend/src/middleware/securityHeaders.ts'),
  read('backend/src/middleware/rateLimit.ts'),
  read('backend/src/services/storage/storage.service.ts'),
  read('backend/src/services/workflow/tender-workflow.service.ts')
].join('\n');
const schema = read('backend/prisma/schema.prisma');
const walk = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    })
  : [];

const requiredSecurityPatterns = [
  ['helmet/security middleware', 'applySecurityMiddleware'],
  ['Redis rate limiting', 'authLoginRateLimit'],
  ['centralized audit logging', 'auditLog'],
  ['Zod request validation', 'parseSchema'],
  ['safe route errors', 'handleSecureRouteError'],
  ['file validation', 'validateFile'],
  ['payment idempotency', 'withIdempotency'],
  ['webhook replay table', 'PaymentWebhookEvent'],
  ['auction Redis lock', 'redisKeys.lockAuction'],
  ['message anti-spam', "consumeActionBudget(req, 'messages'"],
  ['dispute access controls', 'canAccessDispute'],
  ['grievance access controls', 'canAccessGrievance']
];

for (const [name, pattern] of requiredSecurityPatterns) {
  assert.ok(backendSecuritySurface.includes(pattern) || schema.includes(pattern), `Missing security pattern: ${name}`);
}

const forbiddenSourcePatterns = [
  [/console\.log\([^)]*JWT_SECRET/i, 'JWT secret must not be logged'],
  [/console\.log\([^)]*DATABASE_URL/i, 'database URL must not be logged'],
  [/console\.(log|error|warn)\([^)]*password/i, 'password values must not be logged'],
  [/res\.json\([^)]*\bpassword\s*:/i, 'password fields must not be returned'],
  [/res\.json\(\s*err\b/i, 'raw errors must not be returned']
];

for (const [regex, message] of forbiddenSourcePatterns) {
  assert.equal(regex.test(backendIndex), false, message);
}

for (const file of walk(path.join(root, 'frontend'))) {
  if (!/\.(html|tsx|ts|jsx|js)$/.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const externalScripts = source.match(/<script\b[^>]*\bsrc=["']https?:\/\/[^"']+["'][^>]*>/gi) || [];
  for (const tag of externalScripts) {
    assert.match(tag, /\bintegrity=["'][^"']+["']/i, `${path.relative(root, file)} external script missing SRI integrity`);
    assert.match(tag, /\bcrossorigin=["']anonymous["']/i, `${path.relative(root, file)} external script missing crossorigin="anonymous"`);
  }
}

console.log('Static security checks passed');
