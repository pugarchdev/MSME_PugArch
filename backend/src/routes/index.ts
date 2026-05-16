import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes.js';
import paymentRoutes from '../modules/payments/payment.routes.js';
import phase4Routes from './phase4.routes.js';

const router = Router();

// Register module routers
router.use('/auth', authRoutes);
router.use('/payments', paymentRoutes);
router.use('/', phase4Routes);

export default router;
