import { join } from 'node:path'

/**
 * 旧上传目录（issue #16）：新上传的文件已改存数据库（UploadFile 表，见 admin-config 上传接口），
 * 这里只用于继续提供改造前存在磁盘上的文件。默认 <server>/uploads；Docker 部署通过 UPLOAD_DIR 指到持久卷（如 /data/uploads）。
 */
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
