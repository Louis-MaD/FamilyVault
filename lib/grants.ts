import { prisma } from '@/lib/db';
import { AccessDeniedError, requireActiveUser } from '@/lib/authz';

export async function listActiveGrantsForUser(userId: string) {
  await requireActiveUser(userId);

  return prisma.shareGrant.findMany({
    where: {
      toUserId: userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      wrappedItemKeyForRecipient: true,
      expiresAt: true,
      createdAt: true,
      item: {
        select: {
          id: true,
          type: true,
          title: true,
          url: true,
          encryptedPayload: true,
          cryptoMeta: true,
        },
      },
      fromUser: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
    orderBy: [{ expiresAt: 'asc' }],
  });
}

export async function revokeGrantForUser(grantId: string, userId: string) {
  await requireActiveUser(userId);

  const grant = await prisma.shareGrant.findUnique({
    where: { id: grantId },
    select: { id: true, fromUserId: true, revokedAt: true },
  });

  if (!grant) {
    throw new AccessDeniedError('Grant not found', 404);
  }

  if (grant.fromUserId !== userId) {
    throw new AccessDeniedError('Only the owner can revoke this grant', 403);
  }

  if (grant.revokedAt) {
    throw new AccessDeniedError('Grant already revoked', 400);
  }

  return prisma.shareGrant.update({
    where: { id: grantId },
    data: { revokedAt: new Date() },
  });
}
