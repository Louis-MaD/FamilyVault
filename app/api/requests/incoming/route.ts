import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch requests where current user is the owner
    const requests = await prisma.accessRequest.findMany({
      where: {
        ownerUserId: session.userId,
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
      orderBy: [
        { status: 'asc' }, // PENDING first
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error fetching incoming requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch incoming requests' },
      { status: 500 }
    );
  }
}
