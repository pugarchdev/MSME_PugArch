import { logger } from '../config/logger.js';

export interface SafeAsyncOptions {
  context?: string;
  fallback?: unknown;
  rethrow?: boolean;
  logLevel?: 'warn' | 'error' | 'debug';
}

export const safeAsync = async <T>(
  promise: Promise<T>,
  options: SafeAsyncOptions = {}
): Promise<T | undefined> => {
  const { context = 'safeAsync', fallback, rethrow = false, logLevel = 'warn' } = options;
  try {
    return await promise;
  } catch (error) {
    logger[logLevel]({ err: error, context }, `Operation failed: ${context}`);
    if (rethrow) throw error;
    return fallback as T | undefined;
  }
};

export const safeAsyncVoid = async (
  promise: Promise<unknown>,
  options: Omit<SafeAsyncOptions, 'fallback'> = {}
): Promise<void> => {
  await safeAsync(promise, { ...options, fallback: undefined });
};

export const safePromiseAll = async <T>(
  promises: Promise<T>[],
  options: SafeAsyncOptions = {}
): Promise<(T | undefined)[]> => {
  return Promise.all(
    promises.map((p) => safeAsync(p, { ...options, fallback: undefined }))
  );
};

export const safePromiseAllSettled = async <T>(
  promises: Promise<T>[],
  options: Omit<SafeAsyncOptions, 'fallback'> = {}
): Promise<PromiseSettledResult<T>[]> => {
  return Promise.allSettled(
    promises.map((p) =>
      p.catch((error) => {
        logger[options.logLevel || 'warn']({ err: error, context: options.context }, `Promise failed in allSettled: ${options.context}`);
        throw error;
      })
    )
  );
};