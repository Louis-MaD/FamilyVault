import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { generateSalt } from '@/lib/crypto.server';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password || password.length < 12) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'User exists' }, { status: 400 });

    const passwordHash = await hashPassword(password);
    const kdfSalt = await generateSalt();

    const user = await prisma.user.create({
      data: { email, passwordHash, kdfSalt },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        eventType: 'SIGNUP',
        targetType: 'USER',
        targetId: user.id,
        ip: headers().get('x-forwarded-for') || 'unknown',
        userAgent: headers().get('user-agent') || 'unknown',
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}