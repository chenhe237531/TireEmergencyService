/**
 * phone 可空唯一约束的数据迁移（issue #3 / ADR-0002）。
 *
 * 用法：node prisma/db.js normalize-phones   （先备份数据库！）
 *
 * 为什么不能直接 db:push：历史库里 phone 存在多个空串（旧默认值）与重复手机号，
 * 直接加唯一索引会失败。脚本分三步：
 *   1. 推「过渡 schema」：phone 改为可空但暂不加 @unique（只改列与新表，不动索引）
 *   2. 数据修复：空串 → NULL；重复手机号按 ADR-0002 合并
 *      （保留创建时间更早者为主账号，迁移救援工单/咨询/浏览痕迹，写 DriverMergeLog）
 *   3. 推最终 schema：补上 phone 唯一索引
 *
 * 脚本可重复执行：空串与重复手机号清零后，再跑一遍是 no-op。
 * 生产请在低峰期执行（步骤 1-3 之间有短暂窗口 phone 无唯一约束保护，
 * 期间业务写入由 bindPhone / smsLogin 的应用层查重兜底）。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { mergeDrivers } from '../src/common/driver-merge'

const PRISMA_DIR = join(__dirname)
const ACTIVE_SCHEMA = process.env.DB_PROVIDER === 'mysql'
  ? join(PRISMA_DIR, 'schema.mysql.prisma')
  : join(PRISMA_DIR, 'schema.prisma')
const TMP_SCHEMA = join(PRISMA_DIR, 'schema.normalize-tmp.prisma')

function prismaPush(schema: string, acceptDataLoss = false) {
  const args = ['prisma', 'db', 'push', '--skip-generate', '--schema', schema]
  // 最终推送要补 phone 唯一索引，Prisma 对加索引一律告警「可能丢数据」；
  // 走到这一步时数据已在步骤 2 去重，可安全接受
  if (acceptDataLoss) args.push('--accept-data-loss')
  const r = spawnSync('npx', args, {
    cwd: join(PRISMA_DIR, '..'),
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })
  if (r.status !== 0) throw new Error(`[normalize-phones] db push 失败（${schema}）`)
}

/** 生成过渡 schema：仅去掉 Driver.phone 上的 @unique，其余与当前 schema 一致 */
function writeTmpSchema() {
  const src = readFileSync(ACTIVE_SCHEMA, 'utf8')
  const out = src.replace(/^(\s*phone\s+String\?\s+)@unique(\s.*)?$/m, '$1$2')
  if (out === src) throw new Error('[normalize-phones] 没找到 phone String? @unique 行，schema 可能已迁移过')
  writeFileSync(TMP_SCHEMA, out)
  return TMP_SCHEMA
}

async function main() {
  console.log('[normalize-phones] 步骤 1/3：推送过渡 schema（phone 可空、暂无唯一索引）')
  writeTmpSchema()
  try {
    prismaPush(TMP_SCHEMA)

    console.log('[normalize-phones] 步骤 2/3：修复历史数据')
    const prisma = new PrismaClient()
    try {
      // 2a. 空串 → NULL（多个 NULL 不违反唯一约束）
      const emptied = await prisma.driver.updateMany({ where: { phone: '' }, data: { phone: null } })
      if (emptied.count) console.log(`[normalize-phones] 空手机号置 NULL：${emptied.count} 条`)

      // 2b. 重复手机号合并：同组内保留创建时间最早者（mergeDrivers 内部规则）
      const groups = await prisma.driver.groupBy({
        by: ['phone'],
        where: { phone: { not: null }, status: { not: 'merged' } },
        _count: { _all: true },
        having: { phone: { _count: { gt: 1 } } },
      })
      for (const g of groups) {
        const phone = g.phone as string
        const drivers = await prisma.driver.findMany({
          where: { phone, status: { not: 'merged' } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        })
        const [keep, ...losers] = drivers
        for (const loser of losers) {
          await mergeDrivers(prisma, { aId: keep.id, bId: loser.id, phone, reason: 'data-migration' })
          console.log(`[normalize-phones] 合并：司机 #${loser.id} → #${keep.id}（${phone}）`)
        }
      }
      if (!groups.length) console.log('[normalize-phones] 无重复手机号需要合并')
    }
    finally {
      await prisma.$disconnect()
    }

    console.log('[normalize-phones] 步骤 3/3：推送最终 schema（phone 唯一索引）')
    prismaPush(ACTIVE_SCHEMA, true)
  }
  finally {
    rmSync(TMP_SCHEMA, { force: true })
  }
  console.log('[normalize-phones] 完成。合并明细见 DriverMergeLog（reason=data-migration）。')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
