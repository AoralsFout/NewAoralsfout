/** 联系方式链接规则：导出 contactHref；仅根据公开接口数据生成安全网页、邮件或拨号入口，不补静态联系方式。 */
import type { ShowcaseContactMethod } from '../data/types';

/** 自定义账号默认只展示和复制；明确网页链接优先，其次识别 email、phone 类型。 */
export function contactHref(contact: ShowcaseContactMethod): string {
  if (contact.url) {
    try {
      const url = new URL(contact.url);
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch { /* 无效链接保留文本展示，不生成跳转。 */ }
  }
  if (contact.type.toLowerCase() === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.value)) return `mailto:${encodeURIComponent(contact.value)}`;
  if (contact.type.toLowerCase() === 'phone') {
    const value = contact.value.replace(/[ ()-]/g, '');
    if (/^\+?\d{3,20}$/.test(value)) return `tel:${value}`;
  }
  return '';
}
