import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

/**
 * Email/password auth via Auth.js v5. Sessions are JWT-based (no session
 * table needed) — this is the only strategy Auth.js supports with a
 * Credentials provider anyway.
 *
 * Magic-link sign-in can be added later as a second provider once an email
 * service (Resend, Postmark, etc.) is picked — it just needs API keys we
 * don't have yet, so it's deliberately left out for now.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const email =
          typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!email || !password) return null

        const user = await db.user.findUnique({ where: { email } })
        if (!user) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.name ?? undefined }
      },
    }),
  ],
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
})
