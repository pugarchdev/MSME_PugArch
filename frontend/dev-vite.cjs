const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const originalExecFile = cp.execFile;

cp.execFile = function patchedExecFile(file, args, options, callback) {
  let finalArgs = args;
  let finalOptions = options;
  let finalCallback = callback;

  if (typeof finalArgs === 'function') {
    finalCallback = finalArgs;
    finalArgs = [];
    finalOptions = {};
  } else if (typeof finalOptions === 'function') {
    finalCallback = finalOptions;
    finalOptions = {};
  }

  finalArgs = Array.isArray(finalArgs) ? finalArgs : [];
  finalOptions = finalOptions || {};

  try {
    return originalExecFile(file, finalArgs, finalOptions, finalCallback);
  } catch (err) {
    if (err && err.code !== 'EPERM') {
      throw err;
    }
  }

  const child = cp.spawn(file, finalArgs, {
    ...finalOptions,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  let stdout = '';
  let stderr = '';

  if (child.stdout) {
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
  }

  child.on('error', spawnErr => {
    if (typeof finalCallback === 'function') {
      finalCallback(spawnErr, stdout, stderr);
    }
  });

  child.on('close', code => {
    if (typeof finalCallback === 'function') {
      if (code === 0) {
        finalCallback(null, stdout, stderr);
      } else {
        const closeErr = new Error(`Command failed: ${file} ${finalArgs.join(' ')}`);
        closeErr.code = code;
        finalCallback(closeErr, stdout, stderr);
      }
    }
  });

  return child;
};

async function start() {
  const bundledEsbuildPath = path.resolve(
    __dirname,
    '../node_modules/vite/node_modules/@esbuild/win32-x64/esbuild.exe'
  );
  const fallbackEsbuildPath = 'C:\\tmp\\esbuild.exe';
  try {
    fs.mkdirSync('C:\\tmp', { recursive: true });
    fs.copyFileSync(bundledEsbuildPath, fallbackEsbuildPath);
    process.env.ESBUILD_BINARY_PATH = fallbackEsbuildPath;
  } catch {
    // If copy fails, continue with default esbuild path.
  }

  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: require('node:path').resolve(__dirname, 'vite.config.ts')
  });
  await server.listen();
  server.printUrls();
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
