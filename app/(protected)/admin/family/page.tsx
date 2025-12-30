import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import AdminFamilyClient from './AdminFamilyClient';

export default async function AdminFamilyPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, status: true },
  });

  if (!user || user.role !== 'ADMIN' || user.status !== 'ACTIVE') {
    return (
      <div className="container mx-auto p-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
        <p className="text-gray-600">
          You do not have permission to manage family members.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Family Members</h1>
      <p className="text-gray-600 mb-6">
        Approve pending members or disable access for existing members.
      </p>
      <AdminFamilyClient />
    </div>
  );
}

