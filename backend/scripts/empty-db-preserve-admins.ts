import '../src/config/env.js';
import prisma from '../src/lib/prisma.js';

type TableRef = {
  schemaName: string;
  tableName: string;
};

const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;

const qualifiedTable = ({ schemaName, tableName }: TableRef) =>
  `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`;

async function main() {
  const preservedUsers = await prisma.user.findMany({
    where: { role: { in: ['admin', 'master_admin'] } },
    orderBy: { id: 'asc' }
  });

  if (preservedUsers.length === 0) {
    throw new Error('No admin or master_admin users found. Refusing to empty the database.');
  }

  const usersToRestore = preservedUsers.map(user => ({
    ...user,
    companyId: null,
    organizationId: null
  }));

  const tables = await prisma.$queryRaw<TableRef[]>`
    SELECT table_schema AS "schemaName", table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name ASC
  `;

  if (tables.length === 0) {
    throw new Error('No public database tables found to truncate.');
  }

  const tableList = tables.map(qualifiedTable).join(', ');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    await tx.user.createMany({ data: usersToRestore });

    const maxId = Math.max(...preservedUsers.map(user => user.id));
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"User"', 'id'), ${maxId}, true)`
    );
  }, { timeout: 120_000, maxWait: 120_000 });

  console.log(JSON.stringify({
    preservedUsers: preservedUsers.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus
    })),
    truncatedTables: tables.map(table => table.tableName)
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('Database reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
