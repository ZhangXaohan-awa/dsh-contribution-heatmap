# AI contribution heatmap

A DeepSeek Harness bundle that draws a GitHub-style contribution heatmap for one
calendar year on the **blank home of a new conversation**, just below the message
composer. As soon as that conversation has history, the heatmap hides itself.

Plain ES modules: no build step, no dependencies, no network calls of its own.
The only traffic is the host reading contributions from the session it already
serves.

## What you get

- One **calendar year** per view — week columns from the Monday on or before
  Jan 1 to the Sunday on or after Dec 31, so normally 53 columns.
- Month captions above the grid and a `少 [▫▫▫▫] 多` legend bottom right,
  localized.
- A year switcher on the right, listing every year that has data plus the
  current year.
- A header reading `AI 代码贡献  12天 · 3,204行代码`, with the numeric part
  dimmed.
- A dark hover tooltip with a pointer arrow, showing for the hovered day:

  | Row | Source |
  |---|---|
  | Date | the cell's calendar day |
  | 代码贡献 | `lines` — changed lines |
  | Token 消耗 | `tokens` — total tokens, shown as `k` / `M` |
  | 联网搜索 | `searches` — successful `web_search` / `web_fetch` calls |
  | Git 提交 | `commits` — successful `git commit` runs |

Contribution intensity is `#5686FE` at 30 %, 55 %, 80 %, and 100 % over a
translucent neutral grey for empty days, so one palette reads correctly in the
light and the dark theme. Days outside the selected year stay invisible and
ignore the pointer.

## Install

The bundle installs from a packed `.tgz` or from an unpacked directory.

From an agent session, with the `plugin_manager` tool:

```js
plugin_manager({ action: 'install_bundle', target: 'file:C:\\path\\to\\local-dsh-contribution-heatmap-1.0.1.tgz' })
```

or point at a checkout instead (the profile then links that directory, so the
files on disk are what the host serves):

```js
plugin_manager({ action: 'install_bundle', target: 'C:\\path\\to\\dsh-contribution-heatmap' })
```

The same bundle is also reachable in **Settings → Plugins**.

> Installing the packed bundle while an earlier directory install of the same
> name is still present leaves two entries for one bundle name. Remove the
> directory install first with
> `plugin_manager({ action: 'remove_bundle', target: '@local/dsh-contribution-heatmap' })`.

Then open **Settings → Plugins**, confirm the bundle row shows the heatmap icon,
and start a new conversation. The grid appears on the blank home; send a message
and it gives way to the conversation.

## What gets counted

The **host half** subscribes to two events.

`tools/result` — the frozen final outcome of every tool call. Counted only when
`isError === false`:

| Tool | Metric |
|---|---|
| `write`, `write_file`, `create_file` | `lines` = written content lines, `ops` + 1 |
| `edit`, `multi_edit`, `str_replace_editor`, `replace_in_file` | `lines` = lines in the new string, `ops` + 1 |
| `apply_patch` | `lines` = lines in the patch body, `ops` + 1 |
| `web_search`, `web_fetch` | `searches` + 1 |
| `bash`, `pwsh` whose command matches `git … commit` | `commits` + 1 |

`session/event` — the committed session log feed. Every `assistant/message`
carrying `data.usage` adds `totalTokens` (or `inputTokens + outputTokens`) to
`tokens` for the event's local day, de-duplicated by `sessionId:seq`.

A commit is only counted when `git` starts a command (`^`, `;`, `&&`, `{`, …),
global options such as `-C <path>` are tolerated, quoted text is stripped first
(so `echo "git commit"` in a PowerShell here-string or a message body does not
count), and `commit-tree` does not match.

The aggregate is written to:

```
<DSH_HOME>/contribution-heatmap/activity.json
```

(`DSH_HOME`, then `DSH_PROFILE_DIR`, then `~/.dsh` — the first that is set.)
The file is debounced by one second and written as
`{ "version": 2, "updatedAt": …, "days": { "YYYY-MM-DD": { ops, lines, tokens, searches, commits } } }`.
Stores written by the earlier two-metric version are read as-is: missing metrics
default to `0`.

The browser half polls one read-only, same-origin route:

```
GET /contribution-heatmap/stats.json
```

It answers `GET` and `HEAD` only — anything else is `405` — with
`cache-control: no-store`. `localStorage` (`dsh.contribution-heatmap.v2`) holds
only the last successful response, so the first paint after a restart needs no
request.

## Where it appears

