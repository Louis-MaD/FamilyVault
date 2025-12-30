'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [require2fa, setRequire2fa] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, totpCode }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await res.json();

    if (res.status === 403 && data.require2fa) {
      setRequire2fa(true);
      return;
    }

    if (res.ok) {
      router.push('/vault');
      router.refresh();
    } else {
      alert(data.error);
    }
  };

  return (
    <>
      <Navbar isLoggedIn={false} />
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded shadow">
        <h2 className="text-2xl mb-4 font-bold">Login</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input 
            className="border p-2 rounded"
            placeholder="Email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            type="email" required 
            disabled={require2fa}
          />
          <input 
            className="border p-2 rounded"
            placeholder="Master Password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            type="password" required 
            disabled={require2fa}
          />
          {require2fa && (
            <input 
              className="border p-2 rounded border-blue-500"
              placeholder="2FA Code (Google Authenticator)" 
              value={totpCode} 
              onChange={e => setTotpCode(e.target.value)} 
              type="text" required 
              autoFocus
            />
          )}
          <button className="bg-green-600 text-white p-2 rounded hover:bg-green-700">
            {require2fa ? 'Verify 2FA' : 'Login'}
          </button>
        </form>
      </div>
    </>
  );
}