import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import argon2 from 'argon2';
import { createHash } from 'crypto';
import { prisma } from './db';

// Validate SESSION_SECRET on module load
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be set and at least 32 characters long');
}

const SESSION_SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);

/**
 * Hash a session token using SHA-256
 */
function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return await argon2.verify(hash, plain);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(SESSION_SECRET);

  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Store SHA-256 hash of the token, not the token itself
  const tokenHash = hashSessionToken(token);

  await prisma.session.create({
    data: {
      userId,
      sessionTokenHash: tokenHash,
      expiresAt: expires,
    },
  });

  cookies().set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    expires,
    path: '/',
  });
}

export async function getSession() {
  const token = cookies().get('session')?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET);

    // Hash the token to look it up in the database
    const tokenHash = hashSessionToken(token);

    const session = await prisma.session.findFirst({
      where: {
        sessionTokenHash: tokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) return null;
    return { userId: payload.userId as string };
  } catch (e) {
    return null;
  }
}