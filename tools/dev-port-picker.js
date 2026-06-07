import net from 'net';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port);
  });
}

async function findFreePort(startPort, maxAttempts = 11) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await checkPort(port)) {
      return port;
    }
  }
  throw new Error(`Could not find a free port starting from ${startPort}`);
}

async function main() {
  try {
    const port = await findFreePort(3000);
    console.log(`Starting Next.js dev server on port ${port}...`);

    // Next.js executable is in node_modules/.bin/next
    const nextPath = path.resolve(__dirname, '../frontend/node_modules/.bin/next');
    const child = spawn(nextPath, ['dev', '-p', String(port)], {
      cwd: path.resolve(__dirname, '../frontend'),
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      process.exit(code || 0);
    });
  } catch (err) {
    console.error('Failed to start frontend dev server:', err);
    process.exit(1);
  }
}

main();
