#!/usr/bin/env node
/**
 * 拉取开源图形资源（彩色图标）到 src/icons/graphics/。
 *
 * 为什么需要这个脚本：
 *   项目的小程序端图形全部走 UnoCSS 图标集（`i-<set>-<name>` 类名），构建时被内联成
 *   CSS 里的 SVG data URI。彩色图形的关键前提是——**SVG 内不能出现 currentColor**，
 *   否则 UnoCSS 会判定为 mask 模式（单色遮罩），彩色信息会被丢掉。
 *   本脚本拉取的 fluent-emoji-flat 全是硬编码 fill 的彩色 SVG，因此自动走 bg 模式。
 *
 * 为什么落在 src/icons/ 而不是 src/static/：
 *   src/static/ 下的文件会被 uni-app **全量拷贝**进产物，导致同一份图形既进 CSS 又进包，
 *   体积翻倍。src/icons/ 只作为构建期素材被 UnoCSS 读取，未被使用的图标不进产物。
 *
 * 用法：
 *   node ./scripts/fetch-graphics.js          # 增量补齐缺失图标
 *   node ./scripts/fetch-graphics.js --force  # 全量重下（源更新时用）
 *
 * 许可：
 *   fluent-emoji-flat → MIT (Microsoft Fluent Emoji)，可商用、无需署名、无传染性。
 *   详见 src/icons/graphics/LICENSE.md
 */

import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT_DIR = join(ROOT, 'src/icons/graphics')

/** 图标集（prefix → 许可信息），新增来源时在此登记 */
const SETS = {
  'fluent-emoji-flat': {
    title: 'Microsoft Fluent Emoji (Flat)',
    license: 'MIT',
    licenseUrl: 'https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE',
    attributionRequired: false,
  },
}

/**
 * 清单：本地语义名 → 源图标
 * 本地命名规则 `{域}-{语义}`，页面只引用本地名。
 * 这样将来换图标源或换风格时，页面代码零改动。
 */
const MANIFEST = {
  // ── 六维（肌肤 / 体型 / 轮廓 / 体能 / 体态 / 心灵），见 xj/utils.ts 的 DIMS ──
  'dim-skin': 'fluent-emoji-flat:droplet',
  'dim-shape': 'fluent-emoji-flat:flexed-biceps',
  'dim-contour': 'fluent-emoji-flat:gem-stone',
  'dim-fitness': 'fluent-emoji-flat:high-voltage',
  'dim-posture': 'fluent-emoji-flat:balance-scale',
  'dim-mind': 'fluent-emoji-flat:relieved-face',

  // ── 成就徽章（坚持 / 探索 / 分享三组）──
  'badge-trophy': 'fluent-emoji-flat:trophy',
  'badge-medal-gold': 'fluent-emoji-flat:1st-place-medal',
  'badge-medal-honor': 'fluent-emoji-flat:military-medal',
  'badge-star': 'fluent-emoji-flat:glowing-star',
  'badge-fire': 'fluent-emoji-flat:fire',
  'badge-crown': 'fluent-emoji-flat:crown',
  'badge-clover': 'fluent-emoji-flat:four-leaf-clover',

  // ── 互动玩法（签到 / 盲盒 / 转盘 / 集章 / 周报）──
  'play-gift': 'fluent-emoji-flat:wrapped-gift',
  'play-celebrate': 'fluent-emoji-flat:party-popper',
  'play-wand': 'fluent-emoji-flat:magic-wand',
  'play-ball': 'fluent-emoji-flat:crystal-ball',
  'play-dice': 'fluent-emoji-flat:game-die',
  'play-ticket': 'fluent-emoji-flat:ticket',
  'play-balloon': 'fluent-emoji-flat:balloon',
  'play-sparkle': 'fluent-emoji-flat:sparkles',
  'play-ring': 'fluent-emoji-flat:ring',

  // ── 健康行为与状态（营养 / 用药 / 体征 / 作息 / 完成）──
  'care-salad': 'fluent-emoji-flat:green-salad',
  'care-pill': 'fluent-emoji-flat:pill',
  'care-stethoscope': 'fluent-emoji-flat:stethoscope',
  'care-moon': 'fluent-emoji-flat:crescent-moon',
  'care-sun': 'fluent-emoji-flat:sun',
  'care-bell': 'fluent-emoji-flat:bell',
  'care-wait': 'fluent-emoji-flat:hourglass-not-done',
  'care-done': 'fluent-emoji-flat:check-mark-button',
  'care-cross': 'fluent-emoji-flat:cross-mark',
  'care-warn': 'fluent-emoji-flat:warning',
  'care-heart': 'fluent-emoji-flat:heart-with-ribbon',
  'care-up': 'fluent-emoji-flat:chart-increasing',
  'care-chart': 'fluent-emoji-flat:bar-chart',
  'care-seed': 'fluent-emoji-flat:seedling',

  // ── 沟通 / 门店 / 文档 ──
  'talk-bubble': 'fluent-emoji-flat:speech-balloon',
  'talk-megaphone': 'fluent-emoji-flat:megaphone',
  'store-bag': 'fluent-emoji-flat:shopping-bags',
  'store-house': 'fluent-emoji-flat:house',
  'doc-memo': 'fluent-emoji-flat:memo',
  'doc-calendar': 'fluent-emoji-flat:calendar',
  'doc-scroll': 'fluent-emoji-flat:scroll',

  // ── 情绪 / 人格化（小镜对话、反馈）──
  'mood-smile': 'fluent-emoji-flat:grinning-face-with-smiling-eyes',
  'mood-love': 'fluent-emoji-flat:smiling-face-with-hearts',
  'mood-think': 'fluent-emoji-flat:thinking-face',
  'mood-hug': 'fluent-emoji-flat:hugging-face',
}

