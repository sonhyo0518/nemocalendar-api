import { describe, expect, it } from 'vitest';
import {
  assertSafeHttpUrl,
  isPrivateIp,
} from '../src/utils/fetch-og-meta';

describe('OG URL safety (P3-6)', () => {
  it('flags private IPv4 and loopback', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('169.254.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('100.64.1.1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });

  it('flags private IPv6', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it('rejects localhost and literal private URLs', async () => {
    await expect(assertSafeHttpUrl('http://localhost/')).rejects.toThrow();
    await expect(assertSafeHttpUrl('http://127.0.0.1/')).rejects.toThrow();
    await expect(
      assertSafeHttpUrl('http://192.168.0.1/path'),
    ).rejects.toThrow();
  });

  it('rejects non-http protocols and userinfo', async () => {
    await expect(assertSafeHttpUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(
      assertSafeHttpUrl('http://user:pass@example.com/'),
    ).rejects.toThrow();
  });

  it('accepts a public IP literal', async () => {
    const t = await assertSafeHttpUrl('https://8.8.8.8/');
    expect(t.addresses).toEqual(['8.8.8.8']);
    expect(t.url.hostname).toBe('8.8.8.8');
  });
});