import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  gateway: z.enum(['bandhan', 'bank_transfer']).optional(),
  method: z.enum(['upi', 'card', 'netbanking', 'bank_transfer', 'wallet']).default('bank_transfer'),
  idempotencyKey: z.string().min(8).max(128).optional()
});

export const createMilestoneSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(500).optional(),
  amount: z.coerce.number().positive(),
  dueDate: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const milestoneReasonSchema = z.object({
  reason: z.string().max(500).optional()
});
