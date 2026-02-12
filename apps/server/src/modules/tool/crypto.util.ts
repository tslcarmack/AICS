import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.TOOL_AUTH_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'TOOL_AUTH_ENCRYPTION_KEY environment variable is not set. ' +
        'Please configure it to enable tool authentication encryption.',
    );
  }
  // Use first 32 bytes of the hex key (or hash it to get 32 bytes)
  return crypto.createHash('sha256').update(key).digest();
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const [ivHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted text format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Mask a sensitive string, showing only the last 4 characters.
 * e.g., "sk-abcdefgh12345678" -> "****5678"
 */
export function maskSecret(value: string): string {
  if (!value || value.length <= 4) return '****';
  return '****' + value.slice(-4);
}
