/**
 * AI contribution heatmap — Client half.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-contribution-heatmap',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'contribution-heatmap'
    const STORAGE_KEY = 'dsh.contribution-heatmap.v2'
    const STATS_URL = '/contribution-heatmap/stats.json'
    const POLL_MS = 60000

    const GAP_BELOW_CARD = 32
    const HERO_BOTTOM_RESERVE = 140

    const ZH = {
      title: 'AI 代码贡献', summary: '{days}天 · {lines}行代码', less: '少', more: '多', dateTemplate: '{y}年{m}月{d}日 {w}',
      linesLabel: '代码贡献', tokensLabel: 'Token 消耗', searchesLabel: '联网搜索', commitsLabel: 'Git 提交',
      linesValue: '{n} 行', timesValue: '{n} 次', futureTip: '该日期还未到达哦~',
      m: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
      wd: ['周日','周一','周二','周三','周四','周五','周六']
    }

    const EN = {
      title: 'AI contribution', summary: '{days}d · {lines} lines', less: 'Less', more: 'More', dateTemplate: '{w}, {mon} {d}, {y}',
      linesLabel: 'Code changed', tokensLabel: 'Tokens', searchesLabel: 'Web searches', commitsLabel: 'Git commits',
      linesValue: '{n}', timesValue: '{n}', futureTip: 'Not reached yet~',
      m: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      wd: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    }

    let dict = ZH
    let translator = null

    function t(key) {
      if (dict[key] !== undefined) return dict[key]
      if (translator) {
        try {
          const val = translator(key)
          if (typeof val === 'string' && val.length > 0 && val !== key) return val
        } catch { translator = null }
      }
      return ZH[key] || key
    }

    const fill = (template, values) => 
      Object.entries(values).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)), String(template))

    const SvgIcon = ({ viewBox = "0 0 24 24", fill = "none", stroke = "currentColor", children }) => 
      h('svg', { viewBox, fill, stroke, strokeWidth: fill === "none" ? "2" : undefined, strokeLinecap: "round", strokeLinejoin: "round", className: "chm-tip-icon" }, children)

    const Icons = {
      lines: () => h(SvgIcon, null, h('polyline', { points: "16 18 22 12 16 6" }), h('polyline', { points: "8 6 2 12 8 18" })),
      tokens: () => h(SvgIcon, null, h('ellipse', { cx: "12", cy: "5", rx: "9", ry: "3" }), h('path', { d: "M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" }), h('path', { d: "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" })),
      search: () => h(SvgIcon, null, h('circle', { cx: "11", cy: "11", r: "8" }), h('line', { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })),
      git: () => h(SvgIcon, { fill: "currentColor", stroke: "none" }, h('path', { d: "M15 5H17C18.1046 5 19 5.89543 19 7V15.1707C20.1652 15.5825 21 16.6938 21 18C21 19.6569 19.6569 21 18 21C16.3431 21 15 19.6569 15 18C15 16.6938 15.8348 15.5825 17 15.1707V7H15V10L10.5 6L15 2V5ZM5 8.82929C3.83481 8.41746 3 7.30622 3 6C3 4.34315 4.34315 3 6 3C7.65685 3 9 4.34315 9 6C9 7.30622 8.16519 8.41746 7 8.82929V15.1707C8.16519 15.5825 9 16.6938 9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3 16.6938 3.83481 15.5825 5 15.1707V8.82929ZM6 7C6.55228 7 7 6.55228 7 6C7 5.44772 6.55228 5 6 5C5.44772 5 5 5.44772 5 6C5 6.55228 5.44772 7 6 7ZM6 19C6.55228 19 7 18.5523 7 18C7 17.4477 6.55228 17 6 17C5.44772 17 5 17.4477 5 18C5 18.5523 5.44772 19 6 19ZM18 19C18.5523 19 19 18.5523 19 18C19 17.4477 18.5523 17 18 17C17.4477 17 17 17.4477 17 18C17 18.5523 17.4477 19 18 19Z" })),
      whale: () => h('svg', { viewBox: "0 0 24 24", fill: "currentColor", className: "chm-tip-icon chm-icon-whale" }, h('path', { d: "M9 3V1H7V3H3C2.44772 3 2 3.44772 2 4V20C2 20.5523 2.44772 21 3 21H21C21.5523 21 22 20.5523 22 20V4C22 3.44772 21.5523 3 21 3H17V1H15V3H9ZM4 10H20V19H4V10ZM4 5H7V6H9V5H15V6H17V5H20V8H4V5ZM9.87862 10.9644L12 13.0858L14.1212 10.9644L15.5355 12.3785L13.4142 14.5001L15.5354 16.6212L14.1213 18.0354L12 15.9143L9.87855 18.0354L8.46442 16.6211L10.5857 14.5001L8.46436 12.3785L9.87862 10.9644Z" })),
    }

    // ★ 终极 CSS 修复：彻底锁定行列，拒绝任何缩放飘逸！
    const CSS = `
      .chm-root { position: relative; box-sizing: border-box; width: 100%; padding: 0 64px 0 10px; color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.4; font-variant-numeric: tabular-nums; }
      .chm-main { width: 100%; display: flex; flex-direction: column; min-width: 0; }
      .chm-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
      .chm-title { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; white-space: nowrap; }
      .chm-total { color: var(--dsw-alias-label-secondary); opacity: 0.78; white-space: nowrap; }
      
      .chm-chart { display: grid; grid-template-columns: 32px minmax(0, 1fr); grid-template-rows: 16px auto; gap: 4px; width: 100%; }
      
      .chm-months { grid-column: 2; grid-row: 1; display: grid; grid-template-columns: repeat(53, minmax(0, 1fr)); gap: 3px; }
      .chm-month-label { font-size: 10px; color: var(--dsw-alias-label-secondary); opacity: 0.8; white-space: nowrap; overflow: visible; }
      
      /* ★ 修复左侧错位：用 flex: 1 和 line-height: 0，让文字彻底悬浮，绝不撑开容器 */
      .chm-weekdays { grid-column: 1; grid-row: 2; display: flex; flex-direction: column; height: 100%; }
      .chm-weekday-label { flex: 1; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 10px; color: var(--dsw-alias-label-secondary); opacity: 0.8; white-space: nowrap; line-height: 0; }
      
      /* ★ 修复右侧变形：去掉外层的强制宽高比，让内部的小方块自己控制正方形 */
      /* 列数默认 53，实际由 inline style 按当年真实周数覆盖（闰年从周日起算时为 54）。 */
      .chm-grid { grid-column: 2; grid-row: 2; display: grid; grid-auto-flow: column; grid-template-columns: repeat(53, minmax(0, 1fr)); grid-template-rows: repeat(7, minmax(0, 1fr)); gap: 3px; width: 100%; }
      
      .chm-cell { width: 100%; height: 100%; aspect-ratio: 1; border-radius: 2px; background: rgba(127, 127, 127, 0.16); }
      .chm-cell[data-level='1'] { background: color-mix(in srgb, #5686fe 30%, transparent); }
      .chm-cell[data-level='2'] { background: color-mix(in srgb, #5686fe 55%, transparent); }
      .chm-cell[data-level='3'] { background: color-mix(in srgb, #5686fe 80%, transparent); }
      .chm-cell[data-level='4'] { background: #5686fe; }
      .chm-cell[data-outside='1'] { background: transparent; }
      .chm-cell[data-outside='1']:hover { outline: none; cursor: default; }
      .chm-cell:not([data-outside="1"]):hover { outline: 1px solid var(--dsw-alias-label-secondary); outline-offset: 1px; }
      
      .chm-side { position: absolute; top: 24px; right: 0; display: flex; flex-direction: column; gap: 4px; }
      .chm-year-btn { background: transparent; border: none; color: var(--dsw-alias-label-secondary); font-size: 11px; padding: 3px 10px; border-radius: 4px; cursor: pointer; transition: all 0.2s; outline: none; opacity: 0.7; }
      .chm-year-btn:hover { background: rgba(255, 255, 255, 0.08); color: var(--dsw-alias-label-primary); opacity: 1; }
      .chm-year-btn.active { background: #5686fe; color: #ffffff; opacity: 1; font-weight: 600; }
      
      .chm-foot { display: flex; align-items: center; justify-content: flex-end; gap: 5px; margin-top: 10px; padding-right: 12px; }
      .chm-legend { display: inline-flex; align-items: center; gap: 3px; }
      .chm-legend-cell { display: inline-block; width: 10px; height: 10px; border-radius: 2px; aspect-ratio: 1; }
      
      .chm-tip { position: fixed; z-index: 60; min-width: 150px; padding: 8px 10px; border-radius: 6px; background: rgba(22, 23, 26, 0.97); color: #f5f5f5; text-align: left; box-shadow: 0 8px 22px rgba(0, 0, 0, 0.38); pointer-events: none; overflow: visible; }
      .chm-tip::after { content: ''; position: absolute; left: var(--chm-arrow, 50%); bottom: -4px; width: 9px; height: 9px; background: inherit; transform: translateX(-50%) rotate(45deg); border-radius: 1px; }
      .chm-tip-date { font-size: 11px; font-weight: 600; color: #ffffff; margin-bottom: 5px; white-space: nowrap; }
      .chm-tip-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 11px; line-height: 1.55; }
      .chm-tip-label { display: flex; align-items: center; gap: 6px; color: rgba(255, 255, 255, 0.6); }
      .chm-tip-icon { width: 12px; height: 12px; opacity: 0.8; }
      .chm-tip-value { color: #ffffff; font-variant-numeric: tabular-nums; }
      .chm-tip-future { display: flex; align-items: center; gap: 6px; color: #5686fe; font-weight: 600; margin-top: 4px; font-size: 11px; }
      .chm-icon-whale { width: 14px; height: 14px; }
    `

    const pad = (v) => v < 10 ? '0' + v : String(v)
    const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const getLevel = (lines) => !(lines > 0) ? 0 : lines < 10 ? 1 : lines < 50 ? 2 : lines < 150 ? 3 : 4
    
    const formatToken = (val) => {
      if (!(val > 0)) return '0'
      if (val >= 1000000) return (val / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
      if (val >= 1000) return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
      return String(Math.round(val))
    }
    
    const formatNum = (val) => {
      try { return val.toLocaleString() } catch { return String(val) }
    }

    function getCache() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { days: {}, years: [] }
        const parsed = JSON.parse(raw)
        return { days: parsed.days || {}, years: parsed.years || [] }
      } catch { return { days: {}, years: [] } }
    }

    function useComposerPlacement() {
      const wrapRef = React.useRef(null)
      const [placement, setPlacement] = React.useState(null)

      React.useLayoutEffect(() => {
        let frame = 0, observer = null
        const measure = () => {
          const wrap = wrapRef.current
          const card = document.querySelector('[data-composer-card]')
          if (!wrap || !card) return
          const wRect = wrap.getBoundingClientRect()
          const cRect = card.getBoundingClientRect()
          const next = { top: Math.round(cRect.bottom + GAP_BELOW_CARD - wRect.top), left: Math.round(cRect.left - wRect.left), width: Math.round(cRect.width) }
          setPlacement((prev) => prev && prev.top === next.top && prev.left === next.left && prev.width === next.width ? prev : next)
        }
        const schedule = () => {
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(measure)
        }
        
        measure()
        window.addEventListener('resize', schedule)
        window.addEventListener('scroll', schedule, true)
        if (typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(schedule)
          const card = document.querySelector('[data-composer-card]')
          if (card) observer.observe(card)
          if (wrapRef.current) observer.observe(wrapRef.current)
        }
        return () => {
          cancelAnimationFrame(frame)
          window.removeEventListener('resize', schedule)
          window.removeEventListener('scroll', schedule, true)
          observer?.disconnect()
        }
      }, [])
      return [wrapRef, placement]
    }

    const Tooltip = ({ hover }) => {
      if (!hover) return null
      const style = { left: hover.left + 'px', top: hover.top + 'px', transform: hover.transform, '--chm-arrow': hover.arrow }
      
      return h('div', { className: 'chm-tip', style },
        h('div', { className: 'chm-tip-date' }, hover.date),
        hover.isFuture 
          ? h('div', { className: 'chm-tip-future' }, h(Icons.whale), h('span', null, t('futureTip')))
          : [
              h('div', { className: 'chm-tip-row', key: 'lines' }, h('span', { className: 'chm-tip-label' }, h(Icons.lines), t('linesLabel')), h('span', { className: 'chm-tip-value' }, fill(t('linesValue'), { n: formatNum(hover.lines) }))),
              h('div', { className: 'chm-tip-row', key: 'tokens' }, h('span', { className: 'chm-tip-label' }, h(Icons.tokens), t('tokensLabel')), h('span', { className: 'chm-tip-value' }, formatToken(hover.tokens))),
              h('div', { className: 'chm-tip-row', key: 'searches' }, h('span', { className: 'chm-tip-label' }, h(Icons.search), t('searchesLabel')), h('span', { className: 'chm-tip-value' }, fill(t('timesValue'), { n: formatNum(hover.searches) }))),
              h('div', { className: 'chm-tip-row', key: 'commits' }, h('span', { className: 'chm-tip-label' }, h(Icons.git), t('commitsLabel')), h('span', { className: 'chm-tip-value' }, fill(t('timesValue'), { n: formatNum(hover.commits) })))
            ]
      )
    }

    function HeatmapPanel() {
      const [initData] = React.useState(getCache)
      const [days, setDays] = React.useState(initData.days)
      const [years, setYears] = React.useState(initData.years.length > 0 ? initData.years : [new Date().getFullYear()])
      const [year, setYear] = React.useState(new Date().getFullYear())
      const [hover, setHover] = React.useState(null)
      const [wrapRef, placement] = useComposerPlacement()

      React.useEffect(() => {
        let isCancelled = false
        let timer = 0
        const pull = () => {
          fetch(STATS_URL, { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (isCancelled || !data || typeof data !== 'object') return
              const curYear = new Date().getFullYear()
              let nextYears = Array.isArray(data.years) && data.years.length > 0 ? data.years.map(Number) : [curYear]
              if (!nextYears.includes(curYear)) nextYears.unshift(curYear)
              nextYears.sort((a, b) => b - a)
              
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, days: data.days || {}, years: nextYears }))
              setDays(data.days || {})
              setYears(nextYears)
            })
            .catch(() => {})
        }
        pull()
        timer = setInterval(pull, POLL_MS)
        const onFocus = () => pull()
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onFocus)
        return () => {
          isCancelled = true
          clearInterval(timer)
          window.removeEventListener('focus', onFocus)
          document.removeEventListener('visibilitychange', onFocus)
        }
      }, [])

      const { cells, weeks, monthLabels, totals } = React.useMemo(() => {
        const start = new Date(year, 0, 1)
        const end = new Date(year, 11, 31)
        const gridStart = new Date(start)
        gridStart.setDate(gridStart.getDate() - (gridStart.getDay() === 0 ? 6 : gridStart.getDay() - 1))
        
        const gridEnd = new Date(end)
        gridEnd.setDate(gridEnd.getDate() + (gridEnd.getDay() === 0 ? 0 : 7 - gridEnd.getDay()))

        const totalDays = Math.round((gridEnd - gridStart) / 86400000) + 1
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const c = []
        const ml = []
        let lastMonth = -1
        let stats = { lines: 0, activeDays: 0 }

        for (let i = 0; i < totalDays; i++) {
          const date = new Date(gridStart)
          date.setDate(gridStart.getDate() + i)
          const outside = date.getFullYear() !== year
          const future = date.getTime() > today.getTime()
          const key = dayKey(date)
          
          c.push({ index: i, week: Math.floor(i / 7), key, date, outside, future })

          if (!outside) {
            const record = days[key]
            if (record) {
              stats.lines += (record.lines || 0)
              if (record.lines > 0 || record.ops > 0 || record.tokens > 0 || record.searches > 0 || record.commits > 0) {
                stats.activeDays += 1
              }
            }
            if (date.getDate() === 1 || i === 0) {
              const month = date.getMonth()
              if (month !== lastMonth && (!ml.length || ml[ml.length - 1].week !== Math.floor(i / 7))) {
                ml.push({ week: Math.floor(i / 7), month })
                lastMonth = month
              }
            }
          }
        }
        return { cells: c, weeks: totalDays / 7, monthLabels: ml, totals: stats }
      }, [year, days])

      const displayYears = React.useMemo(() => {
        const ySet = new Set([...years, new Date().getFullYear()])
        const sorted = Array.from(ySet).sort((a, b) => b - a)
        const maxY = sorted[0]
        const minY = sorted[sorted.length - 1]
        return Array.from({ length: maxY - minY + 1 }, (_, i) => maxY - i)
      }, [years])

      const handleEnter = (e, cell) => {
        if (cell.outside) return
        const rect = e.currentTarget.getBoundingClientRect()
        const rec = days[cell.key] || { lines: 0, tokens: 0, searches: 0, commits: 0 }
        const isLeft = e.clientX < window.innerWidth / 2
        
        setHover({
          left: isLeft ? rect.left : rect.right,
          top: rect.top - 8,
          transform: isLeft ? 'translate(0, -100%)' : 'translate(-100%, -100%)',
          arrow: isLeft ? '20px' : 'calc(100% - 20px)',
          isFuture: cell.future,
          date: fill(t('dateTemplate'), {
            y: cell.date.getFullYear(), m: cell.date.getMonth() + 1, d: cell.date.getDate(),
            mon: t('m')[cell.date.getMonth()], w: t('wd')[cell.date.getDay()]
          }),
          lines: rec.lines, tokens: rec.tokens, searches: rec.searches, commits: rec.commits,
        })
      }

      const summary = fill(t('summary'), { days: totals.activeDays, lines: formatNum(totals.lines) })
      // 一个自然年是 53 周，但闰年且 1 月 1 日是周日时是 54 周；列数必须跟着周数走，
      // 否则多出的最后一周会掉进 grid 的隐式列，把那一列的方块撑变形。
      const gridTemplate = { gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }

      const panel = h('div', { className: 'chm-root' },
        h('style', null, CSS),
        
        h('div', { className: 'chm-main' },
          h('div', { className: 'chm-head' },
            h('span', { className: 'chm-title' }, t('title')),
            h('span', { className: 'chm-total' }, summary)
          ),
          
          h('div', { className: 'chm-chart' },
            h('div', { className: 'chm-months', style: gridTemplate },
              monthLabels.map((l) => h('span', { key: l.week, className: 'chm-month-label', style: { gridColumn: l.week + 1 } }, t('m')[l.month]))
            ),
            
            h('div', { className: 'chm-weekdays' },
              Array.from({ length: 7 }).map((_, row) => {
                let text = ''
                if (row === 0) text = t('wd')[1]
                else if (row === 2) text = t('wd')[3]
                else if (row === 4) text = t('wd')[5]
                else if (row === 6) text = t('wd')[0]
                return h('div', { key: row, className: 'chm-weekday-label' }, text)
              })
            ),
            
            h('div', { className: 'chm-grid', style: gridTemplate }, 
              cells.map(cell => h('div', {
                key: cell.key,
                className: 'chm-cell',
                'data-level': String(cell.outside ? 0 : getLevel(days[cell.key]?.lines || 0)),
                'data-outside': cell.outside ? '1' : '0',
                onMouseEnter: cell.outside ? undefined : (e) => handleEnter(e, cell),
                onMouseLeave: cell.outside ? undefined : () => setHover(null),
              }))
            )
          ),
          
          h('div', { className: 'chm-foot' },
            h('span', null, t('less')),
            h('span', { className: 'chm-legend' }, [1, 2, 3, 4].map(lv => h('span', { key: lv, className: 'chm-cell chm-legend-cell', 'data-level': String(lv) }))),
            h('span', null, t('more'))
          )
        ),
        
        h('div', { className: 'chm-side' }, 
          displayYears.map(y => h('button', {
            key: y,
            className: `chm-year-btn ${y === year ? 'active' : ''}`,
            onClick: () => { setYear(y); setHover(null) }
          }, String(y)))
        ),
        
        h(Tooltip, { hover })
      )

      const style = placement
        ? { top: placement.top + 'px', left: placement.left + 'px', width: placement.width + 'px', maxWidth: '100vw' }
        : { top: '0px', left: '0px', width: '100%' }

      return h('div', { ref: wrapRef, style: { position: 'relative', width: '100%', height: 0, zIndex: 3 } },
        h('div', { style: { position: 'absolute', pointerEvents: 'auto', overflow: 'visible', ...style } }, panel)
      )
    }

    function HeroFrameLayer(props) {
      const hero = props.hero === true
      return h('div', { style: { display: 'contents' } },
        props.children,
        hero && h('div', { key: 'hero-reserve', style: { flex: `0 0 ${HERO_BOTTOM_RESERVE}px`, height: HERO_BOTTOM_RESERVE, pointerEvents: 'none' } }),
        hero && h(HeatmapPanel)
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale')
        const disposers = []
        
        const updateDict = () => {
          dict = ZH
          if (!locale) return
          try {
            const active = locale.getLocale()?.active?.toLowerCase() || ''
            dict = active.startsWith('en') ? EN : ZH
          } catch { dict = ZH }
        }

        if (locale) {
          try { disposers.push(locale.register(NS, 'en', EN)) } catch (e) {}
          ;['zh', 'zh-CN', 'zh-Hans', 'zh-Hant', 'zh-TW'].forEach(id => {
            try { disposers.push(locale.register(NS, id, ZH)) } catch (e) {}
          })
          updateDict()
          try { translator = locale.bind(NS) } catch { translator = null }
        }

        const off = ctx.on('locale/change', updateDict)
        if (typeof off === 'function') disposers.push(off)
        
        ctx.effect(() => () => {
          translator = null
          disposers.forEach(d => { try { d() } catch (e) {} })
        })

        ctx.slots.inject('conversation.hero.frame', () =>
          ctx.slots.register(
            { name: 'conversation.hero.frame', id: 'contribution-heatmap-hero', order: 10 },
            HeroFrameLayer
          )
        )
      }
    }
  }
})