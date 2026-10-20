import type { ArgumentsHost, CallHandler, ExceptionFilter, ExecutionContext, NestInterceptor } from '@nestjs/common'
import { Catch, HttpException } from '@nestjs/common'
import { map } from 'rxjs'

/** 业务异常：HTTP 200 + 业务错误码（12.1 错误码表） */
export class BizError extends Error {
  constructor(public code: number, message: string, public extra?: Record<string, any>) {
    super(message)
  }
}

export const Err = {
  unauth: () => new BizError(40001, '请先登录'),
  forbidden: (msg = '没有权限') => new BizError(40003, msg),
  needConsent: (type: string) => new BizError(40010, '需要您的授权', { consentType: type }),
  needPhone: () => new BizError(40011, '需要绑定手机号'),
  bad: (msg = '参数错误') => new BizError(40020, msg),
  notFound: (msg = '资源不存在') => new BizError(40400, msg),
  conflict: (msg = '状态已变化，请刷新') => new BizError(40900, msg),
}

export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(data => ({ code: 0, message: 'ok', data: data ?? null })))
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse()
    if (exception instanceof BizError) {
      return res.status(200).json({ code: exception.code, message: exception.message, data: exception.extra || null })
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      return res.status(status).json({ code: status * 100, message: exception.message, data: null })
    }
    console.error('[xueji] unhandled', exception)
    return res.status(200).json({ code: 50000, message: exception?.message || '服务器错误', data: null })
  }
}
