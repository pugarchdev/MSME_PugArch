import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedPrefixes = ['/dashboard', '/seller', '/buyer', '/admin', '/master-admin', '/profile', '/quotations'];

// Public routes that start with protected prefixes but should be accessible without auth
const publicExceptions = ['/seller/register', '/buyer/register', '/admin/register', '/seller/rfq', '/seller/rfp'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get('token')?.value;
  const isPublicException = publicExceptions.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const needsAuth = !isPublicException && protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsAuth && !token) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
