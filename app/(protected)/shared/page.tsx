'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Search, FileKey, StickyNote, Users, Copy, Clock } from 'lucide-react';
import { useVault } from '@/components/VaultContext';
import {
  decryptPayloadWithDek,
  decryptPrivateKey,
  unwrapItemKeyFromGrant,
} from '@/lib/crypto.client';

interface GrantItem {
  id: string;
  type: 'PASSWORD' | 'NOTE';
  title: string;
  url: string | null;
  encryptedPayload: string;
  cryptoMeta: any;
}

interface ShareGrant {
  id: string;
  wrappedItemKeyForRecipient: string;
  expiresAt: string;
  createdAt: string;
  item: GrantItem;
  fromUser: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

interface KeyInfo {
  hasKeypair: boolean;
  publicKey?: string;
  encryptedPrivateKey?: string;
}

export default function SharedPage() {
  const { isUnlocked, vaultKey } = useVault();
  const [grants, setGrants] = useState<ShareGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [decryptedByGrant, setDecryptedByGrant] = useState<Record<string, any>>({});
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [userStatus, setUserStatus] = useState<'ACTIVE' | 'PENDING' | 'DISABLED' | ''>('');
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    fetchUserStatus();
    fetchKeyInfo();
  }, []);

  useEffect(() => {
    if (isUnlocked) fetchKeyInfo();
  }, [isUnlocked]);

  useEffect(() => {
    if (!userStatus) return;
    if (userStatus !== 'ACTIVE') {
      setLoading(false);
      return;
    }
    fetchGrants();
  }, [userStatus]);

  useEffect(() => {
    if (!isUnlocked) {
      setDecryptedByGrant({});
    }
  }, [isUnlocked]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUserStatus = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const data = await res.json();
        setUserStatus(data.status);
      }
    } catch (error) {
      console.error('Error fetching user status:', error);
    }
  };

  const fetchKeyInfo = async () => {
    try {
      const res = await fetch('/api/keys/me');
      if (res.ok) {
        const data = await res.json();
        setKeyInfo(data);
      }
    } catch (error) {
      console.error('Error fetching key info:', error);
    }
  };

  const fetchGrants = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/grants');
      if (res.ok) {
        const data = await res.json();
        setGrants(data);
      }
    } catch (error) {
      console.error('Error fetching grants:', error);
    } finally {
      setLoading(false);
    }
  };

  const decryptGrant = async (grant: ShareGrant) => {
    if (!isUnlocked || !vaultKey) {
      alert('Unlock your vault to view shared items.');
      return;
    }

    if (!keyInfo?.publicKey || !keyInfo?.encryptedPrivateKey) {
      alert('Your sharing keys are not available yet.');
      return;
    }

    try {
      const privateKey = await decryptPrivateKey(keyInfo.encryptedPrivateKey, vaultKey);
      const itemDek = await unwrapItemKeyFromGrant(
        grant.wrappedItemKeyForRecipient,
        keyInfo.publicKey,
        privateKey
      );
      const decrypted = await decryptPayloadWithDek(
        grant.item.encryptedPayload,
        grant.item.cryptoMeta,
        itemDek
      );
      setDecryptedByGrant(prev => ({ ...prev, [grant.id]: decrypted }));

      fetch(`/api/grants/${grant.id}/viewed`, { method: 'POST' }).catch(() => null);
    } catch (error) {
      console.error('Error decrypting shared item:', error);
      alert('Failed to decrypt shared item.');
    }
  };

  const filteredGrants = useMemo(() => {
    const active = grants.filter(g => new Date(g.expiresAt).getTime() > now.getTime());
    if (!searchQuery) return active;
    const query = searchQuery.toLowerCase();
    return active.filter(g => {
      const titleMatch = g.item.title.toLowerCase().includes(query);
      const urlMatch = g.item.url?.toLowerCase().includes(query);
      return titleMatch || urlMatch;
    });
  }, [grants, searchQuery, now]);

  const groupedGrants = filteredGrants.reduce((acc, grant) => {
    const ownerName = grant.fromUser.displayName || grant.fromUser.email.split('@')[0];
    if (!acc[ownerName]) acc[ownerName] = [];
    acc[ownerName].push(grant);
    return acc;
  }, {} as Record<string, ShareGrant[]>);

  const sortedGroups = Object.entries(groupedGrants).sort(([a], [b]) => a.localeCompare(b));

  const formatExpiry = (expiresAt: string) => {
    const diffMs = new Date(expiresAt).getTime() - now.getTime();
    if (diffMs <= 0) return 'Expired';
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0) return `${hours}h ${remainingMinutes}m`;
    return `${remainingMinutes}m`;
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Users className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Shared With Me</h1>
      </div>

      {userStatus && userStatus !== 'ACTIVE' && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded">
          Your account is awaiting approval from an admin. You'll be able to view shared items once activated.
        </div>
      )}

      {userStatus === 'ACTIVE' && !isUnlocked && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded">
          Unlock your vault to decrypt shared secrets.
        </div>
      )}

      {userStatus === 'ACTIVE' && keyInfo && !keyInfo.hasKeypair && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded">
          Your sharing keys are still being generated. Unlock your vault again to retry setup.
        </div>
      )}

      <form
        onSubmit={(e) => e.preventDefault()}
        className="mb-8"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by title or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={userStatus !== 'ACTIVE'}
          />
        </div>
      </form>

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading shared items...</p>
        </div>
      )}

      {!loading && userStatus === 'ACTIVE' && sortedGroups.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            {searchQuery ? 'No matching shared items' : 'No shared items yet'}
          </h3>
          <p className="text-gray-600">
            Shared items will appear here after an owner approves your request.
          </p>
        </div>
      )}

      {!loading && userStatus === 'ACTIVE' && sortedGroups.map(([ownerName, ownerGrants]) => (
        <div key={ownerName} className="mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            {ownerName}
            <span className="text-sm font-normal text-gray-500">
              ({ownerGrants.length} {ownerGrants.length === 1 ? 'item' : 'items'})
            </span>
          </h2>

          <div className="grid gap-3">
            {ownerGrants.map(grant => {
              const decrypted = decryptedByGrant[grant.id];
              return (
                <div
                  key={grant.id}
                  className="bg-white p-4 rounded-lg border border-gray-200"
                >
                  <div className="flex items-start gap-3">
                    {grant.item.type === 'PASSWORD' ? (
                      <FileKey className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <StickyNote className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-gray-900 truncate">
                            {grant.item.title}
                          </h3>
                          {grant.item.url && (
                            <p className="text-sm text-blue-600 truncate">
                              {grant.item.url}
                            </p>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Expires in {formatExpiry(grant.expiresAt)}
                        </div>
                      </div>

                      <div className="mt-3">
                        {!decrypted ? (
                          <button
                            onClick={() => decryptGrant(grant)}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                          >
                            View Secret
                          </button>
                        ) : (
                          <div className="text-sm text-gray-600">
                            {grant.item.type === 'PASSWORD' && (
                              <div className="space-y-2">
                                <p className="font-semibold">{decrypted.username}</p>
                                <div className="flex gap-2 items-center bg-gray-100 p-1 rounded justify-between">
                                  <span className="font-mono text-xs truncate">********</span>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(decrypted.password)}
                                    title="Copy Password"
                                    className="text-gray-500 hover:text-blue-600"
                                  >
                                    <Copy size={14} />
                                  </button>
                                </div>
                              </div>
                            )}
                            {grant.item.type === 'NOTE' && (
                              <p className="line-clamp-3 whitespace-pre-wrap">{decrypted.notes}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