const API = 'https://api.iconify.design'
const UA = 'XueJiMeiYe-graphics-fetcher/1.0 (+build-time asset fetch)'

async function fetchSet(prefix, names) {
  const url = `${API}/${prefix}.json?icons=${encodeURIComponent(names.join(','))}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok)
    throw new Error(`拉取 ${prefix} 失败：HTTP ${res.status}`)
  return res.json()
}

async function main() {
  const force = process.argv.includes('--force')
  await mkdir(OUT_DIR, { recursive: true })

  // 按集合归并请求，减少网络往返
  const byPrefix = new Map()
  for (const [local, src] of Object.entries(MANIFEST)) {
    const [prefix, name] = src.split(':')
    if (!byPrefix.has(prefix))
      byPrefix.set(prefix, [])
    byPrefix.get(prefix).push({ local, name })
  }

  const records = []
  let written = 0
  let skipped = 0

  for (const [prefix, items] of byPrefix) {
    const set = SETS[prefix]
    if (!set)
      throw new Error(`未登记的图标集：${prefix}（请先在 SETS 里补充许可信息）`)

    const data = await fetchSet(prefix, items.map(i => i.name))
    const missing = data.not_found || []
    if (missing.length)
      console.warn(`  ⚠ ${prefix} 中不存在的图标：${missing.join(', ')}`)

    for (const { local, name } of items) {
      const icon = data.icons?.[name]
      if (!icon) {
        console.warn(`  ⚠ 跳过 ${local}（源图标 ${prefix}:${name} 不存在）`)
        continue
      }
      const w = icon.width || 24
      const h = icon.height || 24
      // 补全 xmlns 与 viewBox：小程序端 CSS background-image 的 SVG data URI 必须自带
      // 命名空间才能被正确解析；同时显式声明尺寸，避免部分机型按 0 尺寸丢弃。
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${icon.body}</svg>`

      const file = join(OUT_DIR, `${local}.svg`)
      const bytes = Buffer.byteLength(svg)
      records.push({
        file: `${local}.svg`,
        source: `${prefix}:${name}`,
        set: prefix,
        license: set.license,
        bytes,
      })

      if (!force) {
        try {
          const old = await readFile(file, 'utf8')
          if (old === svg) {
            skipped++
            continue
          }
        }
        catch { /* 文件不存在，继续写 */ }
      }
      await writeFile(file, svg, 'utf8')
      written++
    }
  }

  // 顺带删除清单外的旧文件，避免残留素材混淆
  const { readdir, unlink } = await import('node:fs/promises')
  const known = new Set(records.map(r => r.file))
  for (const f of await readdir(OUT_DIR)) {
    if (f.endsWith('.svg') && !known.has(f)) {
      await unlink(join(OUT_DIR, f))
      console.log(`  − 清理无主文件 ${f}`)
    }
  }

  records.sort((a, b) => a.file.localeCompare(b.file))
  const total = records.reduce((s, r) => s + r.bytes, 0)

  await writeFile(
    join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: '由 scripts/fetch-graphics.js 生成，请勿手改。用于审计图形来源与许可。',
        totalBytes: total,
        count: records.length,
        icons: records,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(`\n图形资源：共 ${records.length} 个，源文件合计 ${(total / 1024).toFixed(1)} KB`)
  console.log(`  新写入 ${written} 个，未变 ${skipped} 个，输出目录 src/icons/graphics/`)

  const bySet = {}
  for (const r of records)
    bySet[r.set] = (bySet[r.set] || 0) + r.bytes
  for (const [s, b] of Object.entries(bySet))
    console.log(`  · ${s.padEnd(20)} ${(b / 1024).toFixed(1)} KB  (${SETS[s].license})`)

  const heavy = records.filter(r => r.bytes > 2500)
  if (heavy.length) {
    console.log(`\n体积偏大的图标（内联进 CSS 前请留意）：`)
    for (const h of heavy.sort((a, b) => b.bytes - a.bytes))
      console.log(`  · ${h.file.padEnd(24)} ${(h.bytes / 1024).toFixed(1)} KB ← ${h.source}`)
  }
}

main().catch((err) => {
  console.error(`\n失败：${err.message}`)
  process.exit(1)
})
