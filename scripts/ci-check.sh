#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# 小蚂蚁 · 小程序 CI 校验入口（三段式：lint → build → 产物断言）
#
# 用法：
#   bash scripts/ci-check.sh                  # 全量：lint(改动文件) → build → 产物断言
#   bash scripts/ci-check.sh <file...>        # 指定改动文件（覆盖 git 自动探测）
#   bash scripts/ci-check.sh --lint-only      # 仅 lint 段（等价 pnpm lint:changed）
#   bash scripts/ci-check.sh --build-only     # 仅 build 段
#   bash scripts/ci-check.sh --assert-only    # 仅产物断言段（用现有 dist）
#
# 退出码：0 = 全部通过；非 0 = 存在失败段。
#   lint=2 / build=3 / assert=4
#
# 设计要点：
#   · lint 段只校验「本轮改动的小程序文件」：warning 不阻断，error 才失败。
#   · build 段以「产物是否在本次构建中刷新」判定成败，避免旧产物冒充成功。
#   · 产物断言段检查：app.json 的 pages 均生成 wxml、usingComponents 路径可解析、
#     tabBar 页面与页面文件一致。
# ══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MINI="$ROOT/apps/miniapp"
DIST="$MINI/dist/build/mp-weixin"
ESLINT_CONFIG="$MINI/eslint.config.mjs"
NODE="${NODE:-node}"

# 解析 eslint 二进制（mini bin 优先，root bin 兜底）
if [ -x "$MINI/node_modules/.bin/eslint" ]; then
  ESLINT_BIN="$MINI/node_modules/.bin/eslint"
elif [ -x "$ROOT/node_modules/.bin/eslint" ]; then
  ESLINT_BIN="$ROOT/node_modules/.bin/eslint"
else
  ESLINT_BIN="eslint"
fi

MODE="all"
FILES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --lint-only)   MODE="lint"; shift ;;
    --build-only)  MODE="build"; shift ;;
    --assert-only) MODE="assert"; shift ;;
    -h|--help)     sed -n '2,28p' "$0"; exit 0 ;;
    --*)           echo "未知参数: $1" >&2; exit 64 ;;
    *)             FILES+=("$1"); shift ;;
  esac
done

# ── 颜色 / 分隔（无 tty 降级） ──────────────────────────────────────────────
if [ -t 1 ]; then
  C_HDR="\033[1;36m"; C_OK="\033[32m"; C_WARN="\033[33m"; C_ERR="\033[31m"; C_RST="\033[0m"; C_DIM="\033[2m"
else
  C_HDR=""; C_OK=""; C_WARN=""; C_ERR=""; C_RST=""; C_DIM=""
fi
hr() { printf "${C_DIM}────────────────────────────────────────────────────────────────${C_RST}\n"; }
section() { hr; printf "${C_HDR}[%s] %s${C_RST}\n" "$1" "$2"; }
ok()    { printf "  ${C_OK}✓ %s${C_RST}\n" "$1"; }
warn()  { printf "  ${C_WARN}⚠ %s${C_RST}\n" "$1"; }
fail()  { printf "  ${C_ERR}✗ %s${C_RST}\n" "$1"; }

GLOBAL_RC=0

