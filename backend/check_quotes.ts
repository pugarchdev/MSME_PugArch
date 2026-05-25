import prisma from './src/config/prisma.js';

async function main() {
  const rfq = await prisma.quoteRequest.findUnique({
    where: { id: 10 },
    include: {
      quoteResponses: true,
      seller: { select: { id: true, name: true } },
      buyer: { select: { id: true, name: true } }
    }
  });

  console.log('Database RFQ:', JSON.stringify(rfq, null, 2));

  // Simulating quoteRequestToRecord mapping
  const response = rfq.quoteResponses && rfq.quoteResponses.length > 0 ? rfq.quoteResponses[0] : null;
  const amount = response ? Number(response.totalAmount || 0) : Number(rfq.estimatedValue || 0);
  
  const mapped = {
    id: Number(rfq.id),
    source: 'rfq',
    sellerId: Number(rfq.sellerId),
    buyerId: Number(rfq.buyerId),
    unitPrice: amount,
    quantity: response ? (response.totalAmount ? 1 : 0) : (rfq.estimatedValue ? 1 : 0),
    deliveryDays: Number(response?.deliveryDays || 0),
    validTill: response?.validityDate,
    status: response ? response.status : rfq.status,
    note: response?.notes || rfq.message,
    documentUrl: response?.documentUrl || null,
    documentName: response?.documentName || null,
    rfqDocumentUrl: rfq.documentUrl || null,
    rfqDocumentName: rfq.documentName || null,
    seller: rfq.seller,
    buyer: rfq.buyer,
  };

  console.log('Mapped Quotation:', JSON.stringify(mapped, null, 2));
}

main().catch(console.error);
