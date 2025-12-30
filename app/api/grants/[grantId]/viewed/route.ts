import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import { AccessDeniedError, requireActiveUser } from '@/lib/authz';

export async function POST(
  _req: Request,
  { params }: { params: { grantId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);

    const grant = await prisma.shareGrant.findUnique({
      where: { id: params.grantId },
      select: { id: true, toUserId: true },
    });

    if (!grant) {
      return NextResponse.json({ error: 'Grant not found' }, { status: 404 });
    }

    if (grant.toUserId !== session.userId) {
      return NextResponse.json({ error: 'Only the recipient can view this grant' }, { status: 403 });
    }

    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'SHARED_ITEM_VIEWED',
        targetType: 'SHARE_GRANT',
        targetId: grant.id,
        ip: headers().get('x-forwarded-for') || 'unknown',
        userAgent: headers().get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error logging grant view:', error);
    return NextResponse.json({ error: 'Failed to log view' }, { status: 500 });
  }
}

