import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listFamilyItemsForUser } from '@/lib/family';
import { AccessDeniedError } from '@/lib/authz';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';

  try {
    const items = await listFamilyItemsForUser(session.userId, query);
    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching family items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch family items' },
      { status: 500 }
    );
  }
}
