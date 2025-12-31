'use client';
import React, { useEffect, useState, useRef } from 'react';
import { Upload, Search, FileText, Image as ImageIcon, Trash2, Eye, Download } from 'lucide-react';
import { useVault } from '@/components/VaultContext';
import { encryptFile, decryptFile } from '@/lib/crypto.client';

interface FileMetadata {
  id: string;
  title: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  itemId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FileWithMeta extends FileMetadata {
  wrappedFileKey?: string;
  cryptoMeta?: any;
}

export default function FilesPage() {
  const { isUnlocked, vaultKey } = useVault();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [userStatus, setUserStatus] = useState<'ACTIVE' | 'PENDING' | 'DISABLED' | ''>('');
  const [viewingFile, setViewingFile] = useState<FileWithMeta | null>(null);
  const [decryptedBlob, setDecryptedBlob] = useState<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUserStatus();
  }, []);

  useEffect(() => {
    if (!userStatus) return;
    if (userStatus !== 'ACTIVE') {
      setLoading(false);
      return;
    }
    fetchFiles();
  }, [userStatus]);

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

  const fetchFiles = async (query?: string) => {
    setLoading(true);
    try {
      const url = query ? `/api/files?q=${encodeURIComponent(query)}` : '/api/files';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFiles(searchQuery);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isUnlocked || !vaultKey) {
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

      // Step 1: Initialize upload
      const initRes = await fetch('/api/files/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          mimeType: selectedFile.type,
          sizeBytes: selectedFile.size,
          title: selectedFile.name.replace(/\.[^/.]+$/, ''), // Remove extension
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

      // Refresh file list
      fetchFiles(searchQuery);

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (file: FileMetadata) => {
    if (!isUnlocked || !vaultKey) {
      alert('Please unlock your vault to view files');
      return;
    }

    try {
      // Fetch metadata
      const metaRes = await fetch(`/api/files/${file.id}/meta`);
      if (!metaRes.ok) throw new Error('Failed to fetch file metadata');

      const fileMeta: FileWithMeta = await metaRes.json();

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

      // Create blob from decrypted bytes
      const blob = new Blob([decryptedBytes], { type: fileMeta.mimeType });
      setDecryptedBlob(blob);
      setViewingFile(fileMeta);
    } catch (error: any) {
      console.error('View error:', error);
      alert(error.message || 'Failed to decrypt file');
    }
  };

  const handleDownload = () => {
    if (!decryptedBlob || !viewingFile) return;

    const url = URL.createObjectURL(decryptedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = viewingFile.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      const res = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchFiles(searchQuery);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to delete file');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete file');
    }
  };

  const closeViewer = () => {
    if (decryptedBlob) {
      URL.revokeObjectURL(URL.createObjectURL(decryptedBlob));
    }
    setViewingFile(null);
    setDecryptedBlob(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return ImageIcon;
    return FileText;
  };

  if (userStatus && userStatus !== 'ACTIVE') {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Encrypted Files</h1>
        <div className="p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded">
          Your account is awaiting approval from an admin. You'll be able to upload files once activated.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Encrypted Files</h1>

      {!isUnlocked && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded">
          Unlock your vault to upload and view files.
        </div>
      )}

      {/* Upload & Search Bar */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search files by title or filename..."
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

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={handleFileSelect}
          className="hidden"
          disabled={!isUnlocked || uploading}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!isUnlocked || uploading}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
        >
          <Upload className="w-5 h-5" />
          {uploading ? 'Uploading...' : 'Upload File'}
        </button>
      </div>

      {/* File List */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading files...</p>
        </div>
      )}

      {!loading && files.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No files yet</h3>
          <p className="text-gray-600">
            {searchQuery
              ? 'No files match your search'
              : 'Upload your first encrypted file to get started'}
          </p>
        </div>
      )}

      {!loading && files.length > 0 && (
        <div className="space-y-3">
          {files.map((file) => {
            const Icon = getFileIcon(file.mimeType);
            return (
              <div
                key={file.id}
                className="bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-6 h-6 text-blue-500 flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {file.title || file.filename}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {file.filename} • {formatFileSize(file.sizeBytes)} •{' '}
                      {new Date(file.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleView(file)}
                      disabled={!isUnlocked}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:text-gray-400"
                      title="View file"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete file"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && decryptedBlob && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold truncate">
                {viewingFile.title || viewingFile.filename}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={closeViewer}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {viewingFile.mimeType === 'application/pdf' ? (
                <iframe
                  src={URL.createObjectURL(decryptedBlob)}
                  className="w-full h-full min-h-[600px] border rounded"
                  title={viewingFile.filename}
                />
              ) : viewingFile.mimeType.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(decryptedBlob)}
                  alt={viewingFile.filename}
                  className="max-w-full mx-auto"
                />
              ) : (
                <p className="text-gray-600">Preview not available for this file type</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
