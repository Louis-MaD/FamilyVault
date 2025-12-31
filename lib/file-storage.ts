import fs from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

// Allowed MIME types
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
];

// Max file size: 25MB
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Get deterministic storage path for a file
 */
export function getStoragePath(userId: string, fileId: string): string {
  // Create path: data/uploads/{userId}/{fileId}
  return path.join(UPLOAD_DIR, userId, fileId);
}

/**
 * Ensure upload directory exists for user
 */
export async function ensureUploadDir(userId: string): Promise<void> {
  const userDir = path.join(UPLOAD_DIR, userId);
  await fs.mkdir(userDir, { recursive: true });
}

/**
 * Write encrypted file bytes to disk
 */
export async function writeEncryptedFile(
  userId: string,
  fileId: string,
  data: Buffer
): Promise<string> {
  await ensureUploadDir(userId);
  const storagePath = getStoragePath(userId, fileId);
  await fs.writeFile(storagePath, data);
  return storagePath;
}

/**
 * Read encrypted file bytes from disk
 */
export async function readEncryptedFile(storagePath: string): Promise<Buffer> {
  return fs.readFile(storagePath);
}

/**
 * Delete encrypted file from disk
 */
export async function deleteEncryptedFile(storagePath: string): Promise<void> {
  try {
    await fs.unlink(storagePath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // File doesn't exist, that's fine
  }
}

/**
 * Validate MIME type
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * Validate file size
 */
export function isValidFileSize(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE;
}
