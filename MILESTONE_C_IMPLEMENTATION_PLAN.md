# Milestone C Implementation - Critical Components

## Status: Schema & Signup Complete ✅

### Completed:
1. ✅ Added UserRole enum (ADMIN, MEMBER)
2. ✅ Added UserStatus enum (ACTIVE, PENDING, DISABLED)
3. ✅ Added publicKey and encryptedPrivateKey to User
4. ✅ Created ShareGrant model
5. ✅ Migration applied: `20251230120320_add_membership_and_sharing`
6. ✅ Updated signup: first user = ADMIN+ACTIVE, rest = MEMBER+PENDING

### Remaining Implementation (Due to Context):

This is a LARGE milestone. Given time constraints, here's what needs to be completed:

## Critical APIs (Create these next):

### 1. Admin APIs (`/api/admin/*`)
- GET `/api/admin/members` - List all members
- POST `/api/admin/members/:id/approve` - Set status=ACTIVE, audit MEMBER_APPROVED
- POST `/api/admin/members/:id/disable` - Set status=DISABLED, audit MEMBER_DISABLED

### 2. Keys API (`/api/keys/me`)
- GET - Return publicKey
- POST - Accept {publicKey, encryptedPrivateKey}, reject if already set

### 3. Grants API (`/api/grants`)
- GET - Return active grants for recipient (not expired, not revoked)
- POST `/api/grants/:id/revoke` - Set revokedAt, owner only
- POST `/api/grants/:id/viewed` - Audit event (optional)

### 4. Update Approve Endpoint
**File**: `app/api/requests/[id]/approve/route.ts`

Add parameter: `wrappedItemKeyForRecipient` (required)

On approve:
```typescript
// Create ShareGrant
await prisma.shareGrant.create({
  data: {
    itemId: request.itemId,
    fromUserId: request.ownerUserId,
    toUserId: request.requesterUserId,
    requestId: request.id,
    wrappedItemKeyForRecipient: body.wrappedItemKeyForRecipient,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  },
});
```

## Status Enforcement

Add to ALL endpoints that access family features:
```typescript
const session = await getSession();
const user = await prisma.user.findUnique({
  where: { id: session.userId },
  select: { status: true },
});

if (user?.status !== 'ACTIVE') {
  return NextResponse.json(
    { error: 'Account pending approval or disabled' },
    { status: 403 }
  );
}
```

**Endpoints to protect**:
- `/api/family/items`
- `/api/requests` (all)
- `/api/grants` (all)

## Client Crypto Updates

**File**: `lib/crypto.client.ts`

Add keypair functions:
```typescript
export async function generateKeyPair() {
  await sodium.ready;
  const keypair = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(keypair.publicKey),
    privateKey: keypair.privateKey,
  };
}

export async function encryptPrivateKey(
  privateKey: Uint8Array,
  vaultKey: DerivedKey
): Promise<string> {
  await sodium.ready;
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const encrypted = sodium.crypto_secretbox_easy(privateKey, nonce, vaultKey.key);
  return `${sodium.to_base64(nonce)}:${sodium.to_base64(encrypted)}`;
}

export async function decryptPrivateKey(
  encryptedData: string,
  vaultKey: DerivedKey
): Promise<Uint8Array> {
  await sodium.ready;
  const [nonceB64, cipherB64] = encryptedData.split(':');
  const nonce = sodium.from_base64(nonceB64);
  const cipher = sodium.from_base64(cipherB64);
  return sodium.crypto_secretbox_open_easy(cipher, nonce, vaultKey.key);
}

export async function wrapItemKeyForRecipient(
  itemDek: Uint8Array,
  recipientPublicKey: string
): Promise<string> {
  await sodium.ready;
  const pubKey = sodium.from_base64(recipientPublicKey);
  const sealed = sodium.crypto_box_seal(itemDek, pubKey);
  return sodium.to_base64(sealed);
}

export async function unwrapItemKeyFromGrant(
  wrappedKey: string,
  publicKey: string,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  await sodium.ready;
  const sealed = sodium.from_base64(wrappedKey);
  const pubKeyBytes = sodium.from_base64(publicKey);
  return sodium.crypto_box_seal_open(sealed, pubKeyBytes, privateKey);
}
```

## UI Components

### 1. Admin UI (`/admin/family`)
Show table of users with Approve/Disable buttons

### 2. Pending User Page
Show "Awaiting admin approval" message for PENDING users

### 3. Shared Page (`/shared`)
- Fetch grants from `/api/grants`
- Decrypt locally using unwrapItemKeyFromGrant
- Display decrypted secrets

### 4. Update Approve Button
In `/requests` page, when approving:
1. Fetch requester's public key
2. Unwrap item DEK locally
3. Wrap DEK for requester using their public key
4. Send wrapped key to approve endpoint

## Tests Required

1. Admin-only approve/disable
2. PENDING users blocked from family features
3. Only owner can create grant
4. Only recipient can list their grants
5. Expired/revoked grants filtered
6. Request-grant relationship

## Security Notes
- ✅ Server NEVER decrypts secrets
- ✅ All decryption happens client-side
- ✅ Plaintext secrets NEVER logged
- ✅ Private keys encrypted with vault key
- ✅ Item DEKs wrapped with public key crypto

## Quick Start After Resume

1. Create admin APIs
2. Add status checks to existing endpoints
3. Create keys API
4. Update approve endpoint
5. Create grants APIs
6. Update client crypto
7. Create UI components
8. Add tests

---

**Current State**: Database schema ready, first-user logic implemented.
**Next Step**: Create admin member management APIs.
