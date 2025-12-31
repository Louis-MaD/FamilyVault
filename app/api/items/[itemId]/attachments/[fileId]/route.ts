import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser, AccessDeniedError } from '@/lib/authz';
import { headers } from 'next/headers';

// DELETE /api/items/:itemId/attachments/:fileId - Detach file from item
export async function DELETE(
  req: Request,
  { params }: { params: { itemId: string; fileId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);

    const itemId = params.itemId;
    const fileId = params.fileId;

    // Verify item ownership
    const item = await prisma.vaultItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the item owner can detach files' },
        { status: 403 }
      );
    }

    // Verify file ownership and attachment
    const file = await prisma.fileBlob.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (file.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the file owner can detach it' },
        { status: 403 }
      );
    }

    if (file.itemId !== itemId) {
      return NextResponse.json(
        { error: 'File is not attached to this item' },
        { status: 400 }
      );
    }

    // Detach file from item
    await prisma.fileBlob.update({
      where: { id: fileId },
      data: { itemId: null },
    });

    // Create audit event
    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'FILE_DETACHED',
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
    console.error('Error detaching file:', error);
    return NextResponse.json(
      { error: 'Failed to detach file' },
      { status: 500 }
    );
  }
}
