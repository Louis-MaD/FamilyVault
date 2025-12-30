'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useVault } from './VaultContext';
import { Lock, Unlock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Navbar({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { isUnlocked, lockVault, keypairError } = useVault();
  const router = useRouter();
  const [userRole, setUserRole] = useState<'ADMIN' | 'MEMBER' | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch('/api/user/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.role) setUserRole(data.role);
      })
      .catch(() => null);
  }, [isLoggedIn]);

  const handleLogout = async () => {
    lockVault();
    // In a real app we would call logout API here
    document.cookie = 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/login');
    router.refresh();
  };

  return (
    <>
      <nav className="p-4 bg-gray-900 text-white flex justify-between items-center">
        <Link href="/" className="font-bold text-xl">FamilyVault</Link>
        <div className="flex gap-4 items-center">
          {isLoggedIn ? (
            <>
              <Link href="/vault" className="hover:text-blue-400">My Vault</Link>
              <Link href="/family" className="hover:text-blue-400">Family Vault</Link>
              <Link href="/requests" className="hover:text-blue-400">Requests</Link>
              <Link href="/shared" className="hover:text-blue-400">Shared With Me</Link>
              {userRole === 'ADMIN' && (
                <Link href="/admin/family" className="hover:text-blue-400">Admin</Link>
              )}
              {isUnlocked ? (
                <button onClick={lockVault} className="flex gap-2 items-center text-green-400 border border-green-400 px-2 py-1 rounded text-sm">
                  <Unlock size={14} /> Unlocked
                </button>
              ) : (
                <span className="flex gap-2 items-center text-red-400 text-sm">
                  <Lock size={14} /> Locked
                </span>
              )}
              <button onClick={handleLogout} className="text-gray-300 hover:text-white">Logout</button>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-blue-400">Login</Link>
              <Link href="/signup" className="hover:text-blue-400">Signup</Link>
            </>
          )}
        </div>
      </nav>
      {keypairError && (
        <div className="bg-yellow-50 border-b border-yellow-200 text-yellow-800 px-4 py-2 text-sm">
          {keypairError}
        </div>
      )}
    </>
  );
}
