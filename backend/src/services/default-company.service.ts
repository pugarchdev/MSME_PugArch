import prisma from '../lib/prisma.js';

type PrismaLike = typeof prisma;

const DEFAULT_COMPANY_NAME = 'JsgSmile';
const DEFAULT_PORTAL_DISPLAY_NAME = 'JsgSmile Portal';

export const getDefaultCompany = async (client?: PrismaLike) => {
  const db = (client || prisma) as PrismaLike;

  const byName = await db.company.findFirst({
    where: {
      name: { equals: DEFAULT_COMPANY_NAME, mode: 'insensitive' }
    },
    select: { id: true, name: true, portalDisplayName: true, isActive: true }
  }).catch(() => null);
  if (byName) return byName;

  const byPortalName = await db.company.findFirst({
    where: {
      portalDisplayName: { equals: DEFAULT_PORTAL_DISPLAY_NAME, mode: 'insensitive' }
    },
    select: { id: true, name: true, portalDisplayName: true, isActive: true }
  }).catch(() => null);
  if (byPortalName) return byPortalName;

  const firstActive = await db.company.findFirst({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, portalDisplayName: true, isActive: true }
  }).catch(() => null);
  if (firstActive) return firstActive;

  return db.company.create({
    data: {
      name: DEFAULT_COMPANY_NAME,
      portalDisplayName: DEFAULT_PORTAL_DISPLAY_NAME,
      isActive: true
    },
    select: { id: true, name: true, portalDisplayName: true, isActive: true }
  });
};

export const getDefaultCompanyId = async (client?: PrismaLike) => {
  const company = await getDefaultCompany(client);
  return company.id;
};

