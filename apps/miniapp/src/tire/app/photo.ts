/**
 * 咨询现场照片：张数上限、大小决策与压缩。
 *
 * 约束（与 issue #7 / 服务端 /app/upload 一致）：
 *   - 最多 9 张（服务端 consult.images 同样截取前 9 条）；
 *   - 单张原图上限 5MB（服务端 multipart 5MB 硬限）；
 *   - 超过 2MB 的图先 uni.compressImage 压缩再上传，压缩质量逐轮递减直到进入 2MB。
 */

/** 最多可附带的现场照片张数 */
export const PHOTO_MAX_COUNT = 9

/** 单张原图大小上限（5MB）：超过直接拒绝，压不回来也没有上传的意义 */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

/** 压缩目标（2MB）：原图超过该值才需要压缩，不超过的原图直传 */
export const PHOTO_COMPRESS_BYTES = 2 * 1024 * 1024

/** 压缩质量递减序列：quality 80 → 60 → 40，多数照片一两轮即可进入 2MB */
export const COMPRESS_QUALITY_STEPS = [80, 60, 40]

/** 单张照片的处理决策 */
export type PhotoPlan = 'use' | 'compress' | 'reject'

/**
 * 按原图大小决定处理方式：
 *   - 超 5MB：拒绝（提示换一张），避免压缩也压不进服务端限制；
 *   - 2MB ~ 5MB：先压缩再上传；
 *   - 2MB 以内：原图直接上传。
 */
export function planPhoto(sizeBytes: number): PhotoPlan {
  if (sizeBytes > PHOTO_MAX_BYTES)
    return 'reject'
  if (sizeBytes > PHOTO_COMPRESS_BYTES)
    return 'compress'
  return 'use'
}

/**
 * 是否还能添加 adding 张照片（总数上限 9）：选择器数量受限 + 手动校验双保险，
 * H5 文件多选可能一次带回超过剩余额度的张数。
 */
export function canAddPhotos(current: number, adding: number): boolean {
  return current + adding <= PHOTO_MAX_COUNT
}

export interface PreparedPhoto {
  /** 上传用的本地路径：原图或压缩后的临时路径 */
  path: string
  /** 实际大小（字节）：压缩后以 uni.getFileInfo 为准 */
  size: number
}

/** 查询本地文件大小（字节）；查询失败返回 0，调用方按「未知大小」继续走原路径 */
function fileSize(path: string): Promise<number> {
  return new Promise((resolve) => {
    uni.getFileInfo({
      filePath: path,
      success: res => resolve(res.size || 0),
      fail: () => resolve(0),
    })
  })
}

/** uni 接口失败回调可能是 Error，也可能是 { errMsg }，统一取出文案 */
function errorText(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'errMsg' in e)
    return String((e as { errMsg?: unknown }).errMsg || '')
  return e instanceof Error ? e.message : ''
}

/** 压缩单张照片：成功返回压缩后的临时路径，平台不支持或失败时返回 null（回退原图） */
function compressOnce(src: string, quality: number): Promise<string | null> {
  return new Promise((resolve) => {
    uni.compressImage({
      src,
      quality,
      success: res => resolve(res.tempFilePath || null),
      fail: (e: unknown) => {
        // 部分 PNG / 平台不支持压缩：回退原图（仍受 5MB 上限约束）
        const msg = errorText(e)
        if (msg && !/compressImage/i.test(msg))
          console.warn('[tire] compressImage fail:', msg)
        resolve(null)
      },
    })
  })
}

/**
 * 把照片准备到可上传状态：
 *   - 原图 ≤ 2MB：原样返回；
 *   - 原图 > 2MB：按 quality 80/60/40 逐轮压缩，每轮检查大小，进入 2MB 即停；
 *     压缩 API 不可用时回退原图（原图 ≤ 5MB 仍可直传）；
 *   - 压缩轮次用尽仍超 2MB：返回最后一轮结果（质量 40 的图远小于 5MB，可直传）。
 * 压缩后大小未知（getFileInfo 失败）时按 0 返回，上传由服务端 5MB 硬限兜底。
 */
export async function preparePhoto(src: string, sizeBytes: number): Promise<PreparedPhoto> {
  if (planPhoto(sizeBytes) !== 'compress')
    return { path: src, size: sizeBytes }

  let path = src
  for (const quality of COMPRESS_QUALITY_STEPS) {
    const out = await compressOnce(path, quality)
    // 当前平台不支持压缩：回退原图（≤ 5MB 由服务端兜底；> 5MB 上传会被拒，页面按失败入队）
    if (!out)
      return { path: src, size: sizeBytes }
    path = out
    const size = await fileSize(path)
    if (size > 0 && size <= PHOTO_COMPRESS_BYTES)
      return { path, size }
  }
  return { path, size: await fileSize(path) }
}
