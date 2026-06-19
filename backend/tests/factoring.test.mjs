import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(root, 'backend', '.env') });
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const backendIndex = read('backend/src/routes/index.ts');
const schemaPrisma = read('backend/prisma/schema.prisma');
const deliveryServiceFile = read('backend/src/modules/delivery/delivery.service.ts');
const permissionsFile = read('backend/src/constants/permissions.ts');
const adminRoutes = read('backend/src/routes/master-admin.routes.ts');

test('Invoice Factoring schema, roles, and route configurations are in place', () => {
  // Verify schema declarations
  assert.match(schemaPrisma, /model InvoiceFactoring/, 'InvoiceFactoring model must be defined in schema.prisma');
  assert.match(schemaPrisma, /enum Role\s*{[^}]*financier/s, 'Role enum must include financier in schema.prisma');
  assert.match(schemaPrisma, /factoring\s+InvoiceFactoring\?/, 'Invoice must have a relation to InvoiceFactoring');

  // Verify route registration
  assert.match(backendIndex, /import factoringRoutes from '\.\/factoring\.routes\.js';/, 'factoringRoutes must be imported in routes index.ts');
  assert.match(backendIndex, /router\.use\('\/', factoringRoutes\);/, 'factoringRoutes must be mounted in routes index.ts');

  // Verify static permission registrations
  assert.match(permissionsFile, /financier:\s*\[\s*PERMISSIONS\.BANNER_VIEW\s*\]/, 'financier role must be registered in static role permissions');

  // Verify admin permitted user roles
  assert.match(adminRoutes, /allowedRoles\s*=\s*new\s+Set\(\[[^\]]*'financier'[^\]]*\]\)/, 'allowedRoles in master admin must include financier');
});

test('Delivery payment settlement redirection for factored invoices', () => {
  assert.match(deliveryServiceFile, /tx\.invoiceFactoring\.findUnique/, 'deliveryService must findInvoiceFactoring in releasePayment');
  assert.match(deliveryServiceFile, /status\s*===\s*'DISBURSED'/, 'deliveryService must check if factoring status is DISBURSED');
  assert.match(deliveryServiceFile, /status:\s*'SETTLED'/, 'deliveryService must set factoring status to SETTLED');
  assert.match(deliveryServiceFile, /\[Invoice Factored - Settled to Financier\]/, 'deliveryService must prefix remarks with redirection note');
});

