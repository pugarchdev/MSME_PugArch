import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getMsmeInsight } from '../controllers/ai.controller.js';

const router = Router();

// Gated behind authenticate middleware to prevent unauthenticated access
router.post('/msme-insight', authenticate, getMsmeInsight);

export default router;
export { router as aiRoutes };
