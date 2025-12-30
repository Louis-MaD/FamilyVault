import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      publicKey: true,
      encryptedPrivateKey: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    hasKeypair: !!user.publicKey && !!user.encryptedPrivateKey,
    publicKey: user.publicKey || undefined,
    encryptedPrivateKey: user.encryptedPrivateKey || undefined,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { publicKey, encryptedPrivateKey } = body;

    if (!publicKey || typeof publicKey !== 'string') {
      return NextResponse.json({ error: 'publicKey is required' }, { status: 400 });
    }
    if (!encryptedPrivateKey || typeof encryptedPrivateKey !== 'string') {
      return NextResponse.json(
        { error: 'encryptedPrivateKey is required' },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { publicKey: true, encryptedPrivateKey: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (existing.publicKey || existing.encryptedPrivateKey) {
      return NextResponse.json({ error: 'Keypair already set' }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        publicKey,
        encryptedPrivateKey,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'KEYPAIR_CREATED',
        targetType: 'USER',
        targetId: session.userId,
        ip: headers().get('x-forwarded-for') || 'unknown',
        userAgent: headers().get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing keypair:', error);
    return NextResponse.json({ error: 'Failed to store keypair' }, { status: 500 });
  }
}

