import React from 'react';
import Navbar from '@/components/Navbar';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <>
      <Navbar isLoggedIn={true} />
      {children}
    </>
  );
}