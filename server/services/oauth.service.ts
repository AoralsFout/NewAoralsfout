/** 复用 NeoBlog 的 services/oauth.service.ts；承担同名模块职责并保留原有导出。 */
import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env';
import { oauthConfig } from '../config/auth';
import { hashPassword } from '../utils/hash';
import logger from '../utils/logger';

// Natayark用户信息接口
export interface NatayarkUser {
  id: number;
  username: string;
  email: string;
  realname: boolean;
  last_login: string | null;
  last_ip: string;
  regtime: string;
  status: number;
  // 其他可能字段
}

// 令牌响应接口
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
}

// OAuth服务类
class OAuthService {
  /**
   * 生成授权URL
   * @param state CSRF state参数
   * @returns 授权URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.clientId,
      redirect_uri: oauthConfig.redirectUri,
      state,
    });

    return `${env.authorizationUrl}?${params.toString()}`;
  }

  /**
   * 交换授权码获取访问令牌
   * @param code 授权码
   * @returns 访问令牌
   */
  async exchangeCodeForToken(code: string): Promise<string> {
    try {
      // 根据文档要求，需要对client_secret进行PASSWORD_HASH
      const hashedClientSecret = await hashPassword(env.clientSecret);

      const data = {
        grant_type: 'authorization_code',
        code,
        client_id: env.clientId,
        client_secret: hashedClientSecret,
        redirect_uri: oauthConfig.redirectUri,
      };

      logger.info('交换授权码获取令牌', { clientId: env.clientId });

      const response = await axios.post<TokenResponse>(env.tokenUrl, data, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!response.data.access_token) {
        throw new Error('未收到访问令牌');
      }

      return response.data.access_token;
    } catch (error) {
      logger.error('交换授权码失败:', error);
      throw new Error(`获取访问令牌失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取用户信息
   * @param accessToken 访问令牌
   * @returns Natayark用户信息
   */
  async getUserInfo(accessToken: string): Promise<NatayarkUser> {
    try {
      const response = await axios.get(env.userInfoUrl, {
        timeout: 10000,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.data.code !== 200 || !response.data.data) {
        throw new Error(`Natayark API错误: ${response.data.msg || '未知错误'}`);
      }

      return response.data.data;
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      throw new Error(`获取用户信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 生成无状态、可验证的state参数（随机值 + HMAC签名，防止OAuth CSRF）
   * 不依赖内存/数据库存储，支持多实例部署
   * @returns state字符串
   */
  generateState(): string {
    const random = crypto.randomBytes(16).toString('base64url');
    const signature = this.signState(random);
    return `${random}.${signature}`;
  }

  /**
   * 验证state参数是否由本服务签发
   * @param receivedState 回调中收到的state
   * @returns 是否有效
   */
  validateState(receivedState: string): boolean {
    if (!receivedState || typeof receivedState !== 'string') {
      return false;
    }

    const parts = receivedState.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return false;
    }

    const [random, signature] = parts;
    const expected = this.signState(random);

    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature);
    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  }

  /**
   * 对随机值做HMAC签名
   * @param random 随机值
   * @returns 签名
   */
  private signState(random: string): string {
    return crypto
      .createHmac('sha256', env.jwtSecret)
      .update(random)
      .digest('base64url');
  }

  /**
   * 将Natayark用户信息映射到数据库用户字段
   * @param natayarkUser Natayark用户信息
   * @returns 数据库用户字段
   */
  mapToUserFields(natayarkUser: NatayarkUser) {
    return {
      natayark_id: natayarkUser.id,
      username: natayarkUser.username,
      email: natayarkUser.email,
      avatar: '', // Natayark可能不提供头像，使用默认
      role: 'MEMBER' as const,
      status: 'NORMAL' as const,
    };
  }
}

export default new OAuthService();
