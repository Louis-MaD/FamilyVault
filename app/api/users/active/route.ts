
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requireActiveUser } from '@/lib/authz';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireActiveUser(session.userId);

    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        id: { not: session.userId }, // Exclude self
      },
      select: {
        id: true,
        displayName: true,
        email: true,
        publicKey: true,
      },
    });

    // Map to include a display name
    const mapped = users.map(u => ({
      id: u.id,
      name: u.displayName || u.email.split('@')[0],
      publicKey: u.publicKey
    }));

    return NextResponse.json(mapped);
  } catch (error: any) {
    console.error('Error fetching active users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch active users' },
      { status: 500 }
    );
  }
}
