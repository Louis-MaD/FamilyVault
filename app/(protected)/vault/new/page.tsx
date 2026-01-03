'use client';
import React, { useState } from 'react';
import { useVault } from '@/components/VaultContext';
import { encryptVaultItem, wrapItemKeyForRecipient } from '@/lib/crypto.client';
import { useRouter } from 'next/navigation';

export default function NewItem() {
  const { vaultKey, isUnlocked } = useVault();
  const router = useRouter();
  const [type, setType] = useState<'PASSWORD' | 'NOTE'>('PASSWORD');

  // Metadata (unencrypted)
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC' | 'FAMILY_REQUEST'>('FAMILY_REQUEST');
  const [requestable, setRequestable] = useState(true);

  // Secrets (will be encrypted)
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  
  const [loading, setLoading] = useState(false);

  if (!isUnlocked || !vaultKey) return <div className="p-10 text-center text-red-500">Please unlock vault first.</div>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Prepare payload (encrypted secrets only)
      const payload = {
        username,
        password,
        notes
      };

      // 2. Encrypt locally
      // We need rawDek if we are publishing publicly
      const { wrappedItemKey, encryptedPayload, cryptoMeta, rawDek } = await encryptVaultItem(payload, vaultKey);

      // 3. Send to server (create item)
      const res = await fetch('/api/vault', {
        method: 'POST',
        body: JSON.stringify({
          type,
          title,
          url: url || null,
          visibility,
          requestable: visibility === 'FAMILY_REQUEST' ? requestable : true, // Only relevant for request flow
          tags: [],
          wrappedItemKey,
          encryptedPayload,
          cryptoMeta
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to create item');
        setLoading(false);
        return;
      }
      
      const { id: newItemId } = await res.json().catch(() => ({})); 

      if (visibility === 'PUBLIC' && rawDek && newItemId) {
        // Fetch active users
        const usersRes = await fetch('/api/users/active');
        if (usersRes.ok) {
          const activeUsers = await usersRes.json();
          const grants = [];

          for (const user of activeUsers) {
            if (user.publicKey) {
              const wrappedKey = await wrapItemKeyForRecipient(rawDek, user.publicKey);
              grants.push({
                toUserId: user.id,
                wrappedItemKey: wrappedKey
              });
            }
          }

          if (grants.length > 0) {
            await fetch(`/api/items/${newItemId}/publish`, {
              method: 'POST',
              body: JSON.stringify({ grants }),
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert('Error creating item');
    } finally {
      setLoading(false);
    }
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
            <input placeholder="Website URL (Visible Metadata)" className="border p-2 rounded" value={url} onChange={e=>setUrl(e.target.value)} />
            <input placeholder="Username (Encrypted)" className="border p-2 bg-yellow-50 rounded" value={username} onChange={e=>setUsername(e.target.value)} />
            <input placeholder="Password (Encrypted)" type="password" className="border p-2 bg-yellow-50 rounded" value={password} onChange={e=>setPassword(e.target.value)} />
          </>
        )}

        <textarea placeholder="Secure Notes (Encrypted)" className="border p-2 h-32 bg-yellow-50 rounded" value={notes} onChange={e=>setNotes(e.target.value)}></textarea>

        {/* Family Vault Settings */}
        <div className="border rounded p-4 bg-gray-50">
          <h3 className="font-semibold mb-3 text-gray-700">Visibility & Access</h3>

          <div className="space-y-3">
             {/* PRIVATE */}
            <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-gray-100">
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'PRIVATE'}
                onChange={() => setVisibility('PRIVATE')}
                className="mt-1 w-4 h-4 text-blue-600"
              />
              <div>
                <div className="font-medium text-gray-900">Private</div>
                <div className="text-sm text-gray-600">Only you can see this item.</div>
              </div>
            </label>

            {/* FAMILY_REQUEST */}
            <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-gray-100">
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'FAMILY_REQUEST'}
                onChange={() => setVisibility('FAMILY_REQUEST')}
                className="mt-1 w-4 h-4 text-blue-600"
              />
              <div>
                <div className="font-medium text-gray-900">Family Request</div>
                <div className="text-sm text-gray-600">Active family members can see metadata (Title, URL) but must request access to view credentials.</div>
              </div>
            </label>

            {/* PUBLIC */}
            <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-gray-100">
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'PUBLIC'}
                onChange={() => setVisibility('PUBLIC')}
                className="mt-1 w-4 h-4 text-blue-600"
              />
              <div>
                <div className="font-medium text-gray-900">Public (Auto-Access)</div>
                <div className="text-sm text-gray-600">Active family members can view everything immediately without requesting.</div>
              </div>
            </label>
          </div>
        </div>

        <button disabled={loading} className="bg-green-600 text-white p-3 rounded mt-4 hover:bg-green-700 disabled:bg-gray-400">
          {loading ? 'Processing...' : 'Encrypt & Save'}
        </button>
      </form>
    </div>
  );
}
