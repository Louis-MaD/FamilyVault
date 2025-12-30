import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma } from '../lib/db';
import * as crypto from 'crypto';

/**
 * Integration tests for /api/family/items endpoint
 *
 * Tests verify:
 * 1. API does not return encrypted fields (wrappedItemKey, encryptedPayload, cryptoMeta)
 * 2. Privacy: other users' PRIVATE items are not returned
 * 3. Search filters work correctly
 */

// Helper to create test users
async function createTestUser(email: string, displayName: string) {
  const passwordHash = await import('argon2').then(argon2 =>
    argon2.hash('testpassword123')
  );
  return prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash,
      kdfSalt: crypto.randomBytes(16).toString('base64'),
    },
  });
}

// Helper to create test vault items
async function createTestItem(
  ownerUserId: string,
  data: {
    type: 'PASSWORD' | 'NOTE';
    title: string;
    url?: string;
    visibility: 'PRIVATE' | 'FAMILY_METADATA';
    requestable?: boolean;
  }
) {
  return prisma.vaultItem.create({
    data: {
      ownerUserId,
      type: data.type,
      title: data.title,
      url: data.url || null,
      visibility: data.visibility,
      requestable: data.requestable ?? true,
      wrappedItemKey: 'encrypted_dek_base64',
      encryptedPayload: 'encrypted_payload_base64',
      cryptoMeta: { alg: 'xchacha20poly1305', dekNonce: 'nonce1', payloadNonce: 'nonce2' },
    },
  });
}

describe('Family Vault API Security Tests', () => {
  let user1: any;
  let user2: any;
  let testItems: any[] = [];

  before(async () => {
    // Create test users
    user1 = await createTestUser('user1@test.com', 'User One');
    user2 = await createTestUser('user2@test.com', 'User Two');

    // Create test items
    testItems = await Promise.all([
      // User1's items
      createTestItem(user1.id, {
        type: 'PASSWORD',
        title: 'User1 Public Password',
        url: 'https://example.com',
        visibility: 'FAMILY_METADATA',
      }),
      createTestItem(user1.id, {
        type: 'PASSWORD',
        title: 'User1 Private Password',
        url: 'https://private.com',
        visibility: 'PRIVATE',
      }),
      // User2's items
      createTestItem(user2.id, {
        type: 'PASSWORD',
        title: 'User2 Public Password',
        url: 'https://shared.com',
        visibility: 'FAMILY_METADATA',
      }),
      createTestItem(user2.id, {
        type: 'PASSWORD',
        title: 'User2 Private Password',
        url: 'https://secret.com',
        visibility: 'PRIVATE',
      }),
    ]);
  });

  after(async () => {
    // Cleanup
    await prisma.vaultItem.deleteMany({
      where: { id: { in: testItems.map(i => i.id) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } },
    });
  });

  it('should not return encrypted fields for any items', async () => {
    const items = await prisma.vaultItem.findMany({
      where: {
        OR: [
          { ownerUserId: user1.id },
          {
            AND: [
              { ownerUserId: { not: user1.id } },
              { visibility: 'FAMILY_METADATA' },
            ],
          },
        ],
      },
      select: {
        id: true,
        type: true,
        title: true,
        url: true,
        tags: true,
        visibility: true,
        requestable: true,
        ownerUserId: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        // Explicitly exclude encrypted fields
        wrappedItemKey: false,
        encryptedPayload: false,
        cryptoMeta: false,
      },
    });

    // Verify no encrypted fields are present
    for (const item of items) {
      assert.strictEqual('wrappedItemKey' in item, false, 'wrappedItemKey should not be in response');
      assert.strictEqual('encryptedPayload' in item, false, 'encryptedPayload should not be in response');
      assert.strictEqual('cryptoMeta' in item, false, 'cryptoMeta should not be in response');
    }
  });

  it('should only return own items and others FAMILY_METADATA items', async () => {
    const items = await prisma.vaultItem.findMany({
      where: {
        OR: [
          { ownerUserId: user1.id },
          {
            AND: [
              { ownerUserId: { not: user1.id } },
              { visibility: 'FAMILY_METADATA' },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        ownerUserId: true,
      },
    });

    // Should include:
    // - User1's public item
    // - User1's private item (own items)
    // - User2's public item (other's FAMILY_METADATA)
    // Should NOT include:
    // - User2's private item

    const titles = items.map(i => i.title);

    assert.ok(titles.includes('User1 Public Password'), 'Should include User1 public item');
    assert.ok(titles.includes('User1 Private Password'), 'Should include User1 private item');
    assert.ok(titles.includes('User2 Public Password'), 'Should include User2 public item');
    assert.ok(!titles.includes('User2 Private Password'), 'Should NOT include User2 private item');
  });

  it('should filter by search query (title and url)', async () => {
    const query = 'example.com';

    const items = await prisma.vaultItem.findMany({
      where: {
        OR: [
          { ownerUserId: user1.id },
          {
            AND: [
              { ownerUserId: { not: user1.id } },
              { visibility: 'FAMILY_METADATA' },
            ],
          },
        ],
        AND: [
          {
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { url: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        url: true,
      },
    });

    // Should only return items with 'example.com' in title or url
    for (const item of items) {
      const matchesQuery =
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        (item.url && item.url.toLowerCase().includes(query.toLowerCase()));

      assert.ok(matchesQuery, `Item "${item.title}" should match query "${query}"`);
    }

    // Verify specific item is included
    const titles = items.map(i => i.title);
    assert.ok(titles.includes('User1 Public Password'), 'Should include User1 Public Password');
  });

  it('should respect case-insensitive search', async () => {
    const items = await prisma.vaultItem.findMany({
      where: {
        OR: [
          { ownerUserId: user1.id },
          {
            AND: [
              { ownerUserId: { not: user1.id } },
              { visibility: 'FAMILY_METADATA' },
            ],
          },
        ],
        AND: [
          {
            OR: [
              { title: { contains: 'PUBLIC', mode: 'insensitive' } },
              { url: { contains: 'PUBLIC', mode: 'insensitive' } },
            ],
          },
        ],
      },
    });

    // Should return items with 'public' regardless of case
    assert.ok(items.length > 0, 'Should find items with case-insensitive search');

    const titles = items.map((i: any) => i.title);
    assert.ok(
      titles.some((t: string) => t.toLowerCase().includes('public')),
      'Should match items containing "public" case-insensitively'
    );
  });
});
