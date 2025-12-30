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
    const requestId = params.id;
    const body = await req.json();
    const { wrappedItemKeyForRecipient, expiresAt } = body;

    if (!wrappedItemKeyForRecipient || typeof wrappedItemKeyForRecipient !== 'string') {
      return NextResponse.json(
        { error: 'wrappedItemKeyForRecipient is required and must be a string' },
        { status: 400 }
      );
    }

    if (!expiresAt || typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) {
      return NextResponse.json(
        { error: 'expiresAt is required and must be an ISO string' },
        { status: 400 }
      );
    }

    await requireActiveUser(session.userId);

    // Fetch the request
    const accessRequest = await prisma.accessRequest.findUnique({
      where: { id: requestId },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            ownerUserId: true,
          },
        },
        requester: {
          select: {
            id: true,
            status: true,
            publicKey: true,
          },
        },
        grant: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!accessRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Validation: Only owner can approve
    if (accessRequest.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the item owner can approve this request' },
        { status: 403 }
      );
    }

    // Validation: Request must be PENDING
    if (accessRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot approve ${accessRequest.status.toLowerCase()} request` },
        { status: 400 }
      );
    }

    if (accessRequest.requester.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Requester is not active' },
        { status: 403 }
      );
    }

    if (!accessRequest.requester.publicKey) {
      return NextResponse.json(
        { error: 'Requester has not set up a public key yet' },
        { status: 400 }
      );
    }

    if (accessRequest.grant) {
      return NextResponse.json(
        { error: 'A grant already exists for this request' },
        { status: 400 }
      );
    }

    const now = new Date();
    const grantExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);

    const { request: updatedRequest, grant } = await prisma.$transaction(async (tx) => {
      const request = await tx.accessRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          decidedAt: now,
          expiresAt: grantExpiresAt,
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

      const grant = await tx.shareGrant.create({
        data: {
          itemId: accessRequest.itemId,
          fromUserId: accessRequest.ownerUserId,
          toUserId: accessRequest.requesterUserId,
          requestId: accessRequest.id,
          wrappedItemKeyForRecipient,
          expiresAt: grantExpiresAt,
        },
      });

      return { request, grant };
    });

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'REQUEST_APPROVED',
        targetType: 'ACCESS_REQUEST',
        targetId: requestId,
        ip: headers().get('x-forwarded-for') || 'unknown',
        userAgent: headers().get('user-agent') || 'unknown',
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'GRANT_CREATED',
        targetType: 'SHARE_GRANT',
        targetId: grant.id,
        ip: headers().get('x-forwarded-for') || 'unknown',
        userAgent: headers().get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json(updatedRequest);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error approving request:', error);
    return NextResponse.json(
      { error: 'Failed to approve request' },
      { status: 500 }
    );
  }
}
