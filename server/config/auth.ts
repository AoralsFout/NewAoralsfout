/** 复用 NeoBlog 的 config/auth.ts；承担同名模块职责并保留原有导出。 */
import { env } from './env';

// 认证Cookie名称（HttpOnly）
export const AUTH_COOKIE_NAME = 'nb_token';

// OAuth配置
export const oauthConfig = {
  clientId: env.clientId,
  clientSecret: env.clientSecret,
  authorizationUrl: env.authorizationUrl,
  tokenUrl: env.tokenUrl,
  userInfoUrl: env.userInfoUrl,
  // 默认回调到backendUrl；生产跨域部署时通过 OAUTH_CALLBACK_URL 指向前端域名下的/api代理
  redirectUri: env.oauthCallbackUrl || `${env.backendUrl}/api/auth/natayark/callback`,
  scope: '', // Natayark OAuth不需要scope
};
