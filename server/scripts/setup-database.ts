/** 增量数据库初始化入口；建表、移除旧接单字段、新增联系方式表并初始化模块，支持重复执行，不重置或删表。 */
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
    // 保留初始迁移历史；只在旧字段存在时执行后续迁移，兼容首次安装和重复初始化。
    const [columns] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'personal_status' AND COLUMN_NAME = 'availability'",
    );
    if (columns.length > 0) {
      const migration = await readFile(resolve('prisma/migrations/202610090002_remove_availability/migration.sql'), 'utf8');
      await connection.query(migration);
    }
    const contactMigration = await readFile(resolve('prisma/migrations/202610090003_contact_methods/migration.sql'), 'utf8');
    await connection.query(contactMigration);
    await initializeModules();
    console.log('展示站表结构更新及模块初始化完成');
  } finally { await connection.end(); await prisma.$disconnect(); }
}
main().catch(() => { console.error('数据库初始化失败，请检查连接、权限和表结构；未执行删表操作'); process.exitCode = 1; });
