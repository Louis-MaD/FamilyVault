import sodium from 'libsodium-wrappers';

// Constants
const KEY_BYTES = 32; // 256-bit

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
  const salt = sodium.from_base64(saltBase64);
  
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