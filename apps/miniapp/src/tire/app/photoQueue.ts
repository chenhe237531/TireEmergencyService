/**
 * 咨询照片待上传队列：上传失败的照片保留本地副本并持久化，
 * 下次进入咨询页（文字未提交成功时）恢复到表单自动重试；
 * 文字提交成功后队列条目关联到咨询记录，在「我的记录」里补传（见 records.vue）。
 *
 * 与草稿的生命关系：草稿删除（提交成功 / 清空）不清队列——
 * 失败照片属于已提交的咨询记录，补传完成或用户主动删除时才出队。
 */
import { PHOTO_MAX_COUNT } from './photo'

export const PHOTO_QUEUE_KEY = 'tire_consult_photo_queue'

/** 队列条目：path 是持久化后的本地路径（App/小程序为 saveFile 结果）；consultId 为空表示尚未关联咨询记录 */
export interface PendingPhoto {
  id: string
  path: string
  /** 关联的咨询记录 id；null = 文字还没提交成功（或选完图没提交），恢复到咨询表单 */
  consultId: number | null
}

function genId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 读队列：存储损坏时按空队列处理，不抛错 */
export function loadPendingPhotos(): PendingPhoto[] {
  try {
    const raw = uni.getStorageSync(PHOTO_QUEUE_KEY)
    if (!Array.isArray(raw))
      return []
    return raw.filter((p): p is PendingPhoto =>
      !!p && typeof p === 'object' && typeof (p as PendingPhoto).path === 'string' && (p as PendingPhoto).path !== '',
    ).map(p => ({ id: typeof p.id === 'string' && p.id ? p.id : genId(), path: p.path, consultId: typeof p.consultId === 'number' ? p.consultId : null }))
  }
  catch {
    return []
  }
}

function savePendingPhotos(list: PendingPhoto[]) {
  if (list.length)
    uni.setStorageSync(PHOTO_QUEUE_KEY, list)
  else
    uni.removeStorageSync(PHOTO_QUEUE_KEY)
}

/**
 * 保留照片本地副本：App / 小程序用 uni.saveFile 把临时文件转成持久路径
 * （临时路径在退出页面 / 杀进程后失效）；H5 无本地文件概念，返回原路径尽力而为。
 * 注意：vitest 不做条件编译，测试环境按 App 语义运行（走 saveFile 分支）。
 */
export function persistPhotoCopy(tempPath: string): Promise<string> {
  return new Promise((resolve) => {
    // #ifndef H5
    uni.saveFile({
      tempFilePath: tempPath,
      success: res => resolve(res.savedFilePath || tempPath),
      fail: () => resolve(tempPath),
    })
    return
    // #endif
    // #ifdef H5
    resolve(tempPath)
    // #endif
  })
}

/** 上传失败入队：同一张（同路径）不重复入队；队列上限 9 张（与服务端 images 上限一致） */
export function addPendingPhoto(path: string): PendingPhoto {
  const list = loadPendingPhotos()
  const existing = list.find(p => p.path === path)
  if (existing)
    return existing
  const item: PendingPhoto = { id: genId(), path, consultId: null }
  list.push(item)
  // 队列超出上限时淘汰最早的条目，与表单「最多 9 张」保持一致
  savePendingPhotos(list.slice(-PHOTO_MAX_COUNT))
  return item
}

/** 上传成功出队：按路径移除（路径是队列条目的唯一业务标识） */
export function removePendingPhotos(paths: string[]) {
  if (!paths.length)
    return
  const set = new Set(paths)
  savePendingPhotos(loadPendingPhotos().filter(p => !set.has(p.path)))
}

/**
 * 文字提交成功后把未关联的队列条目（consultId 为空）挂到咨询记录上：
 * 这些照片不再恢复到咨询表单，改在「我的记录」的该条记录下补传。
 */
export function attachPendingPhotosToConsult(consultId: number) {
  const list = loadPendingPhotos()
  let changed = false
  for (const p of list) {
    if (p.consultId == null) {
      p.consultId = consultId
      changed = true
    }
  }
  if (changed)
    savePendingPhotos(list)
}

/** 某条咨询记录的待补传照片（我的记录页展示「未上传」标记） */
export function pendingPhotosForConsult(consultId: number): PendingPhoto[] {
  return loadPendingPhotos().filter(p => p.consultId === consultId)
}

/** 未关联咨询记录的队列条目：上次文字未提交成功（或选完图没提交），进入咨询页时恢复到表单 */
export function pendingFormPhotos(): PendingPhoto[] {
  return loadPendingPhotos().filter(p => p.consultId == null)
}