test('Database integration: Invoice Factoring full happy path flow', async t => {
  if (process.env.RUN_DB_INTEGRATION !== '1') {
    t.skip('Set RUN_DB_INTEGRATION=1 with TEST_DATABASE_URL to run database-backed integration tests.');
    return;
  }
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    t.skip('TEST_DATABASE_URL or DATABASE_URL must be set.');
    return;
  }

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const suffix = Date.now();
  const sellerEmail = `factoring-seller-${suffix}@example.test`;
  const financierEmail = `factoring-financier-${suffix}@example.test`;
  const buyerEmail = `factoring-buyer-${suffix}@example.test`;

  let seller, financier, buyer, company, purchaseOrder, invoice, factoring;

  try {
    // 1. Create company and users
    company = await prisma.company.create({
      data: {
        name: `Factoring Test Company ${suffix}`,
        shortName: `FTC${suffix}`,
        portalDisplayName: 'Factoring Test Portal'
      }
    });

    seller = await prisma.user.create({
      data: { name: 'Factoring Seller', email: sellerEmail, password: 'hash', role: 'seller', companyId: company.id }
    });

    financier = await prisma.user.create({
      data: { name: 'Factoring Financier', email: financierEmail, password: 'hash', role: 'financier', companyId: company.id }
    });

    buyer = await prisma.user.create({
      data: { name: 'Factoring Buyer', email: buyerEmail, password: 'hash', role: 'buyer', companyId: company.id }
    });

    // 2. Create Purchase Order and Invoice in APPROVED state
    purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-FAC-${suffix}`,
        title: 'Factoring PO',
        amount: 100000.00,
        totalValue: 100000.00,
        buyerId: buyer.id,
        sellerId: seller.id,
        status: 'accepted'
      }
    });

    invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-FAC-${suffix}`,
        purchaseOrderId: purchaseOrder.id,
        sellerId: seller.id,
        buyerId: buyer.id,
        amount: 100000.00,
        status: 'approved',
        invoiceStatus: 'APPROVED'
      }
    });

    // 3. Initiate factoring request (Seller)
    factoring = await prisma.invoiceFactoring.create({
      data: {
        invoiceId: invoice.id,
        sellerId: seller.id,
        status: 'INITIATED',
        requestedAmount: 100000.00
      }
    });
    assert.equal(factoring.status, 'INITIATED');

    // 4. Submit factoring offer (Financier)
    factoring = await prisma.invoiceFactoring.update({
      where: { id: factoring.id },
      data: {
        status: 'OFFERED',
        financierId: financier.id,
        discountRate: 2.5,
        feeAmount: 500,
        factoredAmount: 97000.00,
        repaymentAmount: 100000.00
      }
    });
    assert.equal(factoring.status, 'OFFERED');
    assert.equal(Number(factoring.factoredAmount), 97000.00);

    // 5. Accept factoring offer (Seller)
    factoring = await prisma.invoiceFactoring.update({
      where: { id: factoring.id },
      data: { status: 'ACCEPTED' }
    });
    assert.equal(factoring.status, 'ACCEPTED');

    // 6. Disburse factoring request (Financier)
    factoring = await prisma.invoiceFactoring.update({
      where: { id: factoring.id },
      data: { status: 'DISBURSED' }
    });
    assert.equal(factoring.status, 'DISBURSED');

    // 7. Verify that payment settlement redirection works
    const delivery = await prisma.deliveryTracking.create({
      data: {
        purchaseOrderId: purchaseOrder.id,
        status: 'PAYMENT_APPROVED'
      }
    });

    const settlement = await prisma.paymentSettlement.create({
      data: {
        deliveryTrackingId: delivery.id,
        invoiceId: invoice.id,
        status: 'APPROVED'
      }
    });

    // Import deliveryService dynamically to perform payment release
    const { deliveryService } = await import('../dist/src/modules/delivery/delivery.service.js');
    await deliveryService.releasePayment(
      { id: financier.id, role: 'admin', ipAddress: '127.0.0.1', userAgent: 'test-agent' },
      delivery.id,
      { transactionReference: 'TXN-FACT-999', netReleasedAmount: 100000.00, remarks: 'Payout released' }
    );

    // Verify factoring is now SETTLED
    const finalFactoring = await prisma.invoiceFactoring.findUnique({
      where: { invoiceId: invoice.id }
    });
    assert.equal(finalFactoring.status, 'SETTLED');

    // Verify settlement record is updated with financier redirection info
    const finalSettlement = await prisma.paymentSettlement.findUnique({
      where: { deliveryTrackingId: delivery.id }
    });
    assert.equal(finalSettlement.status, 'RELEASED');
    assert.match(finalSettlement.remarks, /\[Invoice Factored - Settled to Financier\]/);
    assert.equal(finalSettlement.metadata.factored, true);
    assert.equal(finalSettlement.metadata.financierId, financier.id);

  } finally {
    // Cleanup records in reverse dependency order
    if (invoice?.id) {
      await prisma.paymentSettlement.deleteMany({ where: { invoiceId: invoice.id } }).catch(() => undefined);
      await prisma.invoiceFactoring.deleteMany({ where: { invoiceId: invoice.id } }).catch(() => undefined);
      await prisma.invoice.delete({ where: { id: invoice.id } }).catch(() => undefined);
    }
    if (purchaseOrder?.id) {
      await prisma.deliveryTracking.deleteMany({ where: { purchaseOrderId: purchaseOrder.id } }).catch(() => undefined);
      await prisma.purchaseOrder.delete({ where: { id: purchaseOrder.id } }).catch(() => undefined);
    }
    if (seller?.id) await prisma.user.delete({ where: { id: seller.id } }).catch(() => undefined);
    if (financier?.id) await prisma.user.delete({ where: { id: financier.id } }).catch(() => undefined);
    if (buyer?.id) await prisma.user.delete({ where: { id: buyer.id } }).catch(() => undefined);
    if (company?.id) await prisma.company.delete({ where: { id: company.id } }).catch(() => undefined);

    await prisma.$disconnect();
  }
});
