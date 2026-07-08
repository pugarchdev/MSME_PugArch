let memoryToken: string | null = null;
export const COOKIE_SESSION_TOKEN = 'cookie-session';

export const getStoredToken = () => {
  if (typeof window === 'undefined') return null;
  return memoryToken || localStorage.getItem('token');
};

export const setStoredToken = (token: string) => {
  memoryToken = token || COOKIE_SESSION_TOKEN;
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', COOKIE_SESSION_TOKEN);
    localStorage.removeItem('refreshToken');
  }
};

export const clearStoredToken = () => {
  memoryToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  }
};

export const getCookieValue = (name: string) => {
  if (typeof document === 'undefined') return '';
  const match = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
};

export const clearAuthCookie = () => {
  if (typeof document === 'undefined') return;
  document.cookie = 'token=; path=/; max-age=0; SameSite=Strict';
  document.cookie = 'refreshToken=; path=/; max-age=0; SameSite=Strict';
  document.cookie = 'csrfToken=; path=/; max-age=0; SameSite=Strict';
};
