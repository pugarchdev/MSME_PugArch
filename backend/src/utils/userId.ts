import prisma from '../lib/prisma.js';
import { randomToken } from './crypto.js';

export const generateAlphanumericUserId = async (): Promise<string> => {
  const year = new Date().getFullYear();
  let attempts = 0;
  while (attempts < 10) {
    const suffix = randomToken(3).toUpperCase(); // 6 characters hex
    const generated = `USR-${year}-${suffix}`;
    const existing = await (prisma as any).user.findUnique({ where: { userId: generated } });
    if (!existing) {
      return generated;
    }
    attempts++;
  }
  throw new Error('Failed to generate unique alphanumeric user ID');
};
