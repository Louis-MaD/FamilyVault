const sodium = require('libsodium-wrappers-sumo');

// Constants
const KEY_BYTES = 32; // 256-bit
const FILE_DEK_BYTES = 32; // 256-bit for file encryption

export interface DerivedKey {
  key: Uint8Array;
}

export async function generateSalt(): Promise<string> {
  await sodium.ready;
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  return sodium.to_base64(salt);
}

/**
 * Derives a Master Key from User Password + Salt.
 * This runs ONLY on the client.
 */
export async function deriveVaultKey(password: string, saltBase64: string): Promise<DerivedKey> {
  await sodium.ready;
  const salt = sodium.from_base64(saltBase64, sodium.base64_variants.ORIGINAL);
  
  // Argon2id for Key Derivation
  const key = sodium.crypto_pwhash(
    KEY_BYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  return { key };
}

/**
 * 1. Generates a random Data Encryption Key (DEK).
 * 2. Encrypts payload with DEK (XChaCha20-Poly1305).
 * 3. Wraps (encrypts) DEK with Vault Master Key.
 */
export async function encryptVaultItem(
  payload: Record<string, any>,
  vaultKey: DerivedKey
) {
  await sodium.ready;
  
  // 1. Generate DEK
  const dek = sodium.crypto_secretbox_keygen();
  
  // 2. Encrypt Payload with DEK
  const payloadString = JSON.stringify(payload);
  const payloadNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const encryptedPayload = sodium.crypto_secretbox_easy(
    payloadString,
    payloadNonce,
    dek
  );
  
  // 3. Wrap DEK with Vault Key
  const dekNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const wrappedDek = sodium.crypto_secretbox_easy(
    dek,
    dekNonce,
    vaultKey.key
  );
  
  return {
    wrappedItemKey: sodium.to_base64(wrappedDek),
    encryptedPayload: sodium.to_base64(encryptedPayload),
    cryptoMeta: {
      alg: 'xchacha20poly1305',
      dekNonce: sodium.to_base64(dekNonce),
      payloadNonce: sodium.to_base64(payloadNonce)
    }
  };
}

export async function decryptVaultItem(
  wrappedItemKey: string,
  encryptedPayload: string,
  cryptoMeta: any,
  vaultKey: DerivedKey
) {
  await sodium.ready;
  
  // 1. Unwrap DEK
  const dekNonce = sodium.from_base64(cryptoMeta.dekNonce);
  const wrappedDekBytes = sodium.from_base64(wrappedItemKey);
  
  const dek = sodium.crypto_secretbox_open_easy(
    wrappedDekBytes,
    dekNonce,
    vaultKey.key
  );
  
  // 2. Decrypt Payload
  const payloadNonce = sodium.from_base64(cryptoMeta.payloadNonce);
  const payloadBytes = sodium.from_base64(encryptedPayload);
  
  const decryptedBytes = sodium.crypto_secretbox_open_easy(
    payloadBytes,
    payloadNonce,
    dek
  );
  
  return JSON.parse(sodium.to_string(decryptedBytes));
}

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
  if (!nonceB64 || !cipherB64) throw new Error('Invalid encrypted key payload');
  const nonce = sodium.from_base64(nonceB64);
  const cipher = sodium.from_base64(cipherB64);
  return sodium.crypto_secretbox_open_easy(cipher, nonce, vaultKey.key);
}

export async function unwrapItemKeyFromVault(
  wrappedItemKey: string,
  cryptoMeta: any,
  vaultKey: DerivedKey
): Promise<Uint8Array> {
  await sodium.ready;
  const dekNonce = sodium.from_base64(cryptoMeta.dekNonce);
  const wrappedDekBytes = sodium.from_base64(wrappedItemKey);
  return sodium.crypto_secretbox_open_easy(wrappedDekBytes, dekNonce, vaultKey.key);
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

export async function decryptPayloadWithDek(
  encryptedPayload: string,
  cryptoMeta: any,
  dek: Uint8Array
) {
  await sodium.ready;
  const payloadNonce = sodium.from_base64(cryptoMeta.payloadNonce);
  const payloadBytes = sodium.from_base64(encryptedPayload);
  const decryptedBytes = sodium.crypto_secretbox_open_easy(
    payloadBytes,
    payloadNonce,
    dek
  );
  return JSON.parse(sodium.to_string(decryptedBytes));
}

// ============================================================================
// File Encryption/Decryption
// ============================================================================

/**
 * Encrypt file bytes with XChaCha20-Poly1305
 * Returns: encrypted bytes + wrapped file key + crypto metadata
 */
export async function encryptFile(
  fileBytes: Uint8Array,
  vaultKey: DerivedKey
) {
  await sodium.ready;

  // 1. Generate random File DEK
  const fileDek = sodium.randombytes_buf(FILE_DEK_BYTES);

  // 2. Generate nonce for file encryption
  const fileNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);

  // 3. Encrypt file bytes with File DEK
  const encryptedBytes = sodium.crypto_secretbox_easy(fileBytes, fileNonce, fileDek);

  // 4. Wrap File DEK with vault key
  const dekNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const wrappedFileDek = sodium.crypto_secretbox_easy(fileDek, dekNonce, vaultKey.key);

  return {
    encryptedBytes, // Uint8Array of encrypted file
    wrappedFileKey: sodium.to_base64(wrappedFileDek),
    cryptoMeta: {
      alg: 'xchacha20poly1305',
      fileNonce: sodium.to_base64(fileNonce),
      dekNonce: sodium.to_base64(dekNonce),
    },
  };
}

/**
 * Decrypt file bytes
 * Takes: encrypted bytes + wrapped file key + crypto metadata + vault key
 * Returns: decrypted file bytes
 */
export async function decryptFile(
  encryptedBytes: Uint8Array,
  wrappedFileKey: string,
  cryptoMeta: any,
  vaultKey: DerivedKey
): Promise<ArrayBuffer> {
  await sodium.ready;

  // 1. Unwrap File DEK using vault key
  const wrappedFileDekBytes = sodium.from_base64(wrappedFileKey);
  const dekNonce = sodium.from_base64(cryptoMeta.dekNonce);
  const fileDek = sodium.crypto_secretbox_open_easy(
    wrappedFileDekBytes,
    dekNonce,
    vaultKey.key
  );

  // 2. Decrypt file bytes with File DEK
  const fileNonce = sodium.from_base64(cryptoMeta.fileNonce);
  const decryptedBytes = sodium.crypto_secretbox_open_easy(
    encryptedBytes,
    fileNonce,
    fileDek
  );

  // Return as ArrayBuffer for Blob compatibility
  return new Uint8Array(decryptedBytes).buffer;
}