The grid is rendered **inside** the root-scoped `conversation.hero.frame` layer
(a pass-through layer: `display: contents`, `order: 10`, which renders the scroll
body unchanged), and only while that layer reports `hero === true`.

`hero` is the owner's own definition of a history-free home
(`sessionId === undefined || (blank session && open)`), so nothing is guessed
from routes, DOM, or message counts.

### Why not the composer dock

`conversation.composer.dock` is a Session-scoped slot, and its owner renders it
only while a Session exists — `InputBar.tsx` guards it with
`sessionId !== undefined`. The Hero page is exactly the `sessionId === undefined`
case, so a dock occupant never mounts there: no styling, z-index, or conditional
logic inside that component can make it appear. The hero frame layer exists in
both Hero states, which is why the grid lives there.

### Positioning

The slot returns a zero-height `position: relative` wrapper; the panel itself is
`position: absolute` inside it, measured against the composer card the owner
marks with `data-composer-card`, so it floats just below the input and takes no
part in the Hero's flex layout. It re-measures on resize, on scroll, and through
a `ResizeObserver` on that card. If the card is missing, it falls back to the top
of the frame at full width rather than guessing a position.

The layer also reserves `HERO_BOTTOM_RESERVE` (140 px) of space at the bottom of
the blank home, which lifts the whole Hero body — headline, composer, and grid —
toward the visual centre. Set that constant to `0` in `client.js` to restore the
stock Hero position.

## Limits worth knowing

- Calls made **before** the plugin was installed or enabled are not counted.
- An **overwrite** counts the new file length, not the difference, because the
  previous content is not part of the tool result.
- Files changed by `bash`/`pwsh` commands are not counted as code contribution,
  and only commands matching `git … commit` register a commit.
- Token usage is recorded per committed assistant message; a turn that is
  interrupted before its message commits contributes nothing.
- Counts are per calendar day in the host's local timezone. Collected days are
  kept; nothing is pruned automatically.
- The browser polls once a minute, plus on window focus and tab visibility
  change, so a fresh day can lag up to that long.

## Tuning

In `index.js`: `MAX_LINES` (per-call line cap), `PERSIST_DEBOUNCE_MS`,
`USAGE_DEDUPE_LIMIT`, and the tool-name sets at the top of the file.
In `client.js`: `POLL_MS`, `GAP_BELOW_CARD`, `HERO_BOTTOM_RESERVE`, and the
level thresholds in `getLevel()` (`10` / `50` / `150` lines).
The grid geometry itself lives in the `CSS` block: 53 columns, 3 px gap, 2 px
radius, fluid square cells.

## Package as a bundle

`package.json` already declares `dsh.bundle.patch`, so the directory is a bundle;
packing only decides how it travels.

```bash
pnpm pack --pack-destination dist     # → dist/local-dsh-contribution-heatmap-1.0.1.tgz
node scripts/smoke-test.mjs           # 13 checks against the host half
tar -tzf dist/*.tgz                   # confirm the packed file list
```

The tarball must contain `package.json`, `index.js`, `client.js`,
`cordis.patch.yml`, `locale/*.json`, `docs/DETAIL*.md` with `docs/preview.svg`,
`icon.svg`, `README.md`, `LICENSE`, and `scripts/smoke-test.mjs` — the `files`
array in `package.json` is the single source of truth for that list.

`scripts/smoke-test.mjs` imports the host half with a stubbed Cordis context,
feeds it write/edit/patch/web/commit results plus a token event, then reads the
snapshot back through the route the plugin registers, so it verifies the packed
artifact without a running DSH.

Display metadata for **Settings → Plugins** lives in `locale/en.json` and
`locale/zh.json` (`meta.title`, `meta.description`, and `meta.detail` pointing at
the one-image detail documents); the icon is `icon.svg`, 64 × 64.

## Reloading after a change

A directory install links the checkout into the profile, so the files on disk are
what the host serves.

- **`client.js`** — the host republishes the bundle and the open page swaps the
  module in place; normally no restart is needed.
- **`index.js`** — a host module generation. Restart DSH, or toggle the plugin
  row off and on in **Settings → Plugins**. A hot reload can leave the old web
  route registered, in which case the new `webServer.register` throws on the
  duplicate path and the route answers 404 until the row is reloaded.
- **`package.json` / `cordis.patch.yml`** — read when the plugin row starts.
- **`locale/*.json`, `icon.svg`, `docs/`** — display metadata; reopen the
  Plugins page.

## License

MIT. See [LICENSE](LICENSE).
