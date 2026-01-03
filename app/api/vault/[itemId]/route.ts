
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: { itemId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { itemId } = params;

  // 1. Check if owner
  const item = await prisma.vaultItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (item.ownerUserId === session.userId) {
    return NextResponse.json(item);
  }

  // 2. Check if granted
  const grant = await prisma.shareGrant.findFirst({
    where: {
      itemId,
      toUserId: session.userId,
      expiresAt: { gt: new Date() }, // Active grant
      revokedAt: null
    }
  });

  if (grant) {
    // Return item with WRAPPED KEY FROM GRANT
    return NextResponse.json({
      ...item,
      wrappedItemKey: grant.wrappedItemKeyForRecipient,
      // decryptedPayload is not server side. client decrypts.
    });
  }

  // 3. No access
  // If requestable, maybe return metadata only? 
  // But usually /api/vault/[id] is for VIEWING secrets.
  // We can return 403.
  return NextResponse.json({ error: 'Access denied' }, { status: 403 });
}
