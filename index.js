/**
 * AI contribution heatmap — Host half.
 *
 * 采集四类 per-day 指标并持久化到插件私有的 JSON 文档：
 *
 * - `lines` / `ops` — 成功的改文件工具调用（`tools/result`）。
 * - `tokens`        — 已提交 `assistant/message` 事件里的 `usage`（`session/event`）。
 * - `searches`      — 成功的联网工具调用：DSH 内置的 `web_search`（检索）与
 *                     `web_fetch`（抓取页面）。
 * - `commits`       — 成功的 `bash`/`pwsh` 等 shell 调用，且其命令执行了
 *                     `git ... commit`。
 *
 * 浏览器半边通过一条只读、同源的 route 读取这份文档。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 硬依赖：事件词表和工具执行对象都来自 tools 服务。 */
export const inject = ['tools']

/** 浏览器半边轮询的同源路径；与 `client.js` 保持一致。 */
const ROUTE_PATH = '/contribution-heatmap/stats.json'
const STORE_VERSION = 2
const MAX_LINES = 20000
const PERSIST_DEBOUNCE_MS = 1000
const USAGE_DEDUPE_LIMIT = 4096
const METRICS = ['ops', 'lines', 'tokens', 'searches', 'commits']

const WRITE_TOOLS = new Set(['write', 'write_file', 'create_file', 'tool-fs'])
const EDIT_TOOLS = new Set(['edit', 'multi_edit', 'str_replace_editor', 'replace_in_file'])
const PATCH_TOOLS = new Set(['apply_patch'])

/**
 * 联网工具：DSH 的 `web_search` 与 `web_fetch` 是两个独立注册的工具，
 * 前者检索、后者抓取页面，二者都属于「联网搜索」行为。
 */
const SEARCH_TOOLS = new Set(['web_search', 'web_fetch', 'web-search', 'web-fetch', 'search_web', 'fetch'])
const SEARCH_TOOL_PATTERN = /(?:web[_-]?search|web[_-]?fetch|search[_-]?web)/i

/** Shell 工具：命令文本在 `command`（bash/pwsh）或 `script`/`cmd`（兼容变体）里。 */
const SHELL_TOOLS = new Set(['bash', 'pwsh', 'shell', 'terminal', 'run_command', 'execute_command'])
const SHELL_TOOL_PATTERN = /(?:^|[^a-z])(?:bash|pwsh|shell|terminal)(?:$|[^a-z])/i

/**
 * `git ... commit`：`git` 必须位于命令起点（行首或 `;`、`&&`、`{` 等分隔符之后），
 * 容忍 `-C <path>`、`-c key=value`、`--no-pager` 等全局选项，并避开 `commit-tree`。
 */
const GIT_COMMIT_PATTERN = /(?:^|[\n;&|{(])[ \t]*(?:(?:sudo|env|command)[ \t]+)*git(?:\.exe)?\b(?:(?:[ \t]+(?:-C[ \t]+\S+|-c[ \t]+\S+|--?[A-Za-z][\w-]*(?:=[^\s;|&]+)?)))*[ \t]+commit(?![-\w])/

/**
 * 命令规整，避免「文本里提到 git commit」被误判成真的提交：
 *
 * 1. 去掉 PowerShell here-string 的内容（脚本/文档正文常含示例命令）。
 * 2. 把引号包住的 git 路径还原成 `git`。
 * 3. 按行剥离其余引号内的普通文本（如 `-m "fix"`、`echo "git commit"`）。
 */
const normalizeCommand = (command) => command
  .replace(/@'[\s\S]*?'@/g, '@@@')
  .replace(/@"[\s\S]*?"@/g, '@@@')
  .replace(/"([^"\n]*[\\/])?git(?:\.exe)?"/gi, 'git')
  .replace(/"[^"\n]*"/g, '""')
  .replace(/'[^'\n]*'/g, "''")

const getTodayKey = (d = new Date()) => {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

const countLines = (text) => (typeof text === 'string' ? text.split('\n').length : 0)

const firstString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

/** `exec.arguments` 是已解析的 `unknown`，但旧日志/兼容路径可能是 JSON 字符串。 */
const parseArguments = (raw) => {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
      return null
    }
  }
  return typeof raw === 'object' ? raw : null
}

const isSearchTool = (name) => SEARCH_TOOLS.has(name) || SEARCH_TOOL_PATTERN.test(name)
const isShellTool = (name) => SHELL_TOOLS.has(name) || SHELL_TOOL_PATTERN.test(name)

const getStorePath = () => {
  const home = process.env.DSH_HOME || process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh')
  return join(home, 'contribution-heatmap', 'activity.json')
}

