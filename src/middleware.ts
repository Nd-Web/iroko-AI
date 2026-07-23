import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register']

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith('/api/auth') ||
    // Paystack server-to-server webhook + checkout redirect (both verify
    // the transaction cryptographically/server-side themselves).
    pathname.startsWith('/api/payments/')

  if (!req.auth && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (req.auth && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/', req.nextUrl.origin))
  }
})

export const config = {
  // Run on everything except static assets / images / the favicon.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg).*)'],
}
