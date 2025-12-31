import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser, AccessDeniedError } from '@/lib/authz';
import {
  isAllowedMimeType,
  isValidFileSize,
  getStoragePath,
} from '@/lib/file-storage';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);

    const body = await req.json();
    const { title, filename, mimeType, sizeBytes, itemId } = body;

    // Validate required fields
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'filename is required and must be a string' },
        { status: 400 }
      );
    }

    if (!mimeType || typeof mimeType !== 'string') {
      return NextResponse.json(
        { error: 'mimeType is required and must be a string' },
        { status: 400 }
      );
    }

    if (typeof sizeBytes !== 'number') {
      return NextResponse.json(
        { error: 'sizeBytes is required and must be a number' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!isAllowedMimeType(mimeType)) {
      return NextResponse.json(
        {
          error: `MIME type ${mimeType} not allowed. Allowed: application/pdf, image/png, image/jpeg`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (!isValidFileSize(sizeBytes)) {
      return NextResponse.json(
        { error: 'File size must be between 1 byte and 25MB' },
        { status: 400 }
      );
    }

    // Validate itemId if provided
    if (itemId) {
      const item = await prisma.vaultItem.findUnique({
        where: { id: itemId },
      });

      if (!item) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
      }

      if (item.ownerUserId !== session.userId) {
        return NextResponse.json(
          { error: 'Cannot attach file to item you do not own' },
          { status: 403 }
        );
      }
    }

    // Create FileBlob record with placeholder storagePath
    const fileBlob = await prisma.fileBlob.create({
      data: {
        ownerUserId: session.userId,
        title: title || null,
        filename,
        mimeType,
        sizeBytes,
        storagePath: '', // Will be set after upload
        itemId: itemId || null,
      },
    });

    // Generate storage path
    const storagePath = getStoragePath(session.userId, fileBlob.id);

    // Update with actual storage path
    await prisma.fileBlob.update({
      where: { id: fileBlob.id },
      data: { storagePath },
    });

    return NextResponse.json({ fileId: fileBlob.id }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error initializing file upload:', error);
    return NextResponse.json(
      { error: 'Failed to initialize file upload' },
      { status: 500 }
    );
  }
}
