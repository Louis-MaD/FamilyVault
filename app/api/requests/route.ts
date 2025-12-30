import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';

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

    // Fetch the item with owner info
    const item = await prisma.vaultItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        ownerUserId: true,
        visibility: true,
        requestable: true,
        title: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Validation: Cannot request your own item
    if (item.ownerUserId === session.userId) {
      return NextResponse.json(
        { error: 'Cannot request access to your own item' },
        { status: 400 }
      );
    }

    // Validation: Item must have FAMILY_METADATA visibility
    if (item.visibility !== 'FAMILY_METADATA') {
      return NextResponse.json(
        { error: 'This item is private and cannot be requested' },
        { status: 403 }
      );
    }

    // Validation: Item must be requestable
    if (!item.requestable) {
      return NextResponse.json(
        { error: 'This item is not requestable' },
        { status: 403 }
      );
    }

    // Check for existing PENDING request
    const existingRequest = await prisma.accessRequest.findFirst({
      where: {
        itemId,
        requesterUserId: session.userId,
        status: 'PENDING',
      },
    });

    if (existingRequest) {
      // Return existing pending request
      return NextResponse.json(existingRequest);
    }

    // Create new access request
    const accessRequest = await prisma.accessRequest.create({
      data: {
        itemId,
        requesterUserId: session.userId,
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

    // Create audit event
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

    return NextResponse.json(accessRequest, { status: 201 });
  } catch (error) {
    console.error('Error creating access request:', error);
    return NextResponse.json(
      { error: 'Failed to create access request' },
      { status: 500 }
    );
  }
}
