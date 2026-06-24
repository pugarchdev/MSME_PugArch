import net from 'net';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getBackendPort(filePath, timeoutMs = 90000) {
  const start = Date.now();
  console.log('Waiting for backend to bind and write port to .backend-port...');
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        const port = parseInt(content, 10);
        if (!isNaN(port) && port > 0) {
          return port;
        }
      } catch (e) {
        // file might be partially written, retry next loop
      }
    }
    await delay(200);
  }
  console.warn(`Timeout waiting for backend to write port file. Defaulting backend port to 5000.`);
  return 5000;
}

async function main() {
  try {
    const portFilePath = path.resolve(__dirname, '../.backend-port');

    // Clean up stale file
    if (fs.existsSync(portFilePath)) {
      try {
        fs.unlinkSync(portFilePath);
      } catch (e) {
        // ignore
      }
    }

    const port = await findFreePort(3000);
    const backendPort = await getBackendPort(portFilePath);
    console.log(`Detected backend running on port: ${backendPort}`);
    console.log(`Starting Next.js dev server on port ${port}...`);

    // Next.js executable lookup - locate the JS file first to run it directly via Node
    let nextBinPath = '';
    const possibleBinPaths = [
      path.resolve(__dirname, '../node_modules/next/dist/bin/next'),
      path.resolve(__dirname, '../frontend/node_modules/next/dist/bin/next')
    ];
    for (const p of possibleBinPaths) {
      if (fs.existsSync(p)) {
        nextBinPath = p;
        break;
      }
    }

    let spawnCmd = process.execPath;
    let spawnArgs = [nextBinPath, 'dev', '-p', String(port)];
    let useShell = false;

    if (!nextBinPath) {
      // Fallback: look for .cmd/shell binary
      let nextPath = '';
      const possiblePaths = [
        path.resolve(__dirname, '../node_modules/.bin/next'),
        path.resolve(__dirname, '../frontend/node_modules/.bin/next')
      ];
      for (const p of possiblePaths) {
        if (process.platform === 'win32') {
          if (fs.existsSync(p + '.cmd')) {
            nextPath = p + '.cmd';
            break;
          } else if (fs.existsSync(p + '.bat')) {
            nextPath = p + '.bat';
            break;
          } else if (fs.existsSync(p)) {
            nextPath = p;
            break;
          }
        } else {
          if (fs.existsSync(p)) {
            nextPath = p;
            break;
          }
        }
      }
      if (!nextPath) {
        nextPath = process.platform === 'win32' ? 'next.cmd' : 'next';
      }
      spawnCmd = nextPath;
      spawnArgs = ['dev', '-p', String(port)];
      useShell = true;
    }

    const child = spawn(spawnCmd, spawnArgs, {
      cwd: path.resolve(__dirname, '../frontend'),
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: useShell,
      env: {
        ...process.env,
        NEXT_PUBLIC_BACKEND_PORT: String(backendPort)
      }
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
