-- 移除当前状态的接单字段；由数据库初始化脚本确认字段存在后执行，保留其他状态内容。
ALTER TABLE personal_status DROP COLUMN availability;
