import { prisma } from '@/lib/db';

export class AccessDeniedError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = 'AccessDeniedError';
    this.statusCode = statusCode;
  }
}

export async function requireUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      publicKey: true,
      encryptedPrivateKey: true,
    },
  });

  if (!user) {
    throw new AccessDeniedError('User not found', 404);
  }

  return user;
}

export async function requireActiveUser(userId: string) {
  const user = await requireUser(userId);
  if (user.status !== 'ACTIVE') {
    throw new AccessDeniedError('Account pending approval or disabled', 403);
  }
  return user;
}

export async function requireAdminUser(userId: string) {
  const user = await requireUser(userId);
  if (user.status !== 'ACTIVE' || user.role !== 'ADMIN') {
    throw new AccessDeniedError('Admin access required', 403);
  }
  return user;
}

