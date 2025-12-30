import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import { AccessDeniedError } from '@/lib/authz';
import { revokeGrantForUser } from '@/lib/grants';

export async function POST(
  _req: Request,
  { params }: { params: { grantId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const updated = await revokeGrantForUser(params.grantId, session.userId);

    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'GRANT_REVOKED',
        targetType: 'SHARE_GRANT',
        targetId: updated.id,
        ip: headers().get('x-forwarded-for') || 'unknown',
        userAgent: headers().get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error revoking grant:', error);
    return NextResponse.json({ error: 'Failed to revoke grant' }, { status: 500 });
  }
}
