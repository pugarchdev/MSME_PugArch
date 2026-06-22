export const TimeConstants = {
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60 * 1000,
  MS_PER_HOUR: 60 * 60 * 1000,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  MS_PER_WEEK: 7 * 24 * 60 * 60 * 1000,
  MS_PER_30_DAYS: 30 * 24 * 60 * 60 * 1000,
  MS_PER_90_DAYS: 90 * 24 * 60 * 60 * 1000,
  MS_PER_15_DAYS: 15 * 24 * 60 * 60 * 1000,

  DEFAULT_RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
  NOTIFICATION_READ_RETENTION_MS: 24 * 60 * 60 * 1000,
  DEFAULT_TENDER_CLOSE_DAYS: 15,
  DEFAULT_INVITE_EXPIRY_DAYS: 7,
  BANK_TRANSFER_EXPIRY_DAYS: 7,
  CLOSING_SOON_DAYS: 7,
  BID_WITHDRAWAL_WINDOW_DAYS: 30,
  MARKETPLACE_REVIEW_WINDOW_DAYS: 90,
  TENDER_MIN_CLOSE_HOURS: 1,

  BACKGROUND_FAILURE_LOG_INTERVAL_MS: 5 * 60 * 1000,
  MEMORY_CLEANUP_INTERVAL_MS: 60 * 1000,
 
} as const;

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * TimeConstants.MS_PER_DAY);

export const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * TimeConstants.MS_PER_DAY);

export const msToDays = (ms: number): number =>
  Math.max(0, Math.ceil(ms / TimeConstants.MS_PER_DAY));