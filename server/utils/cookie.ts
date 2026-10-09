/** 复用 NeoBlog 的 utils/cookie.ts；承担同名模块职责并保留原有导出。 */
/**
 * 轻量Cookie解析（避免额外依赖cookie-parser）
 */

/**
 * 解析Cookie请求头为键值对象
 * @param cookieHeader Cookie请求头
 * @returns Cookie键值对象
 */
export const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    let value = part.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
  }

  return cookies;
};
