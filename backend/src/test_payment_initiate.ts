import { initiatePayment } from './modules/payments/payment.service.js';
import prisma from './lib/prisma.js';

async function main() {
  console.log('--- Simulating Payment Initiation ---');
  try {
    const actor = { id: 5, role: 'buyer' };
    const input = {
      invoiceId: 1,
      gateway: 'bank_transfer' as const,
      method: 'bank_transfer'
    };
    
    // Connect to prisma and run the service method
    const result = await initiatePayment(actor, input);
    console.log('Success:', JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('FAILED WITH ERROR:');
    console.error(error);
    if (error?.stack) {
      console.error(error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().then(() => process.exit(0));
