import '../config/env.js';
import { PrismaClient } from '@prisma/client'
import { invalidateByPattern } from '../services/cache.service.js';

const AFFECTED_MODELS = new Set([
  'cart', 'cartitem', 'procurementapproval', 'goodsreceiptnote', 
  'tender', 'purchaseorder', 'invoice', 'quoterequest', 'bid', 
  'deliverytracking', 'product', 'service', 'user', 'orgmembership', 'quoteresponse'
]);

const prismaClientSingleton = () => {
  let dbUrl = process.env.DATABASE_URL;
  if (dbUrl && !dbUrl.includes('connection_limit=')) {
    dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'connection_limit=15';
  }
  const client = new PrismaClient(dbUrl ? {
    datasources: {
      db: {
        url: dbUrl
      }
    }
  } : undefined)
  return client.$extends({
    query: {
      financialLedgerEntry: {
        update() {
          throw new Error('Financial ledger entries are immutable; create a reversal entry instead.')
        },
        updateMany() {
          throw new Error('Financial ledger entries are immutable; create reversal entries instead.')
        },
        delete() {
          throw new Error('Financial ledger entries are immutable; create a reversal entry instead.')
        },
        deleteMany() {
          throw new Error('Financial ledger entries are immutable; create reversal entries instead.')
        }
      },
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (
            model &&
            AFFECTED_MODELS.has(model.toLowerCase()) &&
            ['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany'].includes(operation)
          ) {
            // Optimize User update invalidations to prevent unnecessary invalidations on lastLoginAt, etc.
            let shouldInvalidateSummary = true;
            const modelLower = model.toLowerCase();
            
            if (modelLower === 'user') {
              if (operation === 'update' || operation === 'updateMany') {
                const dataKeys = (args as any)?.data ? Object.keys((args as any).data) : [];
                const kpiAffectingFields = ['onboardingStatus', 'role', 'organizationId'];
                shouldInvalidateSummary = dataKeys.some(key => kpiAffectingFields.includes(key));
              }
              
              // Proactively invalidate user auth cache when user details/roles/status are modified
              const userId = (args as any)?.where?.id;
              if (userId) {
                queueMicrotask(() => {
                  invalidateByPattern(`cache:auth:user:${userId}:*`).catch(() => {});
                });
              }
            }

            if (shouldInvalidateSummary) {
              queueMicrotask(() => {
                invalidateByPattern('cache:dashboard:summary:*').catch(err => {
                  console.error('[Cache Invalidation] Failed to invalidate dashboard cache:', err);
                });
                invalidateByPattern('cache:admin:kpi-summary').catch(err => {
                  console.error('[Cache Invalidation] Failed to invalidate admin KPI cache:', err);
                });
              });
            }
          }
          return result;
        }
      }
    }
  })
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
