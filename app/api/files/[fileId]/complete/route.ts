import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser, AccessDeniedError } from '@/lib/authz';

export async function POST(
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
    const body = await req.json();
    const { wrappedFileKey, cryptoMeta } = body;

    // Validate required fields
    if (!wrappedFileKey || typeof wrappedFileKey !== 'string') {
      return NextResponse.json(
        { error: 'wrappedFileKey is required and must be a string' },
        { status: 400 }
      );
    }

    if (!cryptoMeta || typeof cryptoMeta !== 'object') {
      return NextResponse.json(
        { error: 'cryptoMeta is required and must be an object' },
        { status: 400 }
      );
    }

    // Fetch file record
    const fileBlob = await prisma.fileBlob.findUnique({
      where: { id: fileId },
    });

    if (!fileBlob) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership
    if (fileBlob.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the file owner can complete upload' },
        { status: 403 }
      );
    }

    // Update with encryption metadata
    await prisma.fileBlob.update({
      where: { id: fileId },
      data: {
        wrappedFileKey,
        cryptoMeta,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error completing file upload:', error);
    return NextResponse.json(
      { error: 'Failed to complete file upload' },
      { status: 500 }
    );
  }
}
