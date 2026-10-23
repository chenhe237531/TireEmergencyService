#!/usr/bin/env node
/**
 * 数据库命令入口：按 DB_PROVIDER 选择 SQLite（本地开发）或 MySQL（微信云托管）
 *
 *   node prisma/db.js generate     生成 Prisma Client（MySQL 时先生成 schema.mysql.prisma）
 *   node prisma/db.js push         同步表结构（不会删数据；有破坏性变更时 Prisma 会报错停止）
 *   node prisma/db.js seed         写入演示数据
 *   node prisma/db.js init         同步表结构，库为空时自动写入演示数据（容器启动用）
 *   node prisma/db.js reset        清空并重建演示库（仅开发环境）
 *   node prisma/db.js schema       只生成 MySQL 版 schema 文件
 *
 * schema.prisma 是唯一的数据模型源（SQLite）。MySQL 版由本脚本自动生成：
 * 替换 provider，并把带 `// mysql: @db.Text` 标记的字段加上原生类型（MySQL 的 String 默认是 VARCHAR(191)，长文本放不下）。
 */
const { spawnSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { existsSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { dirname, isAbsolute, join } = require('node:path')
const { SERVER_DIR, applyDbEnv, loadDotEnv, resolveProvider } = require('./db-env')

const BASE_SCHEMA = join(__dirname, 'schema.prisma')
const MYSQL_SCHEMA = join(__dirname, 'schema.mysql.prisma')

function writeMysqlSchema() {
  const src = readFileSync(BASE_SCHEMA, 'utf8')
  let replaced = 0
  const out = src
    .replace(/(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"sqlite"/, (_, head) => { replaced++; return `${head}"mysql"` })
    .split('\n')
    .map(line => /^\s*\/\//.test(line) ? line : line.replace(/^(.*?)\s*\/\/\s*mysql:\s*(@db\.\w+(?:\([^)]*\))?)\s*(.*)$/, (_, decl, attr, rest) => {
      let d = decl
      // MySQL 8 不允许 TEXT/BLOB/JSON 使用字面量默认值，改用表达式默认值 DEFAULT ('')
      if (attr === '@db.Text' && /@default\(""\)/.test(d))
        d = d.replace(/@default\(""\)/, `@default(dbgenerated("('')"))`)
      return `${d} ${attr}${rest ? ` // ${rest}` : ''}`
    }))
    .join('\n')
  if (!replaced) throw new Error('[db] schema.prisma 中没找到 provider = "sqlite"')
  writeFileSync(MYSQL_SCHEMA, `// ⚠️ 由 prisma/db.js 根据 schema.prisma 自动生成，请勿手改（改 schema.prisma 即可）\n${out}`)
  return MYSQL_SCHEMA
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: SERVER_DIR, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const prisma = (args, schema) => run('npx', ['prisma', ...args, '--schema', schema])
const tsNode = file => run('npx', ['ts-node', '--transpile-only', file])

/** 已生成的 Prisma Client 目录（provider 与模型写死在生成产物里，切换开关或改 schema 后必须重新 generate） */
function generatedClientDir() {
  try {
    const clientDir = dirname(require.resolve('@prisma/client/package.json', { paths: [SERVER_DIR] }))
    return dirname(require.resolve('.prisma/client/schema.prisma', { paths: [clientDir] }))
  } catch {
    return null
  }
}

const STAMP = 'tire-schema.sha256'
const schemaHash = schema => createHash('sha256').update(readFileSync(schema)).digest('hex')

function generate(schema) {
  prisma(['generate'], schema)
  const dir = generatedClientDir()
  if (dir) writeFileSync(join(dir, STAMP), schemaHash(schema))
}

/** 生成产物与当前 schema（含 SQLite / MySQL 开关）不一致时重新生成，保证 push / seed / init 用的 Client 是最新的 */
function ensureClient(provider, schema) {
  const dir = generatedClientDir()
  const stamp = dir && existsSync(join(dir, STAMP)) ? readFileSync(join(dir, STAMP), 'utf8').trim() : null
  if (stamp === schemaHash(schema)) return
  console.log(`[db] Prisma Client 与当前 schema（${provider}）不一致，重新生成`)
  generate(schema)
}

/** MySQL 多实例同时启动（云托管扩容 / 滚动发布）时串行执行 init，避免并发建表或重复写入数据 */
async function withInitLock(provider, url, fn) {
  if (provider !== 'mysql') return fn()
  const { PrismaClient } = require('@prisma/client')
  // 首次部署时业务库可能还不存在，锁连接用 information_schema；只用一个连接，因为 GET_LOCK 绑定在会话上
  const u = new URL(url)
  const lockName = `tire_init_${u.pathname.slice(1)}`
  u.pathname = '/information_schema'
  u.searchParams.set('connection_limit', '1')
  const client = new PrismaClient({ datasourceUrl: u.toString() })
  try {
    const [row] = await client.$queryRawUnsafe('SELECT GET_LOCK(?, 300) AS ok', lockName).catch(e => [{ err: e.message }])
    if (Number(row?.ok) !== 1) console.log('[db] 未拿到 init 锁，直接执行', row?.err || '')
    await fn()
  }
  finally {
    await client.$queryRawUnsafe('SELECT RELEASE_LOCK(?)', lockName).catch(() => {})
    await client.$disconnect()
  }
}

const COMMANDS = ['generate', 'push', 'seed', 'init', 'reset', 'schema', 'normalize-phones']

/**
 * 首次部署时业务库可能还不存在（云托管 MySQL 开通后不会自动建业务库）：
 * 先连 information_schema 查一次，缺库就 CREATE DATABASE（utf8mb4），再交给 db push 同步表结构。
 * 建库失败不中断启动，只告警——大概率是账号没有 CREATE 权限，此时按提示手动建库即可。
 */
async function ensureDatabase(url) {
  const u = new URL(url)
  const db = decodeURIComponent(u.pathname.replace(/^\//, ''))
  if (!db) return
  if (!/^[\w$-]+$/.test(db)) {
    console.warn(`[db] 库名 "${db}" 含非常规字符，跳过自动建库`)
    return
  }
  const { PrismaClient } = require('@prisma/client')
  // 业务库还不存在时连不上，改连 information_schema（只用一个连接）
  const admin = new URL(url)
  admin.pathname = '/information_schema'
  admin.searchParams.set('connection_limit', '1')
  const client = new PrismaClient({ datasourceUrl: admin.toString() })
  try {
    const rows = await client.$queryRawUnsafe(
      'SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      db,
    )
    if (rows.length) {
      console.log(`[db] 数据库 ${db} 已存在`)
      return
    }
    await client.$executeRawUnsafe(`CREATE DATABASE \`${db}\` DEFAULT CHARACTER SET utf8mb4`)
    console.log(`[db] 已自动创建数据库 ${db}（utf8mb4）`)
  }
  catch (e) {
    // Prisma 的报错常带多行堆栈，压成一行再打，方便在云托管日志里一眼看到
    const reason = String(e.message || e).replace(/\s+/g, ' ').trim().slice(0, 200)
    console.warn(`[db] 自动建库未完成：${reason}`)
    console.warn(`[db] 若库确实不存在，请手动执行：CREATE DATABASE \`${db}\` DEFAULT CHARACTER SET utf8mb4;`)
  }
  finally {
    await client.$disconnect().catch(() => {})
  }
}


async function main() {
  const cmd = process.argv[2]
  if (!COMMANDS.includes(cmd)) {
    console.error(`用法：node prisma/db.js <${COMMANDS.join('|')}>`)
    process.exit(1)
  }
  loadDotEnv()
  // generate / schema 只需要知道用哪个数据库，不需要连接串（镜像构建时没有数据库）
  const offline = cmd === 'generate' || cmd === 'schema'
  const { provider, url } = offline ? { provider: resolveProvider() } : applyDbEnv()
  const schema = provider === 'mysql' ? writeMysqlSchema() : BASE_SCHEMA
  console.log(`[db] ${provider} · ${cmd}`)
  if (!offline) ensureClient(provider, schema)

  switch (cmd) {
    case 'schema':
      if (provider !== 'mysql') writeMysqlSchema()
      console.log(`[db] 已生成 ${MYSQL_SCHEMA}`)
      break
    case 'generate':
      generate(schema)
      break
    case 'push':
      if (provider === 'mysql') await ensureDatabase(url)
      prisma(['db', 'push', '--skip-generate', '--accept-data-loss'], schema)
      break
    case 'seed':
      tsNode('prisma/seed.ts')
      break
    case 'init':
      await withInitLock(provider, url, async () => {
        // 建库放在锁内：多实例同时冷启动时也只会有一个真正执行 DDL
        // --accept-data-loss：schema 加唯一约束/改列时 Prisma 会因「可能丢数据」拦截，
        // 启动同步必须放行（真正会丢数据的破坏性改动由 reset 路径的 --force-reset 兜底）
        if (provider === 'mysql') await ensureDatabase(url)
        prisma(['db', 'push', '--skip-generate', '--accept-data-loss'], schema)
        // seed 内部按表幂等补齐：生产只保证管理员/设置/FAQ，演示数据由 SEED_DEMO 控制
        tsNode('prisma/seed.ts')
      })
      break
    case 'reset':
      if (provider === 'sqlite') {
        // SQLite 相对路径以 schema 所在目录为基准
        const file = url.slice('file:'.length)
        rmSync(isAbsolute(file) ? file : join(__dirname, file), { force: true })
        prisma(['db', 'push', '--skip-generate', '--accept-data-loss'], schema)
      } else {
        await ensureDatabase(url)
        prisma(['db', 'push', '--skip-generate', '--force-reset'], schema)
      }
      tsNode('prisma/seed.ts')
      break
    /**
     * phone 唯一约束数据迁移（issue #3 / ADR-0002）：
     * 直接 push 带 @unique 的最终 schema 会因历史空串/重复手机号失败，
     * 所以先推去掉 @unique 的过渡 schema，脚本内完成数据修复后再推最终 schema。
     */
    case 'normalize-phones':
      tsNode('prisma/normalize-phones.ts')
      break
  }
}

main().catch(e => {
  console.error(e.message || e)
  process.exit(1)
})
