import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

// 数据库开关（DB_PROVIDER=sqlite / mysql）与连接串解析，和 prisma/db.js 共用；src 与 dist 下相对路径相同
const { applyDbEnv, loadDotEnv } = require('../../prisma/db-env')

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    loadDotEnv()
    super({ datasourceUrl: applyDbEnv().url })
  }

  async onModuleInit() {
    await this.$connect()
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
