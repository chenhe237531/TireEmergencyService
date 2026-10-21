/**
 * 数据库开关：本地 SQLite / 云上 MySQL（微信云托管）
 *
 * DB_PROVIDER=sqlite | mysql，未设置时按 DATABASE_URL 推断（mysql:// 开头即 MySQL），都没有则默认 SQLite。
 * MySQL 连接串优先用 DATABASE_URL；没有时用微信云托管注入的 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD 拼接，
 * 库名取 MYSQL_DATABASE（默认 tire）。
 *
 * 供 prisma/db.js（命令行）与 PrismaService（运行时）共用，保持纯 CommonJS 以便 ts-node 与编译产物都能直接 require。
 */
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const SERVER_DIR = join(__dirname, '..')

/** 读取 apps/server/.env（已存在的环境变量优先，不会被覆盖） */
function loadDotEnv() {
  const file = join(SERVER_DIR, '.env')
  if (existsSync(file)) process.loadEnvFile(file)
}

function resolveProvider(env = process.env) {
  const p = (env.DB_PROVIDER || '').trim().toLowerCase()
  if (p) {
    if (p !== 'sqlite' && p !== 'mysql') throw new Error(`[db] DB_PROVIDER 只支持 sqlite / mysql，当前为 "${env.DB_PROVIDER}"`)
    return p
  }
  if (/^mysql:\/\//.test(env.DATABASE_URL || '')) return 'mysql'
  if (!env.DATABASE_URL && env.MYSQL_ADDRESS) return 'mysql'
  return 'sqlite'
}

function resolveUrl(provider, env = process.env) {
  const url = env.DATABASE_URL || ''
  if (provider === 'sqlite') {
    if (url && !url.startsWith('file:')) throw new Error('[db] DB_PROVIDER=sqlite 时 DATABASE_URL 必须以 file: 开头')
    return url || 'file:./tire.db'
  }
  if (url.startsWith('mysql://')) return url
  if (env.MYSQL_ADDRESS) {
    const user = encodeURIComponent(env.MYSQL_USERNAME || 'root')
    const pass = env.MYSQL_PASSWORD ? `:${encodeURIComponent(env.MYSQL_PASSWORD)}` : ''
    const db = encodeURIComponent(env.MYSQL_DATABASE || 'tire')
    return `mysql://${user}${pass}@${env.MYSQL_ADDRESS}/${db}`
  }
  throw new Error('[db] DB_PROVIDER=mysql 时需要 DATABASE_URL=mysql://… 或微信云托管的 MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD')
}

/** 解析并写回 process.env（DB_PROVIDER、DATABASE_URL），返回 { provider, url } */
function applyDbEnv() {
  const provider = resolveProvider()
  const url = resolveUrl(provider)
  process.env.DB_PROVIDER = provider
  process.env.DATABASE_URL = url
  return { provider, url }
}

module.exports = { SERVER_DIR, loadDotEnv, resolveProvider, resolveUrl, applyDbEnv }
