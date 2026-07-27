import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

const PUBLIC_PATHS = ['/login', '/register']

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Determine origin safely (handles Vercel reverse proxy headers)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1')
  const origin = isLocal ? req.nextUrl.origin : `${proto}://${host}`

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/payments/')

  if (!req.auth && !isPublic) {
    const loginUrl = new URL('/login', origin)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (req.auth && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/', origin))
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg).*)'],
}
