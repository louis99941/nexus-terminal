/**
 * IP 地理定位服务
 * 使用 ip-api.com 查询 IP 地理位置信息，带内存缓存
 * 用于登录事件审计日志增强
 */

interface GeoInfo {
  country: string;
  regionName: string;
  city: string;
  isp: string;
  query: string;
}

interface CacheEntry {
  geo: GeoInfo;
  expiresAt: number;
}

const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 缓存 24 小时
const GEO_API_TIMEOUT_MS = 3000; // 3 秒超时

class IpGeoService {
  private cache = new Map<string, CacheEntry>();

  /**
   * 查询 IP 地理位置（带缓存，失败返回 null）
   * 仅对公网 IP 查询，内网/未知 IP 直接返回 null
   * 可通过 ENABLE_GEO_LOOKUP=false 禁用
   */
  async lookup(ip: string): Promise<GeoInfo | null> {
    if (process.env.ENABLE_GEO_LOOKUP === 'false') {
      return null;
    }
    if (!ip || ip === 'unknown' || this.isPrivateIp(ip)) {
      return null;
    }

    // 检查缓存
    const cached = this.cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.geo;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEO_API_TIMEOUT_MS);

      const response = await fetch(
        `http://ip-api.com/json/${ip}?fields=country,regionName,city,isp,query`,
        {
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const data = (await response.json()) as GeoInfo & { status: string };
      if (data.status !== 'success') return null;

      const geo: GeoInfo = {
        country: data.country || '',
        regionName: data.regionName || '',
        city: data.city || '',
        isp: data.isp || '',
        query: data.query || ip,
      };

      // 缓存结果
      this.cache.set(ip, { geo, expiresAt: Date.now() + GEO_CACHE_TTL_MS });

      return geo;
    } catch (error: unknown) {
      // 地理定位失败不阻塞登录流程
      console.debug('[IpGeo] 查询失败:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * 判断是否为内网/私有 IP
   */
  private isPrivateIp(ip: string): boolean {
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('10.') ||
      ip.startsWith('172.') ||
      ip.startsWith('192.168.') ||
      ip.startsWith('fc') ||
      ip.startsWith('fd')
    );
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}

export const ipGeoService = new IpGeoService();
