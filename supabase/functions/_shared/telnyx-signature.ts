const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export interface VerifyTelnyxSignatureParams {
  rawBody: Uint8Array;
  signatureHeader: string;
  timestampHeader: string;
  publicKey: string;
  maxSkewSeconds?: number;
  nowMs?: number;
}

export interface VerifyTelnyxSignatureResult {
  valid: true;
  timestamp: number;
}

export interface AssertVerifiedTelnyxWebhookEnv {
  TELNYX_PUBLIC_KEY?: string;
  TELNYX_SIGNATURE_MAX_SKEW_SECONDS?: string;
}

export interface VerifiedTelnyxWebhook {
  rawBody: Uint8Array;
  rawBodyText: string;
  verifiedTimestamp: number;
}

export class TelnyxSignatureError extends Error {}

export class MissingTelnyxSignatureHeadersError extends TelnyxSignatureError {}

export class MissingTelnyxPublicKeyError extends TelnyxSignatureError {}

export class InvalidTelnyxTimestampError extends TelnyxSignatureError {}

export class StaleTelnyxTimestampError extends TelnyxSignatureError {}

export class InvalidTelnyxSignatureError extends TelnyxSignatureError {}

export class InvalidTelnyxPublicKeyError extends TelnyxSignatureError {}

export async function getRawBody(request: Request) {
  const buffer = await request.arrayBuffer();
  return new Uint8Array(buffer);
}

function decodeBase64(
  value: string,
  fieldName: string,
  onDecodeError: (message: string) => Error,
) {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  let binary: string;

  try {
    binary = atob(padded);
  } catch {
    throw onDecodeError(`Unable to decode ${fieldName} as Base64.`);
  }

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toUnixSeconds(nowMs: number) {
  return Math.floor(nowMs / 1000);
}

export async function verifyTelnyxSignature({
  rawBody,
  signatureHeader,
  timestampHeader,
  publicKey,
  maxSkewSeconds = 5 * 60,
  nowMs = Date.now(),
}: VerifyTelnyxSignatureParams): Promise<VerifyTelnyxSignatureResult> {
  const parsedTimestamp = Number.parseInt(timestampHeader, 10);

  if (!/^\d+$/.test(timestampHeader) || !Number.isFinite(parsedTimestamp)) {
    throw new InvalidTelnyxTimestampError('Invalid Telnyx timestamp header.');
  }

  const nowSeconds = toUnixSeconds(nowMs);
  const skew = Math.abs(nowSeconds - parsedTimestamp);

  if (skew > maxSkewSeconds) {
    throw new StaleTelnyxTimestampError('Telnyx webhook timestamp is outside the allowed skew window.');
  }

  const signatureBytes = decodeBase64(
    signatureHeader,
    'Telnyx signature',
    (message) => new InvalidTelnyxSignatureError(message),
  );
  const publicKeyBytes = decodeBase64(
    publicKey,
    'TELNYX_PUBLIC_KEY',
    (message) => new InvalidTelnyxPublicKeyError(message),
  );

  if (signatureBytes.length !== 64) {
    throw new InvalidTelnyxSignatureError('Invalid Telnyx signature length.');
  }

  if (publicKeyBytes.length !== 32) {
    throw new InvalidTelnyxPublicKeyError('Invalid TELNYX_PUBLIC_KEY length.');
  }

  const timestampBytes = textEncoder.encode(timestampHeader);
  const signedPayload = new Uint8Array(timestampBytes.length + 1 + rawBody.length);
  signedPayload.set(timestampBytes, 0);
  signedPayload[timestampBytes.length] = 124; // "|"
  signedPayload.set(rawBody, timestampBytes.length + 1);

  const algorithm = 'Ed25519' as unknown as AlgorithmIdentifier;
  const cryptoKey = await crypto.subtle.importKey('raw', publicKeyBytes, algorithm, false, ['verify']);
  const verified = await crypto.subtle.verify(algorithm, cryptoKey, signatureBytes, signedPayload);

  if (!verified) {
    throw new InvalidTelnyxSignatureError('Telnyx webhook signature verification failed.');
  }

  return {
    valid: true,
    timestamp: parsedTimestamp,
  };
}

export async function assertVerifiedTelnyxWebhook(
  request: Request,
  env: AssertVerifiedTelnyxWebhookEnv,
): Promise<VerifiedTelnyxWebhook> {
  const signatureHeader = request.headers.get('telnyx-signature-ed25519');
  const timestampHeader = request.headers.get('telnyx-timestamp');

  if (!signatureHeader || !timestampHeader) {
    throw new MissingTelnyxSignatureHeadersError('Missing Telnyx signature headers.');
  }

  const publicKey = env.TELNYX_PUBLIC_KEY?.trim();

  if (!publicKey) {
    throw new MissingTelnyxPublicKeyError('Missing TELNYX_PUBLIC_KEY.');
  }

  const rawBody = await getRawBody(request);
  const maxSkewSeconds = Number.parseInt(env.TELNYX_SIGNATURE_MAX_SKEW_SECONDS ?? '', 10);
  const resolvedMaxSkew = Number.isFinite(maxSkewSeconds) ? Math.max(1, maxSkewSeconds) : 5 * 60;

  const verification = await verifyTelnyxSignature({
    rawBody,
    signatureHeader,
    timestampHeader,
    publicKey,
    maxSkewSeconds: resolvedMaxSkew,
  });

  return {
    rawBody,
    rawBodyText: textDecoder.decode(rawBody),
    verifiedTimestamp: verification.timestamp,
  };
}
