import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import { AccessDeniedError } from '@/lib/authz';
import { createAccessRequestForUser } from '@/lib/requests';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { itemId, reason } = body;

    // Validate itemId
    if (!itemId || typeof itemId !== 'string') {
      return NextResponse.json(
        { error: 'itemId is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate reason (optional)
    if (reason !== undefined && typeof reason !== 'string') {
      return NextResponse.json(
        { error: 'reason must be a string if provided' },
        { status: 400 }
      );
    }

    const { accessRequest, isNew } = await createAccessRequestForUser(
      session.userId,
      itemId,
      reason || null
    );

    if (isNew) {
      await prisma.auditEvent.create({
        data: {
          actorUserId: session.userId,
          eventType: 'REQUEST_CREATED',
          targetType: 'ACCESS_REQUEST',
          targetId: accessRequest.id,
          ip: headers().get('x-forwarded-for') || 'unknown',
          userAgent: headers().get('user-agent') || 'unknown',
        },
      });
    }

    return NextResponse.json(accessRequest, { status: isNew ? 201 : 200 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating access request:', error);
    return NextResponse.json(
      { error: 'Failed to create access request' },
      { status: 500 }
    );
  }
}
