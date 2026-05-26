import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes.js';
import paymentRoutes from '../modules/payments/payment.routes.js';
import deliveryRoutes from '../modules/delivery/delivery.routes.js';
import ratingsRoutes from '../modules/ratings/ratings.routes.js';
import phase4Routes from './phase4.routes.js';
import orgRoutes from './org.routes.js';
import cartRoutes from './cart.routes.js';
import approvalsRoutes from './approvals.routes.js';
import grnRoutes from './grn.routes.js';
import tenderEvalRoutes from './tender-evaluation.routes.js';
import prisma from '../config/prisma.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const checks = {
    api: 'ok',
    database: 'unknown',
    coreTables: {} as Record<string, boolean>
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';

    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('User', 'Tender', 'PaymentTransaction', 'EscrowAccount', '_prisma_migrations')
    `;
    const existing = new Set(rows.map(row => row.table_name));
    for (const table of ['User', 'Tender', 'PaymentTransaction', 'EscrowAccount', '_prisma_migrations']) {
      checks.coreTables[table] = existing.has(table);
    }

    return res.json({ success: true, checks });
  } catch (error) {
    console.error('[HealthCheck]', error);
    checks.database = 'error';
    return res.status(503).json({
      success: false,
      message: 'Database health check failed',
      checks
    });
  }
});

// Register module routers
router.use('/auth', authRoutes);
router.use('/payments', paymentRoutes);
router.use('/delivery', deliveryRoutes);
router.use('/ratings', ratingsRoutes);
router.use('/', orgRoutes);
router.use('/', cartRoutes);
router.use('/', approvalsRoutes);
router.use('/', grnRoutes);
router.use('/', tenderEvalRoutes);
router.use('/', phase4Routes);

export default router;
