/** 脱敏日志工具；供复用的 NeoBlog 服务记录事件，不输出异常请求中的凭据。 */
import winston from 'winston';
const logger = winston.createLogger({
  format: winston.format.combine(winston.format.timestamp(), winston.format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${String(message)}`)),
  transports: [new winston.transports.Console()],
});
export default logger;
