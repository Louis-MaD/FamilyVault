import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { AccessDeniedError } from '@/lib/authz';
import { listActiveGrantsForUser } from '@/lib/grants';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const grants = await listActiveGrantsForUser(session.userId);
    return NextResponse.json(grants);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching grants:', error);
    return NextResponse.json({ error: 'Failed to fetch grants' }, { status: 500 });
  }
}

