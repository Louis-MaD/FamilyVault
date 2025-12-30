import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ status: 401 });

  const items = await prisma.vaultItem.findMany({
    where: { ownerUserId: session.userId },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ status: 401 });

  const body = await req.json();
  
  await prisma.vaultItem.create({
    data: {
      ownerUserId: session.userId,
      type: body.type,
      title: body.title,
      tags: body.tags || [],
      wrappedItemKey: body.wrappedItemKey,
      encryptedPayload: body.encryptedPayload,
      cryptoMeta: body.cryptoMeta,
    }
  });

  return NextResponse.json({ success: true });
}