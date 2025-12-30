import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as crypto from 'crypto';
import { prisma } from '../lib/db';
import { AccessDeniedError, requireAdminUser } from '../lib/authz';
import { listFamilyItemsForUser } from '../lib/family';
import { createAccessRequestForUser } from '../lib/requests';
import { listActiveGrantsForUser, revokeGrantForUser } from '../lib/grants';

async function createTestUser(params: {
  email: string;
  role?: 'ADMIN' | 'MEMBER';
  status?: 'ACTIVE' | 'PENDING' | 'DISABLED';
}) {
  const passwordHash = await import('argon2').then(argon2 =>
    argon2.hash('testpassword123')
  );
  return prisma.user.create({
    data: {
      email: params.email,
      displayName: params.email.split('@')[0],
      passwordHash,
      kdfSalt: crypto.randomBytes(16).toString('base64'),
      role: params.role ?? 'MEMBER',
      status: params.status ?? 'ACTIVE',
    },
  });
}

async function createTestItem(ownerUserId: string, title: string) {
  return prisma.vaultItem.create({
    data: {
      ownerUserId,
      type: 'PASSWORD',
      title,
      visibility: 'FAMILY_METADATA',
      requestable: true,
      wrappedItemKey: 'encrypted_dek_base64',
      encryptedPayload: 'encrypted_payload_base64',
      cryptoMeta: { alg: 'xchacha20poly1305', dekNonce: 'nonce1', payloadNonce: 'nonce2' },
    },
  });
}

describe('Membership and Grants Enforcement Tests', () => {
  const userIds: string[] = [];
  const itemIds: string[] = [];
  const requestIds: string[] = [];
  const grantIds: string[] = [];

  let admin: any;
  let owner: any;
  let activeMember: any;
  let pendingMember: any;
  let item: any;

  before(async () => {
    admin = await createTestUser({ email: 'admin@test.com', role: 'ADMIN', status: 'ACTIVE' });
    owner = await createTestUser({ email: 'owner@test.com', status: 'ACTIVE' });
    activeMember = await createTestUser({ email: 'active@test.com', status: 'ACTIVE' });
    pendingMember = await createTestUser({ email: 'pending@test.com', status: 'PENDING' });

    userIds.push(admin.id, owner.id, activeMember.id, pendingMember.id);

    item = await createTestItem(owner.id, 'Shared Item');
    itemIds.push(item.id);
  });

  after(async () => {
    await prisma.shareGrant.deleteMany({ where: { id: { in: grantIds } } });
    await prisma.accessRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.vaultItem.deleteMany({ where: { id: { in: itemIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('blocks pending users from listing family items', async () => {
    await assert.rejects(
      () => listFamilyItemsForUser(pendingMember.id),
      (error: any) => error instanceof AccessDeniedError && error.statusCode === 403
    );
  });

  it('blocks pending users from creating access requests', async () => {
    await assert.rejects(
      () => createAccessRequestForUser(pendingMember.id, item.id, 'Need access'),
      (error: any) => error instanceof AccessDeniedError && error.statusCode === 403
    );
  });

  it('blocks pending users from listing grants', async () => {
    const grant = await prisma.shareGrant.create({
      data: {
        itemId: item.id,
        fromUserId: owner.id,
        toUserId: pendingMember.id,
        wrappedItemKeyForRecipient: 'wrapped_key_base64',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    grantIds.push(grant.id);

    await assert.rejects(
      () => listActiveGrantsForUser(pendingMember.id),
      (error: any) => error instanceof AccessDeniedError && error.statusCode === 403
    );
  });

  it('requires admin role for admin actions', async () => {
    const adminUser = await requireAdminUser(admin.id);
    assert.strictEqual(adminUser.role, 'ADMIN');

    await assert.rejects(
      () => requireAdminUser(activeMember.id),
      (error: any) => error instanceof AccessDeniedError && error.statusCode === 403
    );
  });

  it('filters expired grants and only returns grants for the recipient', async () => {
    const activeGrant = await prisma.shareGrant.create({
      data: {
        itemId: item.id,
        fromUserId: owner.id,
        toUserId: activeMember.id,
        wrappedItemKeyForRecipient: 'active_wrapped_key',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const expiredGrant = await prisma.shareGrant.create({
      data: {
        itemId: item.id,
        fromUserId: owner.id,
        toUserId: activeMember.id,
        wrappedItemKeyForRecipient: 'expired_wrapped_key',
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    grantIds.push(activeGrant.id, expiredGrant.id);

    const grantsForRecipient = await listActiveGrantsForUser(activeMember.id);
    assert.ok(grantsForRecipient.some(g => g.id === activeGrant.id));
    assert.ok(!grantsForRecipient.some(g => g.id === expiredGrant.id));

    const grantsForOwner = await listActiveGrantsForUser(owner.id);
    assert.strictEqual(grantsForOwner.length, 0);
  });

  it('only allows the owner to revoke a grant', async () => {
    const grant = await prisma.shareGrant.create({
      data: {
        itemId: item.id,
        fromUserId: owner.id,
        toUserId: activeMember.id,
        wrappedItemKeyForRecipient: 'revoke_wrapped_key',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    grantIds.push(grant.id);

    await assert.rejects(
      () => revokeGrantForUser(grant.id, activeMember.id),
      (error: any) => error instanceof AccessDeniedError && error.statusCode === 403
    );

    const updated = await revokeGrantForUser(grant.id, owner.id);
    assert.ok(updated.revokedAt);
  });

  it('enforces unique requestId for grants', async () => {
    const request = await prisma.accessRequest.create({
      data: {
        itemId: item.id,
        requesterUserId: activeMember.id,
        ownerUserId: owner.id,
        status: 'PENDING',
      },
    });
    requestIds.push(request.id);

    const firstGrant = await prisma.shareGrant.create({
      data: {
        itemId: item.id,
        fromUserId: owner.id,
        toUserId: activeMember.id,
        requestId: request.id,
        wrappedItemKeyForRecipient: 'grant_key_1',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    grantIds.push(firstGrant.id);

    try {
      await prisma.shareGrant.create({
        data: {
          itemId: item.id,
          fromUserId: owner.id,
          toUserId: activeMember.id,
          requestId: request.id,
          wrappedItemKeyForRecipient: 'grant_key_2',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      assert.fail('Should not allow duplicate requestId grants');
    } catch (error: any) {
      assert.strictEqual(error.code, 'P2002');
    }
  });

  it('does not expose decrypted payloads in grant listings', async () => {
    const grant = await prisma.shareGrant.create({
      data: {
        itemId: item.id,
        fromUserId: owner.id,
        toUserId: activeMember.id,
        wrappedItemKeyForRecipient: 'secret_wrapped_key',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    grantIds.push(grant.id);

    const grants = await listActiveGrantsForUser(activeMember.id);
    const matched = grants.find(g => g.id === grant.id);
    assert.ok(matched);
    assert.strictEqual(typeof matched?.item.encryptedPayload, 'string');
    assert.strictEqual('decryptedData' in (matched?.item || {}), false);
  });
});
