'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (res.ok) {
      router.push('/login');
    } else {
      const data = await res.json();
      alert(data.error || 'Signup failed');
    }
  };

  return (
    <>
      <Navbar isLoggedIn={false} />
      <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded shadow">
        <h2 className="text-2xl mb-4 font-bold">Signup</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input 
            className="border p-2 rounded"
            placeholder="Email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            type="email" required 
          />
          <input 
            className="border p-2 rounded"
            placeholder="Master Password (min 12 chars)" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            type="password" required minLength={12}
          />
          <button className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700">Create Account</button>
        </form>
      </div>
    </>
  );
}