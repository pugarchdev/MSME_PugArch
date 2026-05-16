import { PrismaClient } from '@prisma/client'

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
