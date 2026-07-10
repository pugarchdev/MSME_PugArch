import prisma from '../lib/prisma.js';
import { verifyPassword } from './password.service.js';

const PASSWORD_HISTORY_LIMIT = 10;

export const assertPasswordNotReused = async (userId: number, newPassword: string, currentPasswordHash?: string) => {
  if (currentPasswordHash && await verifyPassword(newPassword, currentPasswordHash)) {
    throw new Error('PASSWORD_REUSED');
  }

  const histories = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_HISTORY_LIMIT,
    select: { passwordHash: true }
  });

  for (const history of histories) {
    if (await verifyPassword(newPassword, history.passwordHash)) {
      throw new Error('PASSWORD_REUSED');
    }
  }
};

export const rememberPreviousPassword = async (userId: number, passwordHash: string) => {
  await prisma.passwordHistory.create({ data: { userId, passwordHash } });

  const stale = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: PASSWORD_HISTORY_LIMIT,
    select: { id: true }
  });

  if (stale.length > 0) {
    await prisma.passwordHistory.deleteMany({ where: { id: { in: stale.map(row => row.id) } } });
  }
};
