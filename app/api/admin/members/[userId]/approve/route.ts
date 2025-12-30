import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import { AccessDeniedError, requireAdminUser } from '@/lib/authz';

export async function POST(
  _req: Request,
  { params }: { params: { userId: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await requireAdminUser(session.userId);

    const target = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, status: true },
    });

    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: params.userId },
      data: { status: 'ACTIVE' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actorUserId: session.userId,
        eventType: 'MEMBER_APPROVED',
        targetType: 'USER',
        targetId: updatedUser.id,
        ip: headers().get('x-forwarded-for') || 'unknown',
        userAgent: headers().get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error approving member:', error);
    return NextResponse.json({ error: 'Failed to approve member' }, { status: 500 });
  }
}

