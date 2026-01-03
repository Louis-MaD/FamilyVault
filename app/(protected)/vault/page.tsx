'use client';
import React, { useEffect, useState } from 'react';
import { useVault } from '@/components/VaultContext';
import Link from 'next/link';
import { Lock, FileKey, StickyNote, Copy, File, Eye } from 'lucide-react';
import { decryptVaultItem, decryptFile } from '@/lib/crypto.client';

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

interface FileMetadata {
  id: string;
  title: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  wrappedFileKey?: string;
  cryptoMeta?: any;
}

type FilterType = 'ALL' | 'PASSWORD' | 'NOTE' | 'FILE';

export default function VaultList() {
  const { isUnlocked, vaultKey, unlockVault } = useVault();
  const [items, setItems] = useState<Item[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [pwd, setPwd] = useState('');
  const [salt, setSalt] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');

  // Fetch Items, Files and User Salt
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

    // Fetch files
    fetch('/api/files')
      .then(res => {
        if (res.ok) return res.json();
        return [];
      })
      .then(setFiles);
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
        
        // Only update if changes were made
        const hasChanges = decryptedItems.some((item, index) => item.decryptedData !== items[index].decryptedData);
        if (hasChanges) {
          setItems(decryptedItems);
        }
      })();
    }
  }, [isUnlocked, vaultKey, items.length]); 
  // Note: removing 'items' from dependency array to avoid loop if setItems triggers re-render 
  // efficiently, but actually we need to trigger when items *load*. 
  // better pattern: separate encrypted vs decrypted state or check for modification.
  // The logic above checks for `decryptedData` existence which breaks loop.

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

  const handleViewFile = async (e: React.MouseEvent, file: FileMetadata) => {
    e.preventDefault();
    if (!isUnlocked || !vaultKey) {
      alert('Please unlock your vault to view files');
      return;
    }

    try {
      // Fetch metadata (re-fetch to be safe or use what we have if complete)
      // The list endpoint might not return wrappedFileKey to save bandwidth? 
      // Checking /api/files route... usually returns list.
      // Let's stick to the detail fetch pattern to be robust.
      const metaRes = await fetch(`/api/files/${file.id}/meta`);
      if (!metaRes.ok) throw new Error('Failed to fetch file metadata');
      const fileMeta: any = await metaRes.json();

      if (!fileMeta.wrappedFileKey || !fileMeta.cryptoMeta) {
        throw new Error('File encryption metadata missing');
      }

      // Download encrypted bytes
      const downloadRes = await fetch(`/api/files/${file.id}/download`);
      if (!downloadRes.ok) throw new Error('Failed to download file');

      const encryptedBytes = new Uint8Array(await downloadRes.arrayBuffer());

      // Decrypt
      const decryptedBytes = await decryptFile(
        encryptedBytes,
        fileMeta.wrappedFileKey,
        fileMeta.cryptoMeta,
        vaultKey
      );

      // Create blob and open in new tab
      const blob = new Blob([decryptedBytes], { type: fileMeta.mimeType });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error: any) {
      console.error('View error:', error);
      alert(error.message || 'Failed to decrypt file');
    }
  };

  const filteredData = () => {
    if (filter === 'ALL') {
      return [
        ...items.map(i => ({ ...i, kind: 'ITEM' as const })),
        ...files.map(f => ({ ...f, kind: 'FILE' as const }))
      ];
    }
    if (filter === 'FILE') {
      return files.map(f => ({ ...f, kind: 'FILE' as const }));
    }
    return items
      .filter(i => i.type === filter)
      .map(i => ({ ...i, kind: 'ITEM' as const }));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const renderPill = (type: FilterType, label: string) => (
    <button
      onClick={() => setFilter(type)}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
        filter === type
          ? 'bg-blue-600 text-white'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Vault</h1>
        <Link href="/vault/new" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          + New Item
        </Link>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {renderPill('ALL', 'All')}
        {renderPill('PASSWORD', 'Passwords')}
        {renderPill('NOTE', 'Notes')}
        {renderPill('FILE', 'Files')}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredData().map((entry: any) => {
          if (entry.kind === 'FILE') {
            const file = entry as FileMetadata;
            return (
              <div
                key={`file-${file.id}`}
                className="bg-white p-4 rounded shadow border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2 text-purple-600">
                    <File size={20} />
                    <h3 className="font-bold text-lg truncate" title={file.title || file.filename}>
                      {file.title || file.filename}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    {file.filename} • {formatFileSize(file.sizeBytes)}
                  </p>
                </div>
                <button
                  onClick={(e) => handleViewFile(e, file)}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-colors"
                >
                  <Eye size={16} /> View File
                </button>
              </div>
            );
          }

          const item = entry as Item;
          return (
            <Link
              key={item.id}
              href={`/vault/${item.id}`}
              className="bg-white p-4 rounded shadow border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer block"
            >
              <div className="flex items-center gap-2 mb-2">
                {item.type === 'PASSWORD' ? <FileKey size={20} className="text-blue-500"/> : <StickyNote size={20} className="text-yellow-500"/>}
                <h3 className="font-bold text-lg truncate" title={item.title}>{item.title}</h3>
              </div>

              <div className="text-sm text-gray-600 min-h-[60px]">
                {item.decryptedData ? (
                  <div>
                     {item.type === 'PASSWORD' && (
                       <>
                         <p className="mb-1 font-semibold truncate">{item.decryptedData.username}</p>
                         <div className="flex gap-2 items-center bg-gray-100 p-1 rounded justify-between">
                           <span className="font-mono text-xs truncate">********</span>
                           <button
                              onClick={(e) => {
                                e.preventDefault();
                                navigator.clipboard.writeText(item.decryptedData.password);
                              }}
                              title="Copy Password"
                              className="text-gray-500 hover:text-blue-600 px-2"
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
          );
        })}
        {filteredData().length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            No items found.
          </div>
        )}
      </div>
    </div>
  );
}
