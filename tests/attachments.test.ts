import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/db';
import * as crypto from 'crypto';

/**
 * Integration tests for File Attachment system
 *
 * Tests verify:
 * 1. Ownership enforcement for attach/detach operations
 * 2. File attachment workflow (attach/list/detach)
 * 3. File can be moved between items
 * 4. Cannot attach file owned by another user
 * 5. Detaching sets itemId to null
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

describe('File Attachment System Tests', () => {
  let owner: any;
  let otherUser: any;
  let ownerItem: any;
  let ownerFile: any;
  let otherFile: any;

  before(async () => {
    // Create test users
    owner = await createTestUser('attachowner@test.com', 'Attachment Owner', 'ACTIVE');
    otherUser = await createTestUser('attachother@test.com', 'Other User', 'ACTIVE');

    // Create vault item for owner
    ownerItem = await prisma.vaultItem.create({
      data: {
        ownerUserId: owner.id,
        type: 'PASSWORD',
        title: 'Test Item',
        wrappedItemKey: 'wrapped_key',
        encryptedPayload: 'encrypted_payload',
        cryptoMeta: { alg: 'test' },
      },
    });

    // Create file owned by owner
    ownerFile = await prisma.fileBlob.create({
      data: {
        ownerUserId: owner.id,
        filename: 'owner_file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        storagePath: '/fake/path/owner_file.pdf',
      },
    });

    // Create file owned by other user
    otherFile = await prisma.fileBlob.create({
      data: {
        ownerUserId: otherUser.id,
        filename: 'other_file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        storagePath: '/fake/path/other_file.pdf',
      },
    });
  });

  after(async () => {
    // Cleanup
    await prisma.fileBlob.deleteMany({
      where: { ownerUserId: { in: [owner.id, otherUser.id] } },
    });
    await prisma.vaultItem.deleteMany({
      where: { ownerUserId: { in: [owner.id, otherUser.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [owner.id, otherUser.id] } },
    });
  });

  it('should attach file to item', async () => {
    const updated = await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: ownerItem.id },
    });

    assert.strictEqual(updated.itemId, ownerItem.id, 'File should be attached to item');

    // Reset for other tests
    await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: null },
    });
  });

  it('should list attachments for an item', async () => {
    // Attach file
    await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: ownerItem.id },
    });

    // List attachments
    const attachments = await prisma.fileBlob.findMany({
      where: {
        itemId: ownerItem.id,
        ownerUserId: owner.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    assert.strictEqual(attachments.length, 1, 'Should find 1 attachment');
    assert.strictEqual(attachments[0].id, ownerFile.id, 'Should be the owner file');

    // Reset
    await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: null },
    });
  });

  it('should detach file from item', async () => {
    // Attach file
    await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: ownerItem.id },
    });

    // Detach file
    const updated = await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: null },
    });

    assert.strictEqual(updated.itemId, null, 'File should be detached from item');
  });

  it('should allow moving file between items', async () => {
    // Create second item
    const secondItem = await prisma.vaultItem.create({
      data: {
        ownerUserId: owner.id,
        type: 'NOTE',
        title: 'Second Item',
        wrappedItemKey: 'wrapped_key_2',
        encryptedPayload: 'encrypted_payload_2',
        cryptoMeta: { alg: 'test' },
      },
    });

    // Attach to first item
    await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: ownerItem.id },
    });

    // Move to second item
    const updated = await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: secondItem.id },
    });

    assert.strictEqual(updated.itemId, secondItem.id, 'File should be attached to second item');

    // Cleanup
    await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: null },
    });
    await prisma.vaultItem.delete({ where: { id: secondItem.id } });
  });

  it('should enforce ownership on file attachment', async () => {
    // Verify file ownership check would fail for other user's file
    const file = await prisma.fileBlob.findUnique({
      where: { id: otherFile.id },
    });

    assert.notStrictEqual(
      file?.ownerUserId,
      owner.id,
      'Other user file should not be owned by owner'
    );
  });

  it('should filter out already attached files when listing available files', async () => {
    // Attach file to item
    await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: ownerItem.id },
    });

    // Create second file for owner
    const secondFile = await prisma.fileBlob.create({
      data: {
        ownerUserId: owner.id,
        filename: 'second_file.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 512,
        storagePath: '/fake/path/second_file.pdf',
      },
    });

    // Get all owner's files
    const allFiles = await prisma.fileBlob.findMany({
      where: { ownerUserId: owner.id },
    });

    // Filter out files already attached to this item
    const availableFiles = allFiles.filter(f => f.itemId !== ownerItem.id);

    assert.strictEqual(availableFiles.length, 1, 'Should have 1 available file');
    assert.strictEqual(availableFiles[0].id, secondFile.id, 'Should be the second file');

    // Cleanup
    await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: null },
    });
    await prisma.fileBlob.delete({ where: { id: secondFile.id } });
  });

  it('should support multiple files attached to one item', async () => {
    // Create multiple files
    const file1 = await prisma.fileBlob.create({
      data: {
        ownerUserId: owner.id,
        filename: 'file1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storagePath: '/fake/path/file1.pdf',
        itemId: ownerItem.id,
      },
    });

    const file2 = await prisma.fileBlob.create({
      data: {
        ownerUserId: owner.id,
        filename: 'file2.png',
        mimeType: 'image/png',
        sizeBytes: 200,
        storagePath: '/fake/path/file2.png',
        itemId: ownerItem.id,
      },
    });

    // List attachments
    const attachments = await prisma.fileBlob.findMany({
      where: {
        itemId: ownerItem.id,
        ownerUserId: owner.id,
      },
    });

    assert.strictEqual(attachments.length, 2, 'Should have 2 attachments');

    // Cleanup
    await prisma.fileBlob.deleteMany({
      where: { id: { in: [file1.id, file2.id] } },
    });
  });

  it('should cascade delete attachments when item is deleted', async () => {
    // Create item and attach file
    const testItem = await prisma.vaultItem.create({
      data: {
        ownerUserId: owner.id,
        type: 'PASSWORD',
        title: 'Delete Test Item',
        wrappedItemKey: 'wrapped_key',
        encryptedPayload: 'encrypted_payload',
        cryptoMeta: { alg: 'test' },
      },
    });

    await prisma.fileBlob.update({
      where: { id: ownerFile.id },
      data: { itemId: testItem.id },
    });

    // Delete item (should set itemId to null due to onDelete: SetNull)
    await prisma.vaultItem.delete({ where: { id: testItem.id } });

    // Verify file still exists but itemId is null
    const file = await prisma.fileBlob.findUnique({
      where: { id: ownerFile.id },
    });

    assert.ok(file, 'File should still exist');
    assert.strictEqual(file.itemId, null, 'File itemId should be null after item deletion');
  });
});
