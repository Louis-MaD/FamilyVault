import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AccessDeniedError, requireActiveUser } from '@/lib/authz';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);
    // Fetch requests where current user is the requester
    const requests = await prisma.accessRequest.findMany({
      where: {
        requesterUserId: session.userId,
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
        owner: {
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
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching outgoing requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch outgoing requests' },
      { status: 500 }
    );
  }
}
