import prisma from './config/prisma.js';

async function checkLogs() {
  const db = prisma as any;
  try {
    const notifs = await db.notification.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });
    console.log('Recent Notifications:');
    console.log(JSON.stringify(notifs, null, 2));

    const logs = await db.notificationLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });
    console.log('Recent Notification Logs:');
    console.log(JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Error fetching logs:', error);
  }
}

checkLogs().then(() => process.exit(0));
