// Encryption with a key made from something the user types, for export files and the hidden
// trackers: PBKDF2-SHA256, then AES-GCM-256, which also tells a wrong key or damaged data apart
// from a good one.

// PBKDF2-SHA256 rounds, OWASP's current recommendation. More rounds make guessing slower.
const ROUNDS = 600_000

export type Bytes = Uint8Array<ArrayBuffer>

// Encrypted data and the random IV it was encrypted with.
export type Sealed = { iv: Bytes; data: Bytes }

export function newSalt(): Bytes {
  return crypto.getRandomValues(new Uint8Array(16))
}

export async function keyFor(secret: string, salt: Bytes): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ROUNDS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// Encrypts a value as JSON, with a fresh IV every time.
export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)))
  return { iv, data: new Uint8Array(data) }
}

// Decrypts what `seal` made. Rejects when the key is wrong or the data was changed.
export async function unseal<T>(key: CryptoKey, { iv, data }: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return JSON.parse(new TextDecoder().decode(plain))
}

export function toBase64(bytes: Bytes): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(text: string): Bytes {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}
