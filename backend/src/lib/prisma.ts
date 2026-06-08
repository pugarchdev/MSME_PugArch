import '../config/env.js';
import { PrismaClient } from '@prisma/client'
import { invalidateByPattern } from '../services/cache.service.js';

const AFFECTED_MODELS = new Set([
  'cart', 'cartitem', 'procurementapproval', 'goodsreceiptnote', 
  'tender', 'purchaseorder', 'invoice', 'quoterequest', 'bid', 
  'deliverytracking', 'product', 'service', 'user', 'orgmembership', 'quoteresponse'
]);

const prismaClientSingleton = () => {
  const client = new PrismaClient()
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
            invalidateByPattern('cache:dashboard:summary:*').catch(err => {
              console.error('[Cache Invalidation] Failed to invalidate dashboard cache:', err);
            });
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
