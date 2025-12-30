import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';

  try {
    // Fetch all items that should be visible:
    // 1. All of my own items (regardless of visibility)
    // 2. Other users' items only if visibility=FAMILY_METADATA
    const items = await prisma.vaultItem.findMany({
      where: {
        OR: [
          // My own items
          { ownerUserId: session.userId },
          // Others' items with FAMILY_METADATA visibility
          {
            AND: [
              { ownerUserId: { not: session.userId } },
              { visibility: 'FAMILY_METADATA' }
            ]
          }
        ],
        // Apply search filter if query provided
        ...(query ? {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { url: { contains: query, mode: 'insensitive' } }
          ]
        } : {})
      },
      select: {
        id: true,
        type: true,
        title: true,
        url: true,
        tags: true,
        visibility: true,
        requestable: true,
        ownerUserId: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            email: true,
            displayName: true
          }
        },
        // Explicitly exclude encrypted fields
        wrappedItemKey: false,
        encryptedPayload: false,
        cryptoMeta: false
      },
      orderBy: [
        { owner: { displayName: 'asc' } },
        { owner: { email: 'asc' } },
        { title: 'asc' }
      ]
    });

    // Transform to include display name (default to email prefix)
    const itemsWithDisplayName = items.map(item => ({
      ...item,
      ownerDisplayName: item.owner.displayName || item.owner.email.split('@')[0],
      owner: undefined // Remove owner object from response
    }));

    return NextResponse.json(itemsWithDisplayName);
  } catch (error) {
    console.error('Error fetching family items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch family items' },
      { status: 500 }
    );
  }
}
