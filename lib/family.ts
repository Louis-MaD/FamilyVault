import { prisma } from '@/lib/db';
import { requireActiveUser } from '@/lib/authz';

export async function listFamilyItemsForUser(userId: string, query = '') {
  await requireActiveUser(userId);

  const items = await prisma.vaultItem.findMany({
    where: {
      OR: [
        { ownerUserId: userId },
        {
          AND: [
            { ownerUserId: { not: userId } },
            { visibility: 'FAMILY_METADATA' },
            { owner: { status: 'ACTIVE' } },
          ],
        },
      ],
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { url: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
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
          displayName: true,
        },
      },
      wrappedItemKey: false,
      encryptedPayload: false,
      cryptoMeta: false,
    },
    orderBy: [
      { owner: { displayName: 'asc' } },
      { owner: { email: 'asc' } },
      { title: 'asc' },
    ],
  });

  return items.map(item => ({
    ...item,
    ownerDisplayName: item.owner.displayName || item.owner.email.split('@')[0],
    owner: undefined,
  }));
}

