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

const COMMANDS = ['generate', 'push', 'seed', 'init', 'reset', 'schema']

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
      prisma(['db', 'push', '--skip-generate'], schema)
      break
    case 'seed':
      tsNode('prisma/seed.ts')
      break
    case 'init':
      await withInitLock(provider, url, async () => {
        prisma(['db', 'push', '--skip-generate'], schema)
        // seed 内部按表幂等补齐：生产只保证管理员/设置/FAQ，演示数据由 SEED_DEMO 控制
        tsNode('prisma/seed.ts')
      })
      break
    case 'reset':
      if (provider === 'sqlite') {
        // SQLite 相对路径以 schema 所在目录为基准
        const file = url.slice('file:'.length)
        rmSync(isAbsolute(file) ? file : join(__dirname, file), { force: true })
        prisma(['db', 'push', '--skip-generate'], schema)
      } else {
        prisma(['db', 'push', '--skip-generate', '--force-reset'], schema)
      }
      tsNode('prisma/seed.ts')
      break
  }
}

main().catch(e => {
  console.error(e.message || e)
  process.exit(1)
})
