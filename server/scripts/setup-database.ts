/** 增量数据库初始化入口；执行可重复的建表 SQL 并初始化固定模块，绝不执行重置或删表。 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../config/env';
import prisma from '../config/database';
import { initializeModules } from '../src/showcase/catalog';
async function main() {
  const connection = await mysql.createConnection(env.databaseUrl);
  try {
    // 单条执行，不打开 multipleStatements；SQL 仅来自仓库中的受控迁移文件。
    const sql = await readFile(resolve('prisma/migrations/202610090001_showcase/migration.sql'), 'utf8');
    for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await connection.query(statement);
    await initializeModules();
    console.log('展示站五张表及模块初始化完成');
  } finally { await connection.end(); await prisma.$disconnect(); }
}
main().catch(() => { console.error('数据库初始化失败，请检查连接、权限和表结构；未执行删表操作'); process.exitCode = 1; });
