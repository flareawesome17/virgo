import {
  base32Decode,
  base32Encode,
  digestRecoveryCode,
  generateRecoveryCodes,
  generateSecret,
  hotp,
  openSecret,
  otpauthUri,
  sealSecret,
  stepAt,
  verifyTotp,
} from './totp';

/**
 * Hand-rolled TOTP has to agree with every authenticator app, so it is held
 * to the RFC's own published values rather than to itself.
 */
describe('totp', () => {
  // RFC 6238 appendix B: SHA-1, the ASCII secret "12345678901234567890",
  // eight digits. Six digits are the last six of the same number.
  const rfcSecret = Buffer.from('12345678901234567890', 'ascii');
  const vectors: [number, string][] = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];

  it.each(vectors)('matches RFC 6238 at T=%i', (seconds, expected) => {
    const step = stepAt(seconds * 1000);
    expect(hotp(rfcSecret, step, 8)).toBe(expected);
    expect(hotp(rfcSecret, step)).toBe(expected.slice(2));
  });

  it('round-trips base32 the way authenticator apps read it', () => {
    expect(base32Encode(rfcSecret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv-gy3tqojqgezdgnbvgy3tqojq')).toEqual(rfcSecret);
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it('accepts the current code and one step either side, and nothing further', () => {
    const secret = base32Encode(rfcSecret);
    const now = 1111111111 * 1000;
    const step = stepAt(now);
    const code = (s: number) => hotp(rfcSecret, s);
    expect(verifyTotp(secret, code(step), { now })).toBe(step);
    expect(verifyTotp(secret, code(step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(secret, code(step + 1), { now })).toBe(step + 1);
    expect(verifyTotp(secret, code(step - 2), { now })).toBeNull();
    expect(verifyTotp(secret, 'abcdef', { now })).toBeNull();
    expect(verifyTotp(secret, '12345', { now })).toBeNull();
  });

  it('refuses a code whose step has already been used', () => {
    const secret = base32Encode(rfcSecret);
    const now = 1234567890 * 1000;
    const step = stepAt(now);
    expect(verifyTotp(secret, hotp(rfcSecret, step), { now, lastStep: step })).toBeNull();
    expect(verifyTotp(secret, hotp(rfcSecret, step + 1), { now, lastStep: step })).toBe(step + 1);
  });

  it('names the issuer and account in the URI an app scans', () => {
    const uri = otpauthUri('ABC', 'ana@virgo.ph');
    expect(uri).toBe(
      'otpauth://totp/Virgo%20Console%3Aana%40virgo.ph?secret=ABC&issuer=Virgo+Console',
    );
  });

  it('seals the secret so only the same key opens it', () => {
    const master = 'x'.repeat(40);
    const sealed = sealSecret('GEZDGNBV', master);
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('GEZDGNBV');
    expect(openSecret(sealed, master)).toBe('GEZDGNBV');
    expect(openSecret(sealed, 'y'.repeat(40))).toBeNull();
    expect(openSecret(`${sealed}x`, master)).toBeNull();
    expect(openSecret('not sealed', master)).toBeNull();
  });

  it('makes ten readable recovery codes that match however they are typed', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    const [first] = codes;
    expect(digestRecoveryCode(` ${first.toUpperCase().replace('-', ' ')} `)).toBe(
      digestRecoveryCode(first),
    );
  });
});
