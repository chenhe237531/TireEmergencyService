import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../request'
import { BACKOFF_MS, isNetworkError, retryWithBackoff } from './retry'

const netErr = () => new ApiError(-1, 'network')
const bizErr = (code: number) => new ApiError(code, '业务错误')

/** 不真正等待，只记录每次退避时长 */
function fakeSleep(log: number[]) {
  return (ms: number) => {
    log.push(ms)
    return Promise.resolve()
  }
}

describe('isNetworkError', () => {
  it('code -1 是网络错误', () => {
    expect(isNetworkError(new ApiError(-1, 'network'))).toBe(true)
  })

  it('业务错误码不是网络错误', () => {
    for (const code of [40001, 40003, 40020, 40900, 42900])
      expect(isNetworkError(new ApiError(code, 'x'))).toBe(false)
  })

  it('普通 Error 与空值不是网络错误', () => {
    expect(isNetworkError(new Error('x'))).toBe(false)
    expect(isNetworkError(undefined)).toBe(false)
  })
})

describe('retryWithBackoff', () => {
  it('默认退避序列为 1s / 3s / 9s', () => {
    expect(BACKOFF_MS).toEqual([1000, 3000, 9000])
  })

  it('网络错误按 1s / 3s / 9s 退避，重试成功后停止', async () => {
    const delays: number[] = []
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 4)
        throw netErr()
      return 'ok'
    })

    await expect(retryWithBackoff(fn, { sleep: fakeSleep(delays) })).resolves.toBe('ok')

    expect(fn).toHaveBeenCalledTimes(4)
    expect(delays).toEqual([1000, 3000, 9000])
  })

  it('最多重试 3 次：耗尽后抛出最后一次的网络错误', async () => {
    const delays: number[] = []
    const fn = vi.fn(async () => {
      throw netErr()
    })

    await expect(retryWithBackoff(fn, { sleep: fakeSleep(delays) })).rejects.toThrow('network')

    // 首次 + 3 次重试
    expect(fn).toHaveBeenCalledTimes(4)
    expect(delays).toEqual([1000, 3000, 9000])
  })

  it('业务错误不重试，直接抛出', async () => {
    const delays: number[] = []
    for (const code of [40001, 40003, 40020, 40900, 42900]) {
      const fn = vi.fn(async () => {
        throw bizErr(code)
      })

      await expect(retryWithBackoff(fn, { sleep: fakeSleep(delays) })).rejects.toMatchObject({ code })
      expect(fn).toHaveBeenCalledTimes(1)
    }
    expect(delays).toEqual([])
  })

  it('首次成功时不等待', async () => {
    const delays: number[] = []
    const fn = vi.fn(async () => 'ok')

    await expect(retryWithBackoff(fn, { sleep: fakeSleep(delays) })).resolves.toBe('ok')

    expect(fn).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it('onRetry 在每次重试前回调次数 / 总数 / 退避时长', async () => {
    const events: Array<[number, number, number]> = []
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3)
        throw netErr()
      return 'ok'
    })

    await retryWithBackoff(fn, {
      sleep: fakeSleep([]),
      onRetry: (attempt, total, delay) => events.push([attempt, total, delay]),
    })

    expect(events).toEqual([[1, 3, 1000], [2, 3, 3000]])
  })

  it('退避序列可注入：自定义 2 次时只重试 2 次', async () => {
    const delays: number[] = []
    const fn = vi.fn(async () => {
      throw netErr()
    })

    await expect(retryWithBackoff(fn, { backoff: [50, 60], sleep: fakeSleep(delays) })).rejects.toThrow('network')

    expect(fn).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([50, 60])
  })
})
