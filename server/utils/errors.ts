/** 复用 NeoBlog 的 utils/errors.ts；承担同名模块职责并保留原有导出。 */
/**
 * 领域错误类型
 *
 * 背景：此前 Service 只抛 `new Error('中文文案')`，Controller 依靠
 * `error.message.includes('不存在')` 之类的字符串匹配来猜 HTTP 状态码。
 * 这把业务判定建立在提示文案上——文案一改、或加一层包装，判定即静默失效。
 *
 * 约定：
 * - Service 抛出语义化的领域错误（本文件的类）
 * - Controller 只做 HTTP 层校验，业务失败一律 `next(error)`
 * - 统一由 src/index.ts 的错误处理中间件映射为 HTTP 状态码与响应体
 *
 * 注意：`code` 与 `message` 是对外契约，修改会影响前端展示，不要随意调整。
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    // 保证 instanceof 在编译目标为 ES5/ES6 时仍然可靠
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 请求参数不合法（值域、格式、业务前置条件） */
export class ValidationError extends AppError {
  constructor(message: string, code = 'INVALID_PARAMS') {
    super(message, 400, code);
  }
}

/** 404 资源不存在 */
export class NotFoundError extends AppError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

/** 409 与现有资源冲突（唯一约束等） */
export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, 409, code);
  }
}

/**
 * 父评论与目标来源不一致。
 *
 * 这是请求参数问题（语义上是 400），但历史行为返回 500。
 * 为避免在"收敛错误映射"这一步顺带改变对外状态码契约，
 * 这里刻意**不继承** AppError：错误处理中间件会按普通错误处理，
 * 从而保持 500 响应不变，同时让该分支不再依赖字符串匹配。
 *
 * 待接口版本演进时，把基类改成 ValidationError（400）即可完成收敛。
 */
export class ParentCommentSourceMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParentCommentSourceMismatchError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 判断是否为可映射为 HTTP 响应的领域错误 */
export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
