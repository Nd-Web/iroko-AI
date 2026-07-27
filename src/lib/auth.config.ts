import type { NextAuthConfig } from 'next-auth'

// On Vercel, automatically resolve the Vercel domain if AUTH_URL was accidentally set to localhost
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
const canonicalUrl = vercelUrl ? `https://${vercelUrl}` : undefined

export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [], // Empty array for Edge Middleware
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = (user as { id: string }).id
      return token
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        ;(session.user as { id?: string }).id = token.uid as string
      }
      return session
    },
  },
} satisfies NextAuthConfig
