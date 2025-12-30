import { prisma } from '@/lib/db';
import { AccessDeniedError, requireActiveUser } from '@/lib/authz';

export async function createAccessRequestForUser(
  userId: string,
  itemId: string,
  reason?: string | null
) {
  await requireActiveUser(userId);

  const item = await prisma.vaultItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      ownerUserId: true,
      visibility: true,
      requestable: true,
      title: true,
      owner: { select: { status: true } },
    },
  });

  if (!item) {
    throw new AccessDeniedError('Item not found', 404);
  }

  if (item.ownerUserId === userId) {
    throw new AccessDeniedError('Cannot request access to your own item', 400);
  }

  if (item.owner.status !== 'ACTIVE') {
    throw new AccessDeniedError('Item owner is not active', 403);
  }

  if (item.visibility !== 'FAMILY_METADATA') {
    throw new AccessDeniedError('This item is private and cannot be requested', 403);
  }

  if (!item.requestable) {
    throw new AccessDeniedError('This item is not requestable', 403);
  }

  const existingRequest = await prisma.accessRequest.findFirst({
    where: {
      itemId,
      requesterUserId: userId,
      status: 'PENDING',
    },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          type: true,
          url: true,
        },
      },
      requester: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
  });

  if (existingRequest) {
    return { accessRequest: existingRequest, isNew: false };
  }

  const accessRequest = await prisma.accessRequest.create({
    data: {
      itemId,
      requesterUserId: userId,
      ownerUserId: item.ownerUserId,
      reason: reason || null,
      status: 'PENDING',
    },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          type: true,
          url: true,
        },
      },
      requester: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
  });

  return { accessRequest, isNew: true };
}
