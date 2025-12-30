import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import { AccessDeniedError, requireActiveUser } from '@/lib/authz';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);
    const requestId = params.id;

    // Fetch the request
    const accessRequest = await prisma.accessRequest.findUnique({
      where: { id: requestId },
    });

    if (!accessRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Validation: Only requester can cancel
    if (accessRequest.requesterUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the requester can cancel this request' },
        { status: 403 }
      );
    }

    // Validation: Request must be PENDING
    if (accessRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot cancel ${accessRequest.status.toLowerCase()} request` },
        { status: 400 }
      );
    }

    // Update request status to CANCELLED
    const updatedRequest = await prisma.accessRequest.update({
      where: { id: requestId },
      data: {
        status: 'CANCELLED',
        decidedAt: new Date(),
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
        owner: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'REQUEST_CANCELLED',
        targetType: 'ACCESS_REQUEST',
        targetId: requestId,
        ip: headers().get('x-forwarded-for') || 'unknown',
        userAgent: headers().get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json(updatedRequest);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error cancelling request:', error);
    return NextResponse.json(
      { error: 'Failed to cancel request' },
      { status: 500 }
    );
  }
}
