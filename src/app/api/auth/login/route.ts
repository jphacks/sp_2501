import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

const prisma = global.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') global.prisma = prisma

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, email, name, image, providerAccountId } = body as any

    if (!provider) return NextResponse.json({ ok: false, message: 'provider required' }, { status: 400 })

    // Try to find user by email first, then by providerAccountId via Account table
    let user: any | null = null
    if (email) {
      user = await prisma.user.findUnique({ where: { email } })
    }

    if (!user && providerAccountId) {
      const acct = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } }, include: { user: true } as any })
      if (acct && acct.user) user = acct.user
    }

    if (!user) {
      // create a new user and account record (minimal fields)
      user = await prisma.user.create({ data: { name: name || null, email: email || null, image: image || null } })
      try {
        if (providerAccountId) {
          await prisma.account.create({ data: { userId: user.id, userSystemId: user.userSystemId, type: 'oauth', provider, providerAccountId } })
        }
      } catch (e) {
        // ignore account create errors
      }
    } else {
      // keep user record updated with latest profile info
      await prisma.user.update({ where: { id: user.id }, data: { name: name || user.name, image: image || user.image } })
    }

    return NextResponse.json({ ok: true, user: { id: user.id, userSystemId: user.userSystemId, email: user.email } })
  } catch (err: any) {
    console.error('[auth/login] error', err)
    return NextResponse.json({ ok: false, message: err?.message || 'server error' }, { status: 500 })
  }
}
