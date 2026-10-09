/** 独立后端启动入口；验证数据库、初始化模块、启动同步调度，并在退出时关闭连接。 */
import { env } from '../config/env';
import prisma from '../config/database';
import { app } from './app';
import { initializeModules } from './showcase/catalog';
import { startScheduler, stopScheduler } from './showcase/sync';
async function main() {
  await prisma.$queryRaw`SELECT 1`;
  await initializeModules();
  const server = app.listen(env.port, env.host, () => console.log(`展示站服务已启动：http://localhost:${env.port}`));
  startScheduler();
  const close = () => {
    stopScheduler();
    server.close(() => { void prisma.$disconnect().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 65000).unref();
  };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
main().catch(() => { console.error('后端启动失败：请检查环境配置，并先执行 npm run db:setup'); process.exitCode = 1; void prisma.$disconnect(); });
