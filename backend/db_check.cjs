const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const attachQuoteResponseFileAssets = async (rows) => {
  return rows.map(row => {
    // If it's a Prisma model instance, spreading it directly {...row} can sometimes omit fields depending on Prisma version!
    // Let's test standard serialization vs spread:
    console.log("SPREAD ROW:", { ...row });
    console.log("JSON SERIALIZED SPREAD ROW:", { ...JSON.parse(JSON.stringify(row)) });
    return {
      ...row,
      test: true
    };
  });
};

db.quoteRequest.findUnique({
  where: { id: 4 },
  include: {
    quoteResponses: true,
    buyer: { select: { id: true, name: true, email: true } },
    seller: { select: { id: true, name: true, email: true } }
  }
})
.then(async (quote) => {
  console.log("ORIGINAL QUOTE FROM DB:", quote);
  const res = await attachQuoteResponseFileAssets([quote]);
  console.log("ENRICHED QUOTE:", res[0]);
  console.log("JSON STRINGIFIED ENRICHED:", JSON.stringify(res[0]));
})
.catch(console.error)
.finally(() => db.$disconnect());
