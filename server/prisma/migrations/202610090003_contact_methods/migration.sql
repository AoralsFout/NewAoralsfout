-- 联系方式增量迁移：创建独立列表表，支持重复执行，不改动现有业务表或自动公开联系方式。
CREATE TABLE IF NOT EXISTS contact_methods (
  id INTEGER NOT NULL AUTO_INCREMENT, type VARCHAR(32) NOT NULL, label VARCHAR(100) NOT NULL,
  value VARCHAR(500) NOT NULL, url VARCHAR(2000) NULL, visible BOOLEAN NOT NULL DEFAULT false,
  sortOrder INTEGER NOT NULL DEFAULT 0, createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL, PRIMARY KEY (id), INDEX contact_methods_visible_sortOrder_id_idx (visible, sortOrder, id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
