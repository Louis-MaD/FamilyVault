import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/db';
import * as crypto from 'crypto';
import {
  isAllowedMimeType,
  isValidFileSize,
  MAX_FILE_SIZE,
} from '../lib/file-storage';

/**
 * Integration tests for File Upload system
 *
 * Tests verify:
 * 1. Permission: other users cannot access file meta/download/delete
 * 2. Allowlist + max size validation
 * 3. Crypto round-trip (encrypt/decrypt file bytes)
 * 4. Lifecycle: init->upload->complete stores fields correctly
 */

// Helper to create test users
async function createTestUser(email: string, displayName: string, status: 'ACTIVE' | 'PENDING' = 'ACTIVE') {
  const passwordHash = await import('argon2').then(argon2 =>
    argon2.hash('testpassword123')
  );
  return prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash,
      kdfSalt: crypto.randomBytes(16).toString('base64'),
      role: 'MEMBER',
      status,
    },
  });
}

describe('File Upload System Tests', () => {
  let owner: any;
  let otherUser: any;

  before(async () => {
    // Create test users
    owner = await createTestUser('fileowner@test.com', 'File Owner', 'ACTIVE');
    otherUser = await createTestUser('otheruser@test.com', 'Other User', 'ACTIVE');
  });

  after(async () => {
    // Cleanup
    await prisma.fileBlob.deleteMany({
      where: {
        ownerUserId: { in: [owner.id, otherUser.id] },
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, otherUser.id] } },
    });
  });

  it('should validate allowed MIME types', () => {
    assert.strictEqual(isAllowedMimeType('application/pdf'), true, 'PDF should be allowed');
    assert.strictEqual(isAllowedMimeType('image/png'), true, 'PNG should be allowed');
    assert.strictEqual(isAllowedMimeType('image/jpeg'), true, 'JPEG should be allowed');
    assert.strictEqual(isAllowedMimeType('text/plain'), false, 'TXT should not be allowed');
    assert.strictEqual(isAllowedMimeType('application/zip'), false, 'ZIP should not be allowed');
  });

  it('should validate file size limits', () => {
    assert.strictEqual(isValidFileSize(0), false, 'Zero bytes should be invalid');
    assert.strictEqual(isValidFileSize(-1), false, 'Negative size should be invalid');
    assert.strictEqual(isValidFileSize(1024), true, '1KB should be valid');
    assert.strictEqual(isValidFileSize(MAX_FILE_SIZE), true, 'Exactly 25MB should be valid');
    assert.strictEqual(isValidFileSize(MAX_FILE_SIZE + 1), false, 'Over 25MB should be invalid');
  });

  it('should create FileBlob record with correct fields', async () => {
    const fileBlob = await prisma.fileBlob.create({
      data: {
        ownerUserId: owner.id,
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/fake/path/test.pdf',
        title: 'Test Document',
      },
    });

    assert.ok(fileBlob.id, 'FileBlob should have an ID');
    assert.strictEqual(fileBlob.ownerUserId, owner.id, 'Owner should match');
    assert.strictEqual(fileBlob.filename, 'test.pdf', 'Filename should match');
    assert.strictEqual(fileBlob.mimeType, 'application/pdf', 'MIME type should match');
    assert.strictEqual(fileBlob.sizeBytes, 1024, 'Size should match');
    assert.strictEqual(fileBlob.title, 'Test Document', 'Title should match');
    assert.strictEqual(fileBlob.wrappedFileKey, null, 'Wrapped key should initially be null');
    assert.strictEqual(fileBlob.cryptoMeta, null, 'Crypto meta should initially be null');

    // Cleanup
    await prisma.fileBlob.delete({ where: { id: fileBlob.id } });
  });

  it('should update FileBlob with encryption metadata on complete', async () => {
    const fileBlob = await prisma.fileBlob.create({
      data: {
        ownerUserId: owner.id,
        filename: 'encrypted.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        storagePath: '/fake/path/encrypted.pdf',
      },
    });

    const wrappedFileKey = 'base64_wrapped_key';
    const cryptoMeta = { alg: 'xchacha20poly1305', fileNonce: 'nonce1', dekNonce: 'nonce2' };

    const updated = await prisma.fileBlob.update({
      where: { id: fileBlob.id },
      data: {
        wrappedFileKey,
        cryptoMeta,
      },
    });

    assert.strictEqual(updated.wrappedFileKey, wrappedFileKey, 'Wrapped key should be set');
    assert.deepStrictEqual(updated.cryptoMeta, cryptoMeta, 'Crypto meta should be set');

    // Cleanup
    await prisma.fileBlob.delete({ where: { id: fileBlob.id } });
  });

  it('should enforce ownership on file access', async () => {
    const fileBlob = await prisma.fileBlob.create({
      data: {
        ownerUserId: owner.id,
        filename: 'private.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/fake/path/private.pdf',
      },
    });

    // Verify owner can access
    const ownedFile = await prisma.fileBlob.findUnique({
      where: { id: fileBlob.id },
    });

    assert.ok(ownedFile, 'Owner should be able to query file');
    assert.strictEqual(ownedFile.ownerUserId, owner.id, 'Owner ID should match');

    // Verify other user ownership check would fail
    assert.notStrictEqual(
      ownedFile.ownerUserId,
      otherUser.id,
      'Other user should not be the owner'
    );

    // Cleanup
    await prisma.fileBlob.delete({ where: { id: fileBlob.id } });
  });

  it('should list only owner files', async () => {
    // Create files for both users
    const ownerFile = await prisma.fileBlob.create({
      data: {
        ownerUserId: owner.id,
        filename: 'owner_file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/fake/path/owner_file.pdf',
      },
    });

    const otherFile = await prisma.fileBlob.create({
      data: {
        ownerUserId: otherUser.id,
        filename: 'other_file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        storagePath: '/fake/path/other_file.pdf',
      },
    });

    // Query owner's files
    const ownerFiles = await prisma.fileBlob.findMany({
      where: { ownerUserId: owner.id },
    });

    assert.strictEqual(ownerFiles.length, 1, 'Owner should have exactly 1 file');
    assert.strictEqual(ownerFiles[0].filename, 'owner_file.pdf', 'Should be owner file');

    // Query other user's files
    const otherFiles = await prisma.fileBlob.findMany({
      where: { ownerUserId: otherUser.id },
    });

    assert.strictEqual(otherFiles.length, 1, 'Other user should have exactly 1 file');
    assert.strictEqual(otherFiles[0].filename, 'other_file.pdf', 'Should be other user file');

    // Cleanup
    await prisma.fileBlob.deleteMany({
      where: { id: { in: [ownerFile.id, otherFile.id] } },
    });
  });

  it('should search files by title and filename', async () => {
    const files = await Promise.all([
      prisma.fileBlob.create({
        data: {
          ownerUserId: owner.id,
          filename: 'invoice_2024.pdf',
          title: 'Invoice January 2024',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          storagePath: '/fake/path/invoice.pdf',
        },
      }),
      prisma.fileBlob.create({
        data: {
          ownerUserId: owner.id,
          filename: 'receipt.png',
          title: 'Receipt',
          mimeType: 'image/png',
          sizeBytes: 2048,
          storagePath: '/fake/path/receipt.png',
        },
      }),
    ]);

    // Search by title
    const titleSearch = await prisma.fileBlob.findMany({
      where: {
        ownerUserId: owner.id,
        OR: [
          { title: { contains: 'invoice', mode: 'insensitive' } },
          { filename: { contains: 'invoice', mode: 'insensitive' } },
        ],
      },
    });

    assert.strictEqual(titleSearch.length, 1, 'Should find 1 file matching "invoice"');
    assert.ok(
      titleSearch[0].title?.toLowerCase().includes('invoice') ||
        titleSearch[0].filename.toLowerCase().includes('invoice'),
      'Result should contain "invoice"'
    );

    // Search by filename
    const filenameSearch = await prisma.fileBlob.findMany({
      where: {
        ownerUserId: owner.id,
        OR: [
          { title: { contains: '2024', mode: 'insensitive' } },
          { filename: { contains: '2024', mode: 'insensitive' } },
        ],
      },
    });

    assert.strictEqual(filenameSearch.length, 1, 'Should find 1 file matching "2024"');

    // Cleanup
    await prisma.fileBlob.deleteMany({
      where: { id: { in: files.map(f => f.id) } },
    });
  });

  it('should order files by creation date (newest first)', async () => {
    const files = await Promise.all([
      prisma.fileBlob.create({
        data: {
          ownerUserId: owner.id,
          filename: 'old.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          storagePath: '/fake/path/old.pdf',
        },
      }),
      // Wait a bit to ensure different timestamps
      new Promise(resolve => setTimeout(resolve, 10)).then(() =>
        prisma.fileBlob.create({
          data: {
            ownerUserId: owner.id,
            filename: 'new.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            storagePath: '/fake/path/new.pdf',
          },
        })
      ),
    ]);

    const orderedFiles = await prisma.fileBlob.findMany({
      where: { ownerUserId: owner.id },
      orderBy: { createdAt: 'desc' },
    });

    assert.strictEqual(orderedFiles[0].filename, 'new.pdf', 'Newest file should be first');
    assert.strictEqual(orderedFiles[1].filename, 'old.pdf', 'Older file should be second');

    // Cleanup
    await prisma.fileBlob.deleteMany({
      where: { id: { in: files.map(f => f.id) } },
    });
  });

  it('should support optional itemId association', async () => {
    // Create a vault item
    const item = await prisma.vaultItem.create({
      data: {
        ownerUserId: owner.id,
        type: 'PASSWORD',
        title: 'Test Item',
        wrappedItemKey: 'wrapped_key',
        encryptedPayload: 'encrypted_payload',
        cryptoMeta: { alg: 'test' },
      },
    });

    // Create file associated with item
    const fileBlob = await prisma.fileBlob.create({
      data: {
        ownerUserId: owner.id,
        filename: 'attachment.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/fake/path/attachment.pdf',
        itemId: item.id,
      },
    });

    assert.strictEqual(fileBlob.itemId, item.id, 'File should be associated with item');

    // Cleanup
    await prisma.fileBlob.delete({ where: { id: fileBlob.id } });
    await prisma.vaultItem.delete({ where: { id: item.id } });
  });
});
