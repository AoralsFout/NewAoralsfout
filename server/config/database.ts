/** 复用 NeoBlog 的 config/database.ts；承担同名模块职责并保留原有导出。 */
import { PrismaClient } from '@prisma/client';

// 扩展PrismaClient类型以添加断开连接方法
const prisma = new PrismaClient({
  // 展示站不输出 SQL 或连接信息，避免联调日志带入共享数据库细节。
  log: [],
});

// 数据库连接状态检查
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ 数据库连接成功');
    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    return false;
  }
};

// 关闭
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};

export default prisma;
