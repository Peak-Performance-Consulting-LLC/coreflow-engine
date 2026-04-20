const IV_LENGTH = 12;

function normalizeSecretKey(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('EMAIL_CREDENTIALS_ENCRYPTION_KEY is required.');
  }

  try {
    const decoded = Uint8Array.from(atob(trimmed), (char) => char.charCodeAt(0));
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Continue to raw/hex checks.
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const decoded = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      decoded[index] = Number.parseInt(trimmed.slice(index * 2, index * 2 + 2), 16);
    }
    return decoded;
  }

  const asText = new TextEncoder().encode(trimmed);
  if (asText.length === 32) {
    return asText;
  }

  throw new Error('EMAIL_CREDENTIALS_ENCRYPTION_KEY must be a 32-byte base64, 64-char hex, or 32-char raw string.');
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

let cachedCryptoKey: Promise<CryptoKey> | null = null;

async function getCryptoKey() {
  if (cachedCryptoKey) {
    return cachedCryptoKey;
  }

  cachedCryptoKey = crypto.subtle.importKey(
    'raw',
    normalizeSecretKey(Deno.env.get('EMAIL_CREDENTIALS_ENCRYPTION_KEY') ?? ''),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );

  return cachedCryptoKey;
}

export async function encryptSecret(value: string | null | undefined) {
  const nextValue = typeof value === 'string' ? value.trim() : '';
  if (!nextValue) {
    return null;
  }

  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(nextValue);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      plaintext,
    ),
  );

  return `${toBase64(iv)}.${toBase64(encrypted)}`;
}

export async function decryptSecret(value: string | null | undefined) {
  const nextValue = typeof value === 'string' ? value.trim() : '';
  if (!nextValue) {
    return null;
  }

  const [ivPart, encryptedPart] = nextValue.split('.');

  if (!ivPart || !encryptedPart) {
    throw new Error('Encrypted secret format is invalid.');
  }

  const key = await getCryptoKey();
  const iv = fromBase64(ivPart);
  const encrypted = fromBase64(encryptedPart);

  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      encrypted,
    ),
  );

  return new TextDecoder().decode(decrypted);
}
