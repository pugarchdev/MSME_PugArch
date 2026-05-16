export const requiredText = (value: unknown) => String(value ?? '').trim().length > 0;

export const positiveNumber = (value: unknown) => Number(value) > 0;

export const safeSearch = (value: string) => value.trim().slice(0, 120);
