import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser, AccessDeniedError } from '@/lib/authz';
import { readEncryptedFile } from '@/lib/file-storage';

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
    });

    if (!fileBlob) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify ownership
    if (fileBlob.ownerUserId !== session.userId) {
      return NextResponse.json(
        { error: 'Only the file owner can download' },
        { status: 403 }
      );
    }

    // Read encrypted bytes from disk
    const encryptedData = await readEncryptedFile(fileBlob.storagePath);

    // Return as octet-stream (convert Buffer to Uint8Array for NextResponse)
    return new NextResponse(new Uint8Array(encryptedData), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': encryptedData.length.toString(),
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    );
  }
}
