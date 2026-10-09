/** 服务端环境配置；加载本地凭据并导出与 NeoBlog 兼容的 env。 */
import dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config();
for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`环境变量 ${key} 未设置`);
}
if (process.env.JWT_SECRET!.length < 32) throw new Error('JWT_SECRET 至少需要 32 个字符');
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3002';
export const env = {
  databaseUrl: process.env.DATABASE_URL!, jwtSecret: process.env.JWT_SECRET!, jwtExpiresIn: '7d',
  nodeEnv: process.env.NODE_ENV || 'development', port: Number(process.env.PORT || 3002), host: process.env.HOST || '127.0.0.1',
  frontendUrl, backendUrl, cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  oauthCallbackUrl: process.env.OAUTH_CALLBACK_URL || `${frontendUrl}/api/auth/natayark/callback`,
  clientId: process.env.CLIENT_ID || '', clientSecret: process.env.CLIENT_SECRET || '',
  authorizationUrl: process.env.NATAYARK_AUTHORIZATION_URL || 'https://account.naids.com/oauth2/authorize',
  tokenUrl: process.env.NATAYARK_TOKEN_URL || 'https://account.naids.com/api/oauth2/token',
  userInfoUrl: process.env.NATAYARK_USERINFO_URL || 'https://account.naids.com/api/api/user/data',
  steamKey: process.env.STEAM_API_KEY || '', steamId: process.env.STEAM_ID || '',
  bangumiUsername: process.env.BANGUMI_USERNAME || '', githubUsername: process.env.GITHUB_USERNAME || '',
  githubToken: process.env.GITHUB_TOKEN || '', blogUrl: process.env.NEOBLOG_FRONTEND_URL || '',
  blogAssetUrl: process.env.NEOBLOG_ASSET_URL || '', syncEnabled: process.env.SYNC_ENABLED !== 'false',
};
