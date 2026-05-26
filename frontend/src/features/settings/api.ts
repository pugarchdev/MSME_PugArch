/**
 * Settings API client (notification prefs + 2FA).
 */
import { getApi, postApi, putApi } from '../shared/apiClient';

export interface NotificationPreferenceDto {
    id: number;
    userId: number;
    emailNotifications: boolean;
    smsNotifications: boolean;
    pushNotifications: boolean;
    procurementAlerts: boolean;
    complianceAlerts: boolean;
}

export const fetchNotificationPreferences = () =>
    getApi<NotificationPreferenceDto>('/api/notifications/preferences');

export const updateNotificationPreferences = (data: Partial<Omit<NotificationPreferenceDto, 'id' | 'userId'>>) =>
    putApi<NotificationPreferenceDto>('/api/notifications/preferences', data);

// 2FA endpoints
export const enable2faRequest = (otp?: string) =>
    postApi<{ success: boolean; pendingVerification?: boolean; twoFactorEnabled?: boolean }>('/api/auth/2fa/enable', otp ? { otp } : {});

export const disable2fa = (password: string) =>
    postApi<{ success: boolean; twoFactorEnabled: boolean }>('/api/auth/2fa/disable', { password });

export const changePassword = (data: { currentPassword: string; newPassword: string }) =>
    postApi('/api/auth/change-password', data);

export const logoutCurrent = () => postApi('/api/auth/logout', {});
