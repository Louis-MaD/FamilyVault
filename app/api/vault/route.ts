import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const items = await prisma.vaultItem.findMany({
    where: { ownerUserId: session.userId },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.type || !['PASSWORD', 'NOTE'].includes(body.type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be PASSWORD or NOTE' },
        { status: 400 }
      );
    }

    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (!body.wrappedItemKey || typeof body.wrappedItemKey !== 'string') {
      return NextResponse.json(
        { error: 'wrappedItemKey is required and must be a string' },
        { status: 400 }
      );
    }

    if (!body.encryptedPayload || typeof body.encryptedPayload !== 'string') {
      return NextResponse.json(
        { error: 'encryptedPayload is required and must be a string' },
        { status: 400 }
      );
    }

    if (!body.cryptoMeta || typeof body.cryptoMeta !== 'object') {
      return NextResponse.json(
        { error: 'cryptoMeta is required and must be an object' },
        { status: 400 }
      );
    }

    await prisma.vaultItem.create({
      data: {
        ownerUserId: session.userId,
        type: body.type,
        title: body.title.trim(),
        tags: Array.isArray(body.tags) ? body.tags : [],
        wrappedItemKey: body.wrappedItemKey,
        encryptedPayload: body.encryptedPayload,
        cryptoMeta: body.cryptoMeta,
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating vault item:', error);
    return NextResponse.json(
      { error: 'Failed to create vault item' },
      { status: 500 }
    );
  }
}