import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser, AccessDeniedError } from '@/lib/authz';
import { deleteEncryptedFile } from '@/lib/file-storage';
import { headers } from 'next/headers';

export async function DELETE(
  req: Request,
  { params }: { params: { fileId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);

    const fileId = params.fileId;

    const fileBlob = await prisma.fileBlob.findUnique({
      where: { id: fileId },
    });

    if (!fileBlob) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership
    if (fileBlob.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the file owner can delete' },
        { status: 403 }
      );
    }

    // Delete from disk
    await deleteEncryptedFile(fileBlob.storagePath);

    // Delete from database
    await prisma.fileBlob.delete({
      where: { id: fileId },
    });

    // Audit event
    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'FILE_DELETED',
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
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
