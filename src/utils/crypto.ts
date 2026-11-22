import type {PharmacySnapshot} from '../types/pharmacy';

interface EncryptedEnvelope {
  v: 1;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  salt: string;
  iv: string;
  cipher: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: 120000,
      hash: 'SHA-256',
    },
    baseKey,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(
  plainText: string,
  passphrase: string,
): Promise<string> {
  if (!plainText) return '';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const encoded = new TextEncoder().encode(plainText);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv: iv.buffer as ArrayBuffer},
    key,
    encoded,
  );

  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    salt: toBase64(salt),
    iv: toBase64(iv),
    cipher: toBase64(new Uint8Array(encryptedBuffer)),
  };

  return JSON.stringify(envelope);
}

export async function decryptText(
  envelopeJson: string,
  passphrase: string,
): Promise<string> {
  if (!envelopeJson) return '';
  const parsed = JSON.parse(envelopeJson) as EncryptedEnvelope;
  if (!parsed || parsed.v !== 1 || !parsed.salt || !parsed.iv || !parsed.cipher) {
    throw new Error('Invalid encrypted payload format');
  }

  const salt = fromBase64(parsed.salt);
  const iv = fromBase64(parsed.iv);
  const cipherBytes = fromBase64(parsed.cipher);
  const key = await deriveAesKey(passphrase, salt);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv: iv.buffer as ArrayBuffer},
    key,
    cipherBytes.buffer as ArrayBuffer,
  );

  return new TextDecoder().decode(decryptedBuffer);
}

export async function createEncryptedBackup(
  snapshot: PharmacySnapshot,
  passphrase: string,
): Promise<string> {
  const rawJson = JSON.stringify(snapshot);
  const encryptedPayload = await encryptText(rawJson, passphrase);
  return JSON.stringify(
    {
      format: 'arogyapos-e2ee-backup',
      version: 1,
      encrypted: true,
      exportedAt: new Date().toISOString(),
      payload: encryptedPayload,
    },
    null,
    2,
  );
}

export async function parseBackupFile(
  fileText: string,
  passphrase?: string,
): Promise<PharmacySnapshot> {
  const parsed = JSON.parse(fileText) as {
    format?: string;
    encrypted?: boolean;
    payload?: string;
    medicines?: unknown[];
    customers?: unknown[];
    sales?: unknown[];
  };

  if (parsed.format === 'arogyapos-e2ee-backup' && parsed.encrypted && parsed.payload) {
    if (!passphrase) {
      throw new Error('PASSPHRASE_REQUIRED');
    }
    const decryptedJson = await decryptText(parsed.payload, passphrase);
    return JSON.parse(decryptedJson) as PharmacySnapshot;
  }

  if (
    Array.isArray(parsed.medicines) &&
    Array.isArray(parsed.customers) &&
    Array.isArray(parsed.sales)
  ) {
    return parsed as unknown as PharmacySnapshot;
  }

  throw new Error('INVALID_BACKUP_FILE');
}
