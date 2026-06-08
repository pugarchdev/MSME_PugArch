const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.quoteRequest.findMany({
  select: { id: true, deadlineDate: true, subject: true }
})
.then(rows => {
  console.log("ROWS:", rows);
})
.catch(console.error)
.finally(() => db.$disconnect());
