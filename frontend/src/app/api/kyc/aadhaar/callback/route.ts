    import { NextResponse, NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  
  const redirectUrl = new URL('/api/kyc/aadhaar/callback', backendUrl);
  searchParams.forEach((value, key) => {
    redirectUrl.searchParams.set(key, value);
  });
  
  return NextResponse.redirect(redirectUrl.toString());
}
