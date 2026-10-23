/**
 * 弱网退避重试：网络错误按 1s / 3s / 9s 退避，最多自动重试 3 次；
 * 业务错误（参数 40020、封禁 40003、频控 40900/42900、登录失效 40001 等）不重试，
 * 直接抛给调用方按错误码分流处理。
 */
import { ApiError } from '../request'

/** 退避序列（毫秒）：第 n 次重试前等待 BACKOFF_MS[n - 1] */
export const BACKOFF_MS = [1000, 3000, 9000]

/** 是否网络错误：请求层把 uni.request fail 统一映射为 code -1 */
export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.code === -1
}

export interface RetryOptions {
  /** 退避序列，默认 1s / 3s / 9s；测试可注入自定义序列 */
  backoff?: number[]
  /** 等待实现，测试注入假时钟避免真实等待 */
  sleep?: (ms: number) => Promise<void>
  /** 每次自动重试前的回调（attempt 从 1 计），用于界面提示「正在重试 1/3」 */
  onRetry?: (attempt: number, total: number, delayMs: number) => void
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/**
 * 执行 fn：网络错误按退避序列自动重试（默认最多 3 次），重试成功即返回；
 * 业务错误或重试耗尽后抛出最后一次的错误。
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const backoff = opts.backoff ?? BACKOFF_MS
  const wait = opts.sleep ?? sleep
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    }
    catch (e) {
      // 业务错误不自动重试；重试次数用尽后也不再等待
      if (!isNetworkError(e) || attempt > backoff.length)
        throw e
      const delay = backoff[attempt - 1]
      opts.onRetry?.(attempt, backoff.length, delay)
      await wait(delay)
    }
  }
}
