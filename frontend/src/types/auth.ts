export type AuthUser = {
  id: number;
  _id?: number;
  name: string;
  email: string;
  role: 'admin' | 'buyer' | 'seller' | 'shg' | 'master_admin' | 'financier';
  emailVerified?: boolean;
  mobileVerified?: boolean;
  twoFactorEnabled?: boolean;
};
