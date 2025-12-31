import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser, AccessDeniedError } from '@/lib/authz';

export async function GET(
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
      select: {
        id: true,
        title: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        wrappedFileKey: true,
        cryptoMeta: true,
        itemId: true,
        ownerUserId: true,
        createdAt: true,
      },
    });

    if (!fileBlob) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership
    if (fileBlob.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the file owner can access metadata' },
        { status: 403 }
      );
    }

    return NextResponse.json(fileBlob);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching file metadata:', error);
    return NextResponse.json(
      { error: 'Failed to fetch file metadata' },
      { status: 500 }
    );
  }
}
