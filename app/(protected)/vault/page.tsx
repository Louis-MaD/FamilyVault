'use client';
import React, { useEffect, useState } from 'react';
import { useVault } from '@/components/VaultContext';
import Link from 'next/link';
import { Lock, FileKey, StickyNote, Copy } from 'lucide-react';
import { decryptVaultItem } from '@/lib/crypto.client';

interface Item {
  id: string;
  title: string;
  type: 'PASSWORD' | 'NOTE';
  tags: string[];
  wrappedItemKey: string;
  encryptedPayload: string;
  cryptoMeta: any;
  decryptedData?: any;
}

export default function VaultList() {
  const { isUnlocked, vaultKey, unlockVault } = useVault();
  const [items, setItems] = useState<Item[]>([]);
  const [pwd, setPwd] = useState('');
  const [salt, setSalt] = useState('');

  // Fetch Items and User Salt
  useEffect(() => {
    // Fetch user's KDF salt from the server
    fetch('/api/user/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch user data');
      })
      .then(userData => {
        setSalt(userData.kdfSalt);
      })
      .catch(err => {
        console.error('Error fetching user data:', err);
      });

    // Fetch vault items
    fetch('/api/vault')
      .then(res => {
        if (res.ok) return res.json();
        return [];
      })
      .then(setItems);
  }, []);

  // Decrypt items when vault is unlocked
  useEffect(() => {
    if (isUnlocked && vaultKey && items.length > 0) {
      (async () => {
        const decryptedItems = await Promise.all(items.map(async (item) => {
          if (item.decryptedData) return item;
          try {
            const data = await decryptVaultItem(
              item.wrappedItemKey, 
              item.encryptedPayload, 
              item.cryptoMeta, 
              vaultKey
            );
            return { ...item, decryptedData: data };
          } catch (e) {
            console.error("Failed to decrypt item", item.id);
            return item;
          }
        }));
        setItems(decryptedItems);
      })();
    }
  }, [isUnlocked, vaultKey, items.length]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!salt) {
      alert('Salt not loaded. Please refresh the page.');
      return;
    }

    const success = await unlockVault(pwd, salt);
    if (!success) {
      alert('Incorrect password');
    } else {
      setPwd('');
    }
  };

  if (!isUnlocked) {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow text-center">
        <Lock className="mx-auto w-12 h-12 text-gray-400 mb-4" />
        <h2 className="text-xl mb-4 font-bold">Vault Locked</h2>
        <p className="text-sm text-gray-500 mb-4">Enter your master password to decrypt locally.</p>
        <form onSubmit={handleUnlock}>
          <input
            type="password"
            className="border p-2 w-full rounded mb-4"
            placeholder="Master Password"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            required
          />
          <button
            className="bg-green-600 text-white w-full py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
            disabled={!salt}
          >
            {salt ? 'Unlock Vault' : 'Loading...'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Vault</h1>
        <Link href="/vault/new" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          + New Item
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map(item => (
          <Link
            key={item.id}
            href={`/vault/${item.id}`}
            className="bg-white p-4 rounded shadow border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-2">
              {item.type === 'PASSWORD' ? <FileKey size={20} className="text-blue-500"/> : <StickyNote size={20} className="text-yellow-500"/>}
              <h3 className="font-bold text-lg">{item.title}</h3>
            </div>

            <div className="text-sm text-gray-600 min-h-[60px]">
              {item.decryptedData ? (
                <div>
                   {item.type === 'PASSWORD' && (
                     <>
                       <p className="mb-1 font-semibold">{item.decryptedData.username}</p>
                       <div className="flex gap-2 items-center bg-gray-100 p-1 rounded justify-between">
                         <span className="font-mono text-xs truncate">********</span>
                         <button
                            onClick={(e) => {
                              e.preventDefault();
                              navigator.clipboard.writeText(item.decryptedData.password);
                            }}
                            title="Copy Password"
                            className="text-gray-500 hover:text-blue-600"
                         >
                           <Copy size={14}/>
                         </button>
                       </div>
                     </>
                   )}
                   {item.type === 'NOTE' && (
                     <p className="line-clamp-3 whitespace-pre-wrap">{item.decryptedData.notes}</p>
                   )}
                </div>
              ) : (
                <span className="italic text-gray-400">Decrypting...</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}