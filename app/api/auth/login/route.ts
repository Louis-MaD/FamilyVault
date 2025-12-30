import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createSession } from '@/lib/auth';
import { authenticator } from 'otplib';
import { decryptServerSecret } from '@/lib/crypto.server';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  const { email, password, totpCode } = await req.json();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (user.totpEnabled) {
    if (!totpCode) return NextResponse.json({ error: '2FA required', require2fa: true }, { status: 403 });
    
    if (!user.totpSecretEncrypted) return NextResponse.json({ error: 'Config error' }, { status: 500 });
    const secret = await decryptServerSecret(user.totpSecretEncrypted);
    
    if (!authenticator.check(totpCode, secret)) {
       return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 401 });
    }
  }

  await createSession(user.id);
  
  await prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        eventType: 'LOGIN',
        targetType: 'USER',
        targetId: user.id,
        ip: headers().get('x-forwarded-for') || 'unknown',
      }
  });

  return NextResponse.json({ success: true });
}