import 'reflect-metadata'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import express from 'express'
import { AppModule } from './app.module'
import { PrismaService } from './common/prisma.service'
import { AllExceptionsFilter, ResponseInterceptor } from './common/response'
import { UPLOAD_DIR } from './common/upload-dir'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true })
  app.setGlobalPrefix('api/v1')
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useBodyParser('json', { limit: '10mb' })

  // 部署时同进程托管前端静态资源：/h5 → 小程序 H5 版，/ → 管理后台
  const root = process.env.WEB_ROOT || join(__dirname, '..', '..')
  const h5 = join(root, 'miniapp', 'dist', 'build', 'h5')
  const admin = join(root, 'admin', 'dist')
  const server = app.getHttpAdapter().getInstance()
  // 上传文件存数据库（UploadFile）；早期存在磁盘 UPLOAD_DIR 的旧文件继续可访问
  const prisma = app.get(PrismaService)
  server.get('/uploads/:name', async (req, res, next) => {
    try {
      const f = await prisma.uploadFile.findUnique({ where: { name: req.params.name } })
      if (!f) return next()
      res.set({ 'Content-Type': f.mime, 'Content-Length': String(f.size), 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
      res.end(Buffer.from(f.data))
    }
    catch (e) {
      next(e)
    }
  })
  server.use('/uploads', express.static(UPLOAD_DIR))
  if (existsSync(h5)) {
    server.use('/h5', express.static(h5))
    server.get(/^\/h5(\/.*)?$/, (_req, res) => res.sendFile(join(h5, 'index.html')))
  }
  if (existsSync(admin)) {
    server.use(express.static(admin))
  }

  const port = Number(process.env.PORT || 3100)
  await app.listen(port, '0.0.0.0')
  console.log(`[tire] 小蚂蚁轮胎救援 api ready on http://localhost:${port}/api/v1`)
}
bootstrap()