# ── 探测改动文件 ───────────────────────────────────────────────────────────
# 输出：apps/miniapp 下、可 lint 后缀、且存在的文件绝对路径（去重）
resolve_changed_files() {
  local raw="" line abs
  if [ "${#FILES[@]}" -gt 0 ]; then
    for f in "${FILES[@]}"; do
      case "$f" in /*) abs="$f" ;; *) abs="$ROOT/$f" ;; esac
      raw="$raw$abs"$'\n'
    done
  else
    raw="$raw$(cd "$ROOT" && git diff --name-only --diff-filter=d HEAD 2>/dev/null)"$'\n'
    raw="$raw$(cd "$ROOT" && git ls-files --others --exclude-standard 2>/dev/null)"$'\n'
  fi
  local prefix="$MINI/"
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in /*) : ;; *) line="$ROOT/$line" ;; esac
    case "$line" in "$prefix"*) : ;; *) continue ;; esac
    case "$line" in *.js|*.mjs|*.cjs|*.ts|*.tsx|*.vue|*.jsx) : ;; *) continue ;; esac
    [ -f "$line" ] || continue
    printf '%s\n' "$line"
  done <<< "$raw" | sort -u
}

# ═══════════════════════════════════════════════════════════════════════════════
# 段 1 · Lint（仅改动文件；error 阻断，warning 提示）
# ════════════════════════════════════════════════════════════════════════════
run_lint() {
  section 1 "Lint · 改动文件"

  local changed
  changed="$(resolve_changed_files)"
  if [ -z "$changed" ]; then
    ok "无改动文件需要 lint（lint-clean）"
    return 0
  fi

  local count
  count="$(printf "%s\n" "$changed" | wc -l | tr -d ' ')"
  printf "  改动 lint 文件数：%s\n" "$count"

  local tmp errlog
  tmp="$(mktemp -t tire-lint.XXXXXX.json)"
  errlog="$(mktemp -t tire-eslint-err.XXXXXX)"
  "$ESLINT_BIN" --config "$ESLINT_CONFIG" -f json $changed > "$tmp" 2> "$errlog"
  if [ ! -s "$tmp" ]; then
    if [ -s "$errlog" ]; then
      fail "eslint 运行出错："
      sed 's/^/      /' "$errlog"
    else
      fail "eslint 未产出结果"
    fi
    rm -f "$tmp" "$errlog"
    return 2
  fi
  rm -f "$errlog"

  local out
  out="$("$NODE" --input-type=module -e '
import { readFileSync } from "node:fs"
import path from "node:path"
const [jsonPath, miniRoot] = [process.argv[1], process.argv[2]]
const reports = JSON.parse(readFileSync(jsonPath, "utf8"))
const errors = [], warnings = []
for (const f of reports) {
  const rel = path.relative(miniRoot, f.filePath).replace(/\\/g, "/")
  for (const m of f.messages) {
    const row = { rel, line: m.line || 0, col: m.column || 0, rule: m.ruleId || "unknown", msg: (m.message || "").replace(/\s+/g, " ") }
    if (m.severity === 2) errors.push(row)
    else if (m.severity === 1) warnings.push(row)
  }
}
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", RST = "\x1b[0m"
if (warnings.length) console.log("  " + YELLOW + "⚠ " + warnings.length + " 处 warning（不阻断）" + RST)
if (errors.length === 0) {
  console.log("  " + GREEN + "✓ 改动文件无 lint error" + RST)
  process.exit(0)
}
console.log("  " + RED + "✗ 检出 " + errors.length + " 处 lint error：" + RST)
for (const p of errors.slice(0, 40)) console.log("    " + p.rel + ":" + p.line + ":" + p.col + "  " + p.rule + "  " + p.msg)
if (errors.length > 40) console.log("    … 另有 " + (errors.length - 40) + " 处")
process.exit(1)
' "$tmp" "$MINI" 2>&1)"
  local rc=$?
  rm -f "$tmp"
  printf "%s\n" "$out"
  [ "$rc" -eq 0 ] && return 0 || return 2
}

# ══════════════════════════════════════════════════════════════════════════════
# 段 2 · Build（mp-weixin，按产物新鲜度判定）
# ══════════════════════════════════════════════════════════════════════════════
run_build() {
  section 2 "Build · mp-weixin"

  if ! command -v pnpm >/dev/null 2>&1; then
    fail "未找到 pnpm，请先安装 pnpm"
    return 3
  fi

  local appjson="$DIST/app.json"
  local start_ts
  start_ts="$(date +%s)"
  printf "  构建开始：%s\n" "$(date '+%H:%M:%S')"

  local blog
  blog="$(mktemp -t tire-build.XXXXXX.log)"
  (cd "$ROOT" && pnpm --filter tire-miniapp build:mp) > "$blog" 2>&1
  local rc=$?
  printf "  构建结束：%s（耗时 %ss，exit=%s）\n" "$(date '+%H:%M:%S')" "$(( $(date +%s) - start_ts ))" "$rc"

  if [ -f "$appjson" ]; then
    local mts
    mts="$(stat -f %m "$appjson" 2>/dev/null || stat -c %Y "$appjson" 2>/dev/null || echo 0)"
    if [ "$mts" -ge "$start_ts" ]; then
      ok "构建成功，app.json 已刷新"
      rm -f "$blog"
      return 0
    fi
  fi

  fail "构建失败（未产出最新 app.json），构建输出尾部："
  tail -40 "$blog" | sed 's/^/      /'
  rm -f "$blog"
  return 3
}

# ══════════════════════════════════════════════════════════════════════════════
# 段 3 · 产物断言（pages / usingComponents / tabBar）
# ════════════════════════════════════════════════════════════════════════════
run_assert() {
  section 3 "产物断言 · pages / usingComponents / tabBar"

  local appjson="$DIST/app.json"
  if [ ! -f "$appjson" ]; then
    fail "未找到构建产物 $appjson（请先构建：pnpm --filter tire-miniapp build:mp）"
    return 4
  fi

  local out rc
  out="$("$NODE" --input-type=module -e '
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, dirname, resolve, relative } from "node:path"
const dist = process.argv[1]
const GREEN = "\x1b[32m", RED = "\x1b[31m", RST = "\x1b[0m"
const app = JSON.parse(readFileSync(join(dist, "app.json"), "utf8"))
let rc = 0

// 3.1 pages 均生成 wxml
const pages = app.pages || []
const missing = pages.filter(p => !existsSync(join(dist, p + ".wxml")))
if (pages.length === 0) { console.log("  " + RED + "✗ app.json 无 pages" + RST); rc = 4 }
else if (missing.length) { console.log("  " + RED + "✗ " + missing.length + " 个页面缺 wxml：" + missing.join(", ") + RST); rc = 4 }
else console.log("  " + GREEN + "✓ " + pages.length + " 个页面均生成 wxml" + RST)

// 3.2 tabBar 页面必须在 pages 中
const tabPages = (app.tabBar?.list || []).map(i => i.pagePath)
const badTab = tabPages.filter(p => !pages.includes(p))
if (badTab.length) { console.log("  " + RED + "✗ tabBar 页面不在 pages：" + badTab.join(", ") + RST); rc = 4 }
else if (tabPages.length) console.log("  " + GREEN + "✓ tabBar " + tabPages.length + " 个页面均已注册" + RST)

// 3.3 usingComponents 路径可解析
const jsonFiles = []
;(function collect(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) collect(p)
    else if (e.name.endsWith(".json")) jsonFiles.push(p)
  }
})(dist)
let broken = 0, checked = 0
for (const jf of jsonFiles) {
  let cfg
  try { cfg = JSON.parse(readFileSync(jf, "utf8")) } catch { continue }
  for (const [tag, ref] of Object.entries(cfg.usingComponents || {})) {
    const comp = ref.startsWith("/") ? join(dist, ref) : resolve(dirname(jf), ref)
    checked++
    if (![".json", ".wxml", ".js"].some(ext => existsSync(comp + ext))) {
      broken++
      console.log("    " + relative(dist, jf) + " → " + tag + " = " + ref)
    }
  }
}
if (broken) { console.log("  " + RED + "✗ usingComponents 存在不可解析路径 " + broken + " 条" + RST); rc = 4 }
else console.log("  " + GREEN + "✓ usingComponents 路径全部可解析（" + checked + " 条）" + RST)

process.exit(rc)
' "$DIST" 2>&1)"
  rc=$?
  printf "%s\n" "$out"
  [ "$rc" -ne 0 ] && return 4
  return 0
}

# ══════════════════════════════════════════════════════════════════════════════
# 编排
# ══════════════════════════════════════════════════════════════════════════════
printf "${C_HDR}小蚂蚁 · 小程序 CI 校验${C_RST}\n"
printf "  仓库根：%s\n" "$ROOT"
printf "  小程序：%s\n" "$MINI"

case "$MODE" in
  lint)   run_lint   || GLOBAL_RC=$? ;;
  build)  run_build  || GLOBAL_RC=$? ;;
  assert) run_assert || GLOBAL_RC=$? ;;
  all)
    run_lint   || GLOBAL_RC=2
    run_build  || GLOBAL_RC=3
    run_assert || GLOBAL_RC=4
    ;;
esac

hr
if [ "$GLOBAL_RC" -eq 0 ]; then
  printf "${C_OK}✓ CI 校验通过${C_RST}\n"
else
  printf "${C_ERR}✗ CI 校验未通过（失败码 %s）${C_RST}\n" "$GLOBAL_RC"
fi
exit "$GLOBAL_RC"
