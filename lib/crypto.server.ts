import sodium from 'libsodium-wrappers';

const SERVER_KEY_HEX = process.env.SERVER_ENCRYPTION_KEY || '';
const ready = sodium.ready;

export async function encryptServerSecret(plaintext: string): Promise<string> {
  await ready;
  if (!SERVER_KEY_HEX || SERVER_KEY_HEX.length !== 64) throw new Error('Invalid SERVER_ENCRYPTION_KEY');
  
  const key = sodium.from_hex(SERVER_KEY_HEX);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const message = sodium.from_string(plaintext);
  
  const ciphertext = sodium.crypto_secretbox_easy(message, nonce, key);
  
  return `${sodium.to_hex(nonce)}:${sodium.to_hex(ciphertext)}`;
}

export async function decryptServerSecret(payload: string): Promise<string> {
  await ready;
  const key = sodium.from_hex(SERVER_KEY_HEX);
  const [nonceHex, cipherHex] = payload.split(':');
  
  if (!nonceHex || !cipherHex) throw new Error('Invalid payload format');
  
  const nonce = sodium.from_hex(nonceHex);
  const ciphertext = sodium.from_hex(cipherHex);
  
  const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  return sodium.to_string(decrypted);
}