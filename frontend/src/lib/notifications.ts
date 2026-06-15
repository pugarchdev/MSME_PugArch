import { getSellerPortalPath } from './shg';

export interface PortalNotification {
  id: number | string;
  title: string;
  message: string;
  type: string;
  isRead?: boolean;
  createdAt?: string;
  route?: string;
  redirectUrl?: string;
}

export const routeForNotification = (
  item: PortalNotification,
  role?: string,
  user?: any,
) => {
  const explicitRoute = item.route || item.redirectUrl;
  if (explicitRoute) return explicitRoute;

  const type = String(item.type || '').toLowerCase();

  if (type.includes('onboarding') || type.includes('section_') || type.includes('admin_feedback') || type.includes('gst_verified')) {
    if (role === 'admin') return '/admin/onboarding';
    if (role === 'buyer') return '/buyer/onboarding';
    return getSellerPortalPath(user);
  }

  if (type.includes('quote') || type.includes('rfq')) return '/quotations';
  if (type.includes('direct_purchase')) return role === 'buyer' ? '/buyer/direct-purchase' : '/seller/orders';
  if (type.includes('tender') || type.includes('auction')) return role === 'buyer' ? '/buyer/tenders' : '/seller/tenders';
  if (type.includes('payment')) return role === 'buyer' ? '/buyer/payments' : '/payments';
  if (type.includes('escrow')) return '/escrow';
  if (type.includes('message')) return role === 'buyer' ? '/buyer/messages' : '/seller/messages';
  if (type.includes('dispute')) {
    if (role === 'admin') return '/admin/disputes';
    return role === 'buyer' ? '/buyer/disputes' : '/seller/disputes';
  }
  if (type.includes('grievance')) return role === 'admin' ? '/admin/grievances' : '/dashboard';
  if (type.includes('organization')) return role === 'admin' ? '/admin/organizations' : '/dashboard';

  return '/notifications';
};
