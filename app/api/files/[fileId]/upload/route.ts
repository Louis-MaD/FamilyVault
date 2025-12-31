import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser, AccessDeniedError } from '@/lib/authz';
import { writeEncryptedFile } from '@/lib/file-storage';

export async function PUT(
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
        { error: 'Only the file owner can upload data' },
        { status: 403 }
      );
    }

    // Read raw bytes from request body
    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Write encrypted bytes to disk
    await writeEncryptedFile(session.userId, fileId, buffer);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
