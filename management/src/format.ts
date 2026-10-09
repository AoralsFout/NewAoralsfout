/** 管理界面展示工具；导出中文状态说明和本地时间格式化，保留未知枚举原值便于排查。 */
const labels: Record<string, string> = { never: '尚未采集', ok: '正常', timeout: '超时', rate_limited: '限流', auth_error: '鉴权失败', private: '内容已隐藏', error: '采集失败', fresh: '新鲜', stale: '已过期', unavailable: '不可用', unconfigured: '未配置', unknown: '尚未采集', degraded: '部分异常' };
export const statusLabel = (value: string | null) => value ? labels[value] || value : '无需同步';
export const time = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
