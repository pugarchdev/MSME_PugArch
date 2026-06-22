import '../src/config/env.js';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash('Password@123', 12);
  const user = await prisma.user.update({
    where: { email: 'snehalkolhe2628@gmail.com' },
    data: { password: passwordHash }
  });
  console.log('Password updated successfully for:', user.email);
  await prisma.$disconnect();
}

main().catch(console.error);
