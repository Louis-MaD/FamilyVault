'use client';
import React, { useEffect, useState } from 'react';
import { Search, FileKey, StickyNote, Users, X } from 'lucide-react';

interface FamilyItem {
  id: string;
  type: 'PASSWORD' | 'NOTE';
  title: string;
  url: string | null;
  tags: string[];
  visibility: 'PRIVATE' | 'PUBLIC' | 'FAMILY_REQUEST';
  requestable: boolean;
  ownerUserId: string;
  ownerDisplayName: string;
  createdAt: string;
}

interface GroupedItems {
  [ownerName: string]: FamilyItem[];
}

interface AccessRequest {
  id: string;
  itemId: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED' | 'EXPIRED';
}

export default function FamilyVaultPage() {
  const [items, setItems] = useState<FamilyItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [userStatus, setUserStatus] = useState<'ACTIVE' | 'PENDING' | 'DISABLED' | ''>('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FamilyItem | null>(null);
  const [requestReason, setRequestReason] = useState('');

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const user = await res.json();
        setCurrentUserId(user.id);
        setUserStatus(user.status);
      }
    } catch (error) {
      console.error('Error fetching current user:', error);
    }
  };

  useEffect(() => {
    if (!userStatus) return;
    if (userStatus !== 'ACTIVE') {
      setLoading(false);
      return;
    }
    fetchItems();
    fetchMyRequests();
  }, [userStatus]);

  const fetchItems = async (query = '') => {
    setLoading(true);
    try {
      const url = query
        ? `/api/family/items?q=${encodeURIComponent(query)}`
        : '/api/family/items';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      } else if (res.status === 403) {
        setItems([]);
      } else {
        console.error('Failed to fetch items');
      }
    } catch (error) {
      console.error('Error fetching family items:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyRequests = async () => {
    try {
      const res = await fetch('/api/requests/outgoing');
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (userStatus !== 'ACTIVE') return;
    fetchItems(searchQuery);
  };

  const openRequestModal = (item: FamilyItem) => {
    setSelectedItem(item);
    setRequestReason('');
    setShowRequestModal(true);
  };

  const closeRequestModal = () => {
    setShowRequestModal(false);
    setSelectedItem(null);
    setRequestReason('');
  };

  const handleRequestAccess = async () => {
    if (!selectedItem) return;

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: selectedItem.id,
          reason: requestReason || null,
        }),
      });

      if (res.ok) {
        const newRequest = await res.json();
        setRequests([...requests, newRequest]);
        closeRequestModal();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to create request');
      }
    } catch (error) {
      console.error('Error creating request:', error);
      alert('Failed to create request');
    }
  };

  const getRequestForItem = (itemId: string) => {
    return requests.find(r => r.itemId === itemId && r.status === 'PENDING');
  };

  // Group items by owner
  const groupedItems: GroupedItems = items.reduce((acc, item) => {
    const ownerName = item.ownerDisplayName;
    if (!acc[ownerName]) {
      acc[ownerName] = [];
    }
    acc[ownerName].push(item);
    return acc;
  }, {} as GroupedItems);

  // Sort groups: my items first, then alphabetically
  const sortedGroups = Object.entries(groupedItems).sort(([nameA, itemsA], [nameB, itemsB]) => {
    const isAMine = itemsA.some(i => i.ownerUserId === currentUserId);
    const isBMine = itemsB.some(i => i.ownerUserId === currentUserId);

    if (isAMine && !isBMine) return -1;
    if (!isAMine && isBMine) return 1;
    return nameA.localeCompare(nameB);
  });

  // Filter out empty groups when searching
  const visibleGroups = searchQuery
    ? sortedGroups.filter(([_, groupItems]) => groupItems.length > 0)
    : sortedGroups;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Users className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-bold">Family Vault</h1>
      </div>

      {userStatus && userStatus !== 'ACTIVE' && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded">
          Your account is awaiting approval from an admin. Once activated, you'll be able to view and request family items.
        </div>
      )}

      <p className="text-gray-600 mb-6">
        View passwords and notes shared by your family members. You can see metadata but need to request access for actual credentials.
      </p>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by title or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </form>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading family vault...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && items.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            {searchQuery ? 'No matching items found' : 'No family items yet'}
          </h3>
          <p className="text-gray-600">
            {searchQuery
              ? 'Try a different search term'
              : 'Family members can share password metadata here'}
          </p>
        </div>
      )}

      {/* Grouped Items */}
      {!loading && userStatus === 'ACTIVE' && visibleGroups.map(([ownerName, groupItems]) => {
        const isMine = groupItems.some(i => i.ownerUserId === currentUserId);
        const sortedItems = groupItems.sort((a, b) => a.title.localeCompare(b.title));

        return (
          <div key={ownerName} className="mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              {isMine && <span className="text-blue-600">(Me)</span>}
              {ownerName}
              <span className="text-sm font-normal text-gray-500">
                ({groupItems.length} {groupItems.length === 1 ? 'item' : 'items'})
              </span>
            </h2>

            <div className="grid gap-3">
              {sortedItems.map(item => (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {item.type === 'PASSWORD' ? (
                      <FileKey className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    ) : (
                      <StickyNote className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {item.title}
                      </h3>

                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline truncate block"
                        >
                          {item.url}
                        </a>
                      )}

                      <div className="flex gap-2 mt-2 flex-wrap">
                        {item.visibility === 'PRIVATE' && (
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                            Private
                          </span>
                        )}
                        {item.requestable && !isMine && (
                          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                            Requestable
                          </span>
                        )}
                        {item.tags.map(tag => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {!isMine && (
                      <div className="ml-auto flex gap-2">
                        {item.visibility === 'PUBLIC' ? (
                          <a
                            href={`/vault/${item.id}`}
                            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                          >
                            Open
                          </a>
                        ) : (
                          item.requestable && (
                            getRequestForItem(item.id) ? (
                              <span className="text-xs px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded border border-yellow-300">
                                Requested
                              </span>
                            ) : (
                              <button
                                onClick={() => openRequestModal(item)}
                                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                              >
                                Request Access
                              </button>
                            )
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Request Access Modal */}
      {userStatus === 'ACTIVE' && showRequestModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Request Access</h3>
              <button
                onClick={closeRequestModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                You're requesting access to:
              </p>
              <p className="font-semibold text-gray-900">{selectedItem.title}</p>
              {selectedItem.url && (
                <p className="text-sm text-blue-600">{selectedItem.url}</p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason (Optional)
              </label>
              <textarea
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Why do you need access to this item?"
                className="w-full border border-gray-300 rounded-lg p-2 text-sm h-24 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-800">
                <strong>Duration:</strong> If approved, access will expire after 1 hour
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeRequestModal}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestAccess}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
