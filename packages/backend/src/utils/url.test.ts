import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getHostnameFromHostHeader,
  getHostnameFromOrigin,
  getSingleHeaderToken,
  normalizeOrigin,
  validateUrlNotPrivate,
} from './url';

// Mock dns/promises 用于 SSRF 测试
vi.mock('dns/promises', () => ({
  default: {
    resolve4: vi.fn().mockResolvedValue([]),
    resolve6: vi.fn().mockResolvedValue([]),
  },
}));

// Mock logger 避免测试输出噪音
vi.mock('./logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import dns from 'dns/promises';

describe('url utils', () => {
  describe('getSingleHeaderToken', () => {
    it('应返回逗号分隔头部的第一个有效值', () => {
      expect(getSingleHeaderToken('https://a.example.com, https://b.example.com')).toBe(
        'https://a.example.com'
      );
    });

    it('空值应返回 undefined', () => {
      expect(getSingleHeaderToken(undefined)).toBeUndefined();
      expect(getSingleHeaderToken('')).toBeUndefined();
    });
  });

  describe('normalizeOrigin', () => {
    it('应归一化 origin', () => {
      expect(normalizeOrigin('https://Example.COM:443/path')).toBe('https://example.com');
    });

    it('无效 origin 应返回 undefined', () => {
      expect(normalizeOrigin('invalid-origin')).toBeUndefined();
    });
  });

  describe('getHostnameFromOrigin', () => {
    it('应解析并标准化主机名', () => {
      expect(getHostnameFromOrigin('https://Sub.Example.com/path')).toBe('sub.example.com');
    });

    it('应正确处理 IPv6 origin', () => {
      expect(getHostnameFromOrigin('http://[::1]:3001')).toBe('::1');
    });
  });

  describe('getHostnameFromHostHeader', () => {
    it('应从 host:port 中提取主机名', () => {
      expect(getHostnameFromHostHeader('example.com:3001')).toBe('example.com');
    });

    it('应正确解析 IPv6 host header', () => {
      expect(getHostnameFromHostHeader('[::1]:3001')).toBe('::1');
    });

    it('无效 host header 应返回 undefined', () => {
      expect(getHostnameFromHostHeader(':::')).toBeUndefined();
    });
  });

  describe('validateUrlNotPrivate', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe('直接 IP 地址检测（无需 DNS 解析）', () => {
      it('应阻止 IPv4 回环地址 127.0.0.1', async () => {
        await expect(validateUrlNotPrivate('http://127.0.0.1/api')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应阻止 IPv4 回环地址 127.0.0.2', async () => {
        await expect(validateUrlNotPrivate('http://127.0.0.2:8080')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应阻止 RFC 1918 私有地址 10.x.x.x', async () => {
        await expect(validateUrlNotPrivate('http://10.0.0.1/internal')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应阻止 RFC 1918 私有地址 172.16.x.x', async () => {
        await expect(validateUrlNotPrivate('http://172.16.0.1/api')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应阻止 RFC 1918 私有地址 192.168.x.x', async () => {
        await expect(validateUrlNotPrivate('http://192.168.1.1/')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应阻止链路本地地址 169.254.x.x', async () => {
        await expect(validateUrlNotPrivate('http://169.254.169.254/latest/')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应阻止 IPv6 回环地址', async () => {
        await expect(validateUrlNotPrivate('http://[::1]/')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应允许公网 IPv4 地址', async () => {
        await expect(validateUrlNotPrivate('https://8.8.8.8/')).resolves.toBeUndefined();
      });
    });

    describe('DNS 解析后检测', () => {
      it('应阻止解析到私有 IP 的域名', async () => {
        vi.mocked(dns.resolve4).mockResolvedValue(['192.168.1.100']);
        vi.mocked(dns.resolve6).mockResolvedValue([]);

        await expect(validateUrlNotPrivate('http://internal.example.com/api')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应阻止解析到链路本地地址的域名', async () => {
        vi.mocked(dns.resolve4).mockResolvedValue(['169.254.0.1']);
        vi.mocked(dns.resolve6).mockResolvedValue([]);

        await expect(validateUrlNotPrivate('http://metadata.example.com/')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应阻止解析到任意私有 IP 的域名（多 IP 场景）', async () => {
        vi.mocked(dns.resolve4).mockResolvedValue(['8.8.4.4', '10.0.0.1']);
        vi.mocked(dns.resolve6).mockResolvedValue([]);

        await expect(validateUrlNotPrivate('http://multi.example.com/')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });

      it('应允许解析到公网 IP 的域名', async () => {
        vi.mocked(dns.resolve4).mockResolvedValue(['142.250.80.46']);
        vi.mocked(dns.resolve6).mockResolvedValue([]);

        await expect(validateUrlNotPrivate('https://api.openai.com/')).resolves.toBeUndefined();
      });

      it('DNS 解析全部失败时应放行', async () => {
        vi.mocked(dns.resolve4).mockRejectedValue(new Error('ENOTFOUND'));
        vi.mocked(dns.resolve6).mockRejectedValue(new Error('ENOTFOUND'));

        await expect(validateUrlNotPrivate('https://api.openai.com/')).resolves.toBeUndefined();
      });

      it('应阻止 IPv6 私有地址 (ULA)', async () => {
        vi.mocked(dns.resolve4).mockResolvedValue([]);
        vi.mocked(dns.resolve6).mockResolvedValue(['fd12:3456:789a::1']);

        await expect(validateUrlNotPrivate('http://ipv6-internal.example.com/')).rejects.toThrow(
          '目标地址解析到不允许的网络范围'
        );
      });
    });
  });
});
