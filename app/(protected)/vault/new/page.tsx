'use client';
import React, { useState } from 'react';
import { useVault } from '@/components/VaultContext';
import { encryptVaultItem } from '@/lib/crypto.client';
import { useRouter } from 'next/navigation';

export default function NewItem() {
  const { vaultKey, isUnlocked } = useVault();
  const router = useRouter();
  const [type, setType] = useState<'PASSWORD' | 'NOTE'>('PASSWORD');
  
  // Metadata
  const [title, setTitle] = useState('');
  
  // Secrets
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  if (!isUnlocked || !vaultKey) return <div className="p-10 text-center text-red-500">Please unlock vault first.</div>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Prepare payload
    const payload = {
      username,
      password,
      url,
      notes
    };

    // 2. Encrypt locally
    const { wrappedItemKey, encryptedPayload, cryptoMeta } = await encryptVaultItem(payload, vaultKey);

    // 3. Send to server
    await fetch('/api/vault', {
      method: 'POST',
      body: JSON.stringify({
        type,
        title,
        tags: [],
        wrappedItemKey,
        encryptedPayload,
        cryptoMeta
      }),
      headers: { 'Content-Type': 'application/json' }
    });

    router.push('/vault');
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded shadow mt-10">
      <h2 className="text-2xl mb-6 font-bold">Create New Item</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        
        <div className="flex gap-4 mb-4">
          <button type="button" onClick={() => setType('PASSWORD')} className={`px-4 py-2 rounded ${type==='PASSWORD'?'bg-blue-100 border-blue-500 border text-blue-800':'bg-gray-100'}`}>Password</button>
          <button type="button" onClick={() => setType('NOTE')} className={`px-4 py-2 rounded ${type==='NOTE'?'bg-blue-100 border-blue-500 border text-blue-800':'bg-gray-100'}`}>Secure Note</button>
        </div>

        <input placeholder="Title (Visible Metadata)" className="border p-2 rounded" value={title} onChange={e=>setTitle(e.target.value)} required />
        
        {type === 'PASSWORD' && (
          <>
            <input placeholder="Username" className="border p-2 rounded" value={username} onChange={e=>setUsername(e.target.value)} />
            <input placeholder="Password" type="password" className="border p-2 bg-yellow-50 rounded" value={password} onChange={e=>setPassword(e.target.value)} />
            <input placeholder="Website URL" className="border p-2 rounded" value={url} onChange={e=>setUrl(e.target.value)} />
          </>
        )}

        <textarea placeholder="Secure Notes (Encrypted)" className="border p-2 h-32 rounded" value={notes} onChange={e=>setNotes(e.target.value)}></textarea>

        <button className="bg-green-600 text-white p-3 rounded mt-4 hover:bg-green-700">Encrypt & Save</button>
      </form>
    </div>
  );
}