// 极简数据存储
function createStore(ctx) {
  let days = {}
  let ready = null
  let timer = null
  const seenUsages = new Set()

  const load = async () => {
    if (ready) return ready
    ready = (async () => {
      try {
        const raw = await readFile(getStorePath(), 'utf8')
        const parsed = JSON.parse(raw)
        days = parsed?.days || parsed || {}
      } catch (e) {
        if (e.code !== 'ENOENT') console.warn('[Heatmap] 读取历史数据失败', e)
      }
    })()
    return ready
  }

  const persist = async () => {
    const payload = JSON.stringify({ version: STORE_VERSION, updatedAt: Date.now(), days }, null, 2)
    try {
      const target = getStorePath()
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, payload, 'utf8')
    } catch (e) {
      console.warn('[Heatmap] 写入数据失败', e)
    }
  }

  const bump = (delta, time) => {
    const key = time ? getTodayKey(new Date(time)) : getTodayKey()
    if (!days[key]) days[key] = {}
    for (const m of METRICS) {
      days[key][m] = Math.max(0, (days[key][m] || 0) + (delta[m] || 0))
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, PERSIST_DEBOUNCE_MS)
  }

  const recordTool = async (exec, result) => {
    if (!result || result.isError || !exec?.name) return
    const name = exec.name
    const args = parseArguments(exec.arguments)
    if (!args) return
    let delta = null

    if (WRITE_TOOLS.has(name)) {
      const lines = countLines(firstString(args.content, args.text, args.file_text))
      if (lines) delta = { ops: 1, lines: Math.min(lines, MAX_LINES) }
    } else if (EDIT_TOOLS.has(name)) {
      const lines = countLines(firstString(args.new_string, args.new_str, args.newText))
      if (lines) delta = { ops: 1, lines: Math.min(lines, MAX_LINES) }
    } else if (PATCH_TOOLS.has(name)) {
      const lines = countLines(firstString(args.patch, args.diff, args.input))
      if (lines) delta = { ops: 1, lines: Math.min(lines, MAX_LINES) }
    } else if (isSearchTool(name)) {
      // web_search / web_fetch 成功一次即计一次联网搜索。
      delta = { searches: 1 }
    } else if (isShellTool(name)) {
      const command = firstString(args.command, args.script, args.cmd, args.input)
      if (command && GIT_COMMIT_PATTERN.test(normalizeCommand(command))) delta = { commits: 1 }
    }

    if (delta) {
      await load()
      bump(delta)
    }
  }

  const recordEvent = async (session, event) => {
    if (event?.type !== 'assistant/message' || !event.data?.usage) return
    const key = `${session?.id || 'unknown'}:${event.seq}`
    if (seenUsages.has(key)) return
    seenUsages.add(key)
    if (seenUsages.size > USAGE_DEDUPE_LIMIT) seenUsages.clear()

    const usage = event.data.usage
    const tokens = Number(usage.totalTokens) || ((Number(usage.inputTokens) || 0) + (Number(usage.outputTokens) || 0))
    if (tokens > 0) {
      await load()
      bump({ tokens }, event.time)
    }
  }

  const getSnapshot = async () => {
    await load()
    const totals = {}
    METRICS.forEach(m => totals[m] = 0)
    const yearSet = new Set([String(new Date().getFullYear())])

    for (const [k, v] of Object.entries(days)) {
      METRICS.forEach(m => totals[m] += (v[m] || 0))
      yearSet.add(k.slice(0, 4))
    }

    return {
      days,
      totals,
      years: Array.from(yearSet).map(Number).filter(y => y > 1970).sort((a, b) => b - a)
    }
  }

  return { load, recordTool, recordEvent, getSnapshot }
}

export function apply(ctx) {
  const store = createStore(ctx)
  store.load()

  ctx.on('tools/result', (exec, res) => store.recordTool(exec, res).catch(console.error))
  ctx.on('session/event', (session, e) => store.recordEvent(session, e).catch(console.error))

  // 复用 DSH 现有 Web 服务，绝不开新端口。
  const webServer = ctx.get('webServer')
  if (webServer) {
    ctx.effect(() => {
      try {
        return webServer.register({
          kind: 'exact',
          path: ROUTE_PATH,
          resource: async (req) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              return new Response('Method Not Allowed', { status: 405 })
            }
            const data = await store.getSnapshot()
            return new Response(req.method === 'HEAD' ? null : JSON.stringify(data), {
              headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
            })
          },
        })
      } catch (error) {
        // 旧模块未释放时重复注册会抛错；不要让整个插件因此失效。
        console.warn('[Heatmap] route 注册失败（可能已被旧模块占用）', error)
        return () => {}
      }
    })
  }
}
