import dns from 'dns/promises';
import ipaddr from 'ipaddr.js';
import { logger } from './logger';

/** SSRF 防护：需要阻止的 ipaddr.js 范围标识 */
const SSRF_BLOCKED_RANGES = new Set([
  'private', // RFC 1918 (10/8, 172.16/12, 192.168/16)
  'loopback', // 127.0.0.0/8, ::1
  'linkLocal', // 169.254.0.0/16, fe80::/10
  'uniqueLocal', // fc00::/7 (IPv6 ULA)
  'broadcast', // 广播地址
  'carrierGradeNat', // 100.64.0.0/10 (运营商级 NAT)
  'reserved', // 其他保留地址段
]);

/**
 * SSRF 防护：验证 URL 目标地址不属于私有/内部网络
 * 通过 DNS 解析主机名，检查所有解析到的 IP 是否属于受限地址段
 * @param targetUrl 需要验证的目标 URL
 * @param sourceTag 调用方标识，用于日志
 * @throws 如果解析到私有/保留 IP 则抛出错误
 */
export const validateUrlNotPrivate = async (
  targetUrl: string,
  sourceTag = 'URL'
): Promise<void> => {
  const urlObj = new URL(targetUrl);
  // IPv6 地址在 URL.hostname 中带方括号，ipaddr.parse 需要去除
  const hostname = urlObj.hostname.replace(/^\[(.*)\]$/, '$1');

  // 如果主机名本身是 IP 地址，直接检查，无需 DNS 解析
  try {
    const parsed = ipaddr.parse(hostname);
    const range = parsed.range();
    if (SSRF_BLOCKED_RANGES.has(range)) {
      logger.warn(`[SSRF] ${sourceTag} 阻止：主机名 ${hostname} 是私有/保留 IP (${range})`);
      throw new Error('目标地址解析到不允许的网络范围，请求已阻止。');
    }
    return;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('目标地址')) {
      throw error;
    }
    // 主机名不是合法 IP，继续 DNS 解析
  }

  // DNS 解析并检查所有解析到的 IP
  const ipv4List = await dns.resolve4(hostname).catch(() => []);
  const ipv6List = await dns.resolve6(hostname).catch(() => []);
  const allAddresses = [...ipv4List, ...ipv6List];

  for (const addr of allAddresses) {
    const parsed = ipaddr.parse(addr);
    const range = parsed.range();
    if (SSRF_BLOCKED_RANGES.has(range)) {
      logger.warn(
        `[SSRF] ${sourceTag} 阻止：主机名 ${hostname} 解析到私有/保留 IP ${addr} (${range})`
      );
      throw new Error('目标地址解析到不允许的网络范围，请求已阻止。');
    }
  }
};

export const getSingleHeaderToken = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  return value
    .split(',')
    .map((item) => item.trim())
    .find(Boolean);
};

const normalizeHostname = (hostname: string): string => {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1');
};

export const normalizeOrigin = (origin: string): string | undefined => {
  try {
    return new URL(origin).origin;
  } catch {
    return undefined;
  }
};

export const getHostnameFromOrigin = (origin: string): string | undefined => {
  try {
    return normalizeHostname(new URL(origin).hostname);
  } catch {
    return undefined;
  }
};

export const getHostnameFromHostHeader = (hostHeader: string): string | undefined => {
  const token = getSingleHeaderToken(hostHeader);
  if (!token) {
    return undefined;
  }

  try {
    return normalizeHostname(new URL(`http://${token}`).hostname);
  } catch {
    return undefined;
  }
};
