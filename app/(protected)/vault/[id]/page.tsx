'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useVault } from '@/components/VaultContext';
import { decryptVaultItem, decryptFile, encryptFile } from '@/lib/crypto.client';
import { FileKey, StickyNote, ArrowLeft, Paperclip, Eye, Trash2, Plus, Upload, Search } from 'lucide-react';
import Link from 'next/link';

interface Item {
  id: string;
  title: string;
  type: 'PASSWORD' | 'NOTE';
  tags: string[];
  wrappedItemKey: string;
  encryptedPayload: string;
  cryptoMeta: any;
}

interface DecryptedData {
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
}

interface FileMetadata {
  id: string;
  title: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export default function VaultItemDetail() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;
  const { isUnlocked, vaultKey } = useVault();

  const [item, setItem] = useState<Item | null>(null);
  const [decryptedData, setDecryptedData] = useState<DecryptedData | null>(null);
  const [attachments, setAttachments] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<FileMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchItem();
  }, [itemId]);

  useEffect(() => {
    if (isUnlocked && item && vaultKey) {
      decryptItem();
    }
  }, [isUnlocked, item, vaultKey]);

  useEffect(() => {
    if (itemId) {
      fetchAttachments();
    }
  }, [itemId]);

  const fetchItem = async () => {
    try {
      const res = await fetch('/api/vault');
      if (res.ok) {
        const items = await res.json();
        const foundItem = items.find((i: Item) => i.id === itemId);
        if (foundItem) {
          setItem(foundItem);
        } else {
          router.push('/vault');
        }
      }
    } catch (error) {
      console.error('Error fetching item:', error);
    } finally {
      setLoading(false);
    }
  };

  const decryptItem = async () => {
    if (!item || !vaultKey) return;

    try {
      const data = await decryptVaultItem(
        item.wrappedItemKey,
        item.encryptedPayload,
        item.cryptoMeta,
        vaultKey
      );
      setDecryptedData(data);
    } catch (error) {
      console.error('Failed to decrypt item:', error);
    }
  };

  const fetchAttachments = async () => {
    try {
      const res = await fetch(`/api/items/${itemId}/attachments`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data);
      }
    } catch (error) {
      console.error('Error fetching attachments:', error);
    }
  };

  const handleDetach = async (fileId: string) => {
    if (!confirm('Detach this file from the item?')) return;

    try {
      const res = await fetch(`/api/items/${itemId}/attachments/${fileId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchAttachments();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to detach file');
      }
    } catch (error) {
      console.error('Error detaching file:', error);
      alert('Failed to detach file');
    }
  };

  const handleViewFile = async (file: FileMetadata) => {
    if (!isUnlocked || !vaultKey) {
      alert('Please unlock your vault to view files');
      return;
    }

    try {
      // Fetch metadata
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

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const openAttachModal = async () => {
    setShowAttachModal(true);
    setSearchQuery('');
    await fetchAvailableFiles();
  };

  const fetchAvailableFiles = async (query?: string) => {
    try {
      const url = query ? `/api/files?q=${encodeURIComponent(query)}` : '/api/files';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        // Filter out files already attached to this item
        const attachedIds = new Set(attachments.map(a => a.id));
        const available = data.filter((f: FileMetadata) => !attachedIds.has(f.id));
        setAvailableFiles(available);
      }
    } catch (error) {
      console.error('Error fetching available files:', error);
    }
  };

  const handleSearchFiles = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAvailableFiles(searchQuery);
  };

  const handleAttachFile = async (fileId: string) => {
    setAttaching(true);
    try {
      const res = await fetch(`/api/items/${itemId}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });

      if (res.ok) {
        setShowAttachModal(false);
        fetchAttachments();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to attach file');
      }
    } catch (error) {
      console.error('Error attaching file:', error);
      alert('Failed to attach file');
    } finally {
      setAttaching(false);
    }
  };

  const handleUploadAndAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!vaultKey) {
      alert('Please unlock your vault first');
      return;
    }

    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setUploading(true);

    try {
      // Read file bytes
      const arrayBuffer = await selectedFile.arrayBuffer();
      const fileBytes = new Uint8Array(arrayBuffer);

      // Encrypt file
      const { encryptedBytes, wrappedFileKey, cryptoMeta } = await encryptFile(
        fileBytes,
        vaultKey
      );

      // Step 1: Initialize upload with itemId
      const initRes = await fetch('/api/files/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          sizeBytes: selectedFile.size,
          title: selectedFile.name.replace(/\.[^/.]+$/, ''),
          itemId: itemId, // Pass itemId to directly attach
        }),
      });

      if (!initRes.ok) {
        const error = await initRes.json();
        throw new Error(error.error || 'Failed to initialize upload');
      }

      const { fileId } = await initRes.json();

      // Step 2: Upload encrypted bytes
      const uploadRes = await fetch(`/api/files/${fileId}/upload`, {
        method: 'PUT',
        body: encryptedBytes,
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload file');
      }

      // Step 3: Complete with encryption metadata
      const completeRes = await fetch(`/api/files/${fileId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wrappedFileKey,
          cryptoMeta,
        }),
      });

      if (!completeRes.ok) {
        throw new Error('Failed to complete upload');
      }

      // Close modal and refresh attachments
      setShowAttachModal(false);
      fetchAttachments();

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || 'Failed to upload and attach file');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="container mx-auto p-6">
        <p>Item not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <Link
          href="/vault"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Vault
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          {item.type === 'PASSWORD' ? (
            <FileKey className="w-8 h-8 text-blue-500" />
          ) : (
            <StickyNote className="w-8 h-8 text-yellow-500" />
          )}
          <h1 className="text-3xl font-bold">{item.title}</h1>
        </div>

        {!isUnlocked && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded">
            Unlock your vault to view item details.
          </div>
        )}

        {isUnlocked && decryptedData && (
          <div className="space-y-4">
            {item.type === 'PASSWORD' && (
              <>
                {decryptedData.url && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      URL
                    </label>
                    <a
                      href={decryptedData.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {decryptedData.url}
                    </a>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Username
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={decryptedData.username || ''}
                      readOnly
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded"
                    />
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(decryptedData.username || '')
                      }
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      value={decryptedData.password || ''}
                      readOnly
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded font-mono"
                    />
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(decryptedData.password || '')
                      }
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {decryptedData.notes && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={decryptedData.notes}
                      readOnly
                      rows={4}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded"
                    />
                  </div>
                )}
              </>
            )}

            {item.type === 'NOTE' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={decryptedData.notes || ''}
                  readOnly
                  rows={8}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded whitespace-pre-wrap"
                />
              </div>
            )}
          </div>
        )}

        {isUnlocked && !decryptedData && (
          <div className="text-center py-4 text-gray-500">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 mb-2"></div>
            <p>Decrypting...</p>
          </div>
        )}
      </div>

      {/* Attachments Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Paperclip className="w-6 h-6" />
            Attachments
          </h2>
          <button
            onClick={openAttachModal}
            disabled={!isUnlocked}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Attach File
          </button>
        </div>

        {!isUnlocked && (
          <div className="p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded">
            Unlock your vault to view and manage attachments.
          </div>
        )}

        {isUnlocked && attachments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Paperclip className="w-12 h-12 mx-auto mb-2 text-gray-400" />
            <p>No files attached to this item</p>
          </div>
        )}

        {isUnlocked && attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
              >
                <Paperclip className="w-5 h-5 text-gray-400 flex-shrink-0" />

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {file.title || file.filename}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {file.filename} • {formatFileSize(file.sizeBytes)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewFile(file)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Open file"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDetach(file.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Detach file"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attach File Modal */}
      {showAttachModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-bold">Attach File to Item</h3>
              <button
                onClick={() => setShowAttachModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <div className="p-6 border-b space-y-4">
              <div className="flex gap-2 items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={handleUploadAndAttach}
                  className="hidden"
                  disabled={uploading}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Uploading...' : 'Upload New File'}
                </button>
                <span className="text-gray-500">or attach an existing file:</span>
              </div>

              <form onSubmit={handleSearchFiles} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search your files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Search
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {availableFiles.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Paperclip className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>No available files found</p>
                  <p className="text-sm mt-2">
                    {searchQuery
                      ? 'Try a different search term'
                      : 'Upload files from the Files page first'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                    >
                      <Paperclip className="w-5 h-5 text-gray-400 flex-shrink-0" />

                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate">
                          {file.title || file.filename}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {file.filename} • {formatFileSize(file.sizeBytes)} •{' '}
                          {new Date(file.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <button
                        onClick={() => handleAttachFile(file.id)}
                        disabled={attaching}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Attach
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t bg-gray-50">
              <button
                onClick={() => setShowAttachModal(false)}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
