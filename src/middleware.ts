import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

const PUBLIC_PATHS = ['/login', '/register']

export default auth((req) => {
  try {
    const { pathname } = req.nextUrl

    const isPublic =
      PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/payments/')

    if (!req.auth && !isPublic) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }

    if (req.auth && (pathname === '/login' || pathname === '/register')) {
      const homeUrl = req.nextUrl.clone()
      homeUrl.pathname = '/'
      homeUrl.search = ''
      return NextResponse.redirect(homeUrl)
    }
  } catch (err) {
    console.error('[middleware] Edge error:', err)
  }
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg).*)'],
}
