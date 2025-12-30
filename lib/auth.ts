import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import argon2 from 'argon2';
import { prisma } from './db';

const SESSION_SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);

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

  await prisma.session.create({
    data: {
      userId,
      sessionTokenHash: token, 
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
    const session = await prisma.session.findFirst({
      where: {
        sessionTokenHash: token,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) return null;
    return { userId: payload.userId as string };
  } catch (e) {
    return null;
  }
}