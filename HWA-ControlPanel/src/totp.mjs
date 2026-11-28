import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(raw) {
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/=+$/g, '')
    .replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpStep(now = Date.now(), periodSec = 30) {
  return Math.floor(now / 1000 / periodSec);
}

export function generateTotpForStep(secretBase32, step, digits = 6) {
  const key = base32Decode(secretBase32);
  if (key.length < 10) {
    throw new Error('OTP secret is too short');
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step), 0);
  const hmac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeInt =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    10 ** digits;
  return String(codeInt).padStart(digits, '0');
}

export function generateTotp(secretBase32, now = Date.now(), periodSec = 30, digits = 6) {
  const step = totpStep(now, periodSec);
  const code = generateTotpForStep(secretBase32, step, digits);
  const elapsed = Math.floor(now / 1000) % periodSec;
  return { code, step, remainingSeconds: periodSec - elapsed };
}

export function verifyTotp(secretBase32, inputCode, now = Date.now(), window = 1, periodSec = 30) {
  const normalized = String(inputCode || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return { valid: false, step: null };
  const currentStep = totpStep(now, periodSec);
  const inputBuf = Buffer.from(normalized, 'utf8');
  for (let delta = -window; delta <= window; delta++) {
    const candidateStep = currentStep + delta;
    if (candidateStep < 0) continue;
    const expected = generateTotpForStep(secretBase32, candidateStep, 6);
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (crypto.timingSafeEqual(inputBuf, expectedBuf)) {
      return { valid: true, step: candidateStep };
    }
  }
  return { valid: false, step: null };
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
