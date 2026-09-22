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
  
  it('flags IPv4-mapped private and allows mapped public', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:192.168.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:169.254.1.1')).toBe(true);
    expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
    // Node URL이 [::ffff:127.0.0.1] → ::ffff:7f00:1 로 정규화
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateIp('::ffff:c0a8:1')).toBe(true); // 192.168.0.1
    expect(isPrivateIp('::ffff:808:808')).toBe(false); // 8.8.8.8
  });
  
  it('rejects IPv4-mapped private URL literals', async () => {
    await expect(
      assertSafeHttpUrl('http://[::ffff:127.0.0.1]/'),
    ).rejects.toThrow();
    await expect(
      assertSafeHttpUrl('http://[::ffff:192.168.0.1]/path'),
    ).rejects.toThrow();
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