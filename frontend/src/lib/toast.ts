/**
 * Unified toast helper. Wraps `sonner` so every page in the portal speaks the
 * same UX language: success/error/info/loading + a `runWithToast` helper that
 * handles the common "show loading, then success or error from a promise"
 * pattern.
 */

import { toast as sonner } from 'sonner';

export interface RunOptions {
    loading?: string;
    success?: string | ((result: unknown) => string);
    error?: string | ((err: unknown) => string);
}

const errorMessage = (err: unknown, fallback = 'Something went wrong') => {
    if (err instanceof Error) return err.message || fallback;
    if (typeof err === 'string' && err.trim()) return err;
    return fallback;
};

export const notify = {
    success(message: string, options?: { description?: string; duration?: number }) {
        return sonner.success(message, options);
    },
    error(message: string, options?: { description?: string; duration?: number }) {
        return sonner.error(message, { duration: 6000, ...options });
    },
    info(message: string, options?: { description?: string; duration?: number }) {
        return sonner.info(message, options);
    },
    warning(message: string, options?: { description?: string; duration?: number }) {
        return sonner.warning(message, { duration: 6000, ...options });
    },
    loading(message: string) {
        return sonner.loading(message);
    },
    dismiss(id?: string | number) {
        sonner.dismiss(id);
    }
};

/**
 * Runs an async operation with toast feedback. Replaces the boilerplate of:
 *
 *   const id = toast.loading('Saving...');
 *   try { await op(); toast.success('Saved', { id }); }
 *   catch (err) { toast.error(...); }
 */
export const runWithToast = async <T>(
    task: () => Promise<T>,
    options: RunOptions = {}
): Promise<T> => {
    const id = sonner.loading(options.loading || 'Working...');
    try {
        const result = await task();
        const message =
            typeof options.success === 'function' ? options.success(result) : options.success || 'Done';
        sonner.success(message, { id });
        return result;
    } catch (err) {
        const message =
            typeof options.error === 'function' ? options.error(err) : options.error || errorMessage(err);
        sonner.error(message, { id, duration: 6000 });
        throw err;
    }
};

export { errorMessage };
