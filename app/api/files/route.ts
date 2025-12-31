import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser, AccessDeniedError } from '@/lib/authz';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';

    const files = await prisma.fileBlob.findMany({
      where: {
        ownerUserId: session.userId,
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { filename: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        itemId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(files);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error listing files:', error);
    return NextResponse.json(
      { error: 'Failed to list files' },
      { status: 500 }
    );
  }
}
