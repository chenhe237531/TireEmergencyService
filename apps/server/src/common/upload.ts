import type { PrismaService } from './prisma.service'
import { genFileName } from './util'
import { BizError } from './response'

/** 允许的图片扩展名白名单（拒绝 svg 防 XSS），5MB 上限 */
const ALLOWED = new Set(['jpg', 'jpeg', 'png', 'webp'])
const MAX_SIZE = 5 * 1024 * 1024

/**
 * 保存上传图片到数据库（UploadFile 表，云托管磁盘易失）。
 * 访问路径 /uploads/<name>（main.ts 提供读取路由）。两端（小程序 / 后台）共用。
 */
export async function saveUploadFile(prisma: PrismaService, file: Express.Multer.File, createdBy: string) {
  if (!file) throw new BizError(40020, '请选择要上传的图片')
  const ext = (file.originalname.split('.').pop() || '').toLowerCase()
  if (!ALLOWED.has(ext)) throw new BizError(40020, '仅支持 jpg / png / webp 图片')
  if (file.size > MAX_SIZE) throw new BizError(40020, '图片不能超过 5MB')
  const name = genFileName(file.originalname)
  await prisma.uploadFile.create({ data: { name, mime: file.mimetype, size: file.size, data: file.buffer, createdBy } })
  return { url: `/uploads/${name}`, size: file.size }
}
