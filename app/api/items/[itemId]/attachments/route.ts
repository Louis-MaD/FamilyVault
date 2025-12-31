import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser, AccessDeniedError } from '@/lib/authz';
import { headers } from 'next/headers';

// GET /api/items/:itemId/attachments - List attached files
export async function GET(
  req: Request,
  { params }: { params: { itemId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);

    const itemId = params.itemId;

    // Verify item ownership
    const item = await prisma.vaultItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the item owner can list attachments' },
        { status: 403 }
      );
    }

    // List attached files (metadata only)
    const attachments = await prisma.fileBlob.findMany({
      where: {
        itemId,
        ownerUserId: session.userId,
      },
      select: {
        id: true,
        title: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(attachments);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error listing attachments:', error);
    return NextResponse.json(
      { error: 'Failed to list attachments' },
      { status: 500 }
    );
  }
}

// POST /api/items/:itemId/attachments - Attach file to item
export async function POST(
  req: Request,
  { params }: { params: { itemId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);

    const itemId = params.itemId;
    const body = await req.json();
    const { fileId } = body;

    // Validate fileId
    if (!fileId || typeof fileId !== 'string') {
      return NextResponse.json(
        { error: 'fileId is required and must be a string' },
        { status: 400 }
      );
    }

    // Verify item ownership
    const item = await prisma.vaultItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the item owner can attach files' },
        { status: 403 }
      );
    }

    // Verify file ownership
    const file = await prisma.fileBlob.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (file.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the file owner can attach it' },
        { status: 403 }
      );
    }

    // Attach file to item (allow moving from another item)
    await prisma.fileBlob.update({
      where: { id: fileId },
      data: { itemId },
    });

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'FILE_ATTACHED',
        targetType: 'FILE_BLOB',
        targetId: fileId,
        ip: headers().get('x-forwarded-for') || 'unknown',
        userAgent: headers().get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error attaching file:', error);
    return NextResponse.json(
      { error: 'Failed to attach file' },
      { status: 500 }
    );
  }
}
