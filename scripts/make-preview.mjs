/**
 * Generates docs/preview.svg — the single feature image of the bundle detail page.
 *
 * Rules that constrain this file (references/plugin-details.md, references/artwork.md):
 * 640x300 canvas, self-contained geometry only, no <text>, <style>, <script>,
 * <image>, event handlers, animation or <foreignObject>, readable in light and
 * dark themes, and content kept ~32 units away from the edges.
 *
 * Run: node scripts/make-preview.mjs   (output is committed; the tarball ships
 * docs/preview.svg, not this script.)
 */

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'preview.svg')

/** Deterministic PRNG so the committed image never changes between runs. */
const mulberry32 = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const CELL = 6
const GAP = 2
const COLS = 53
const ROWS = 7
const GRID_X = 96
const GRID_Y = 160

const rect = (x, y, w, h, attrs = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`

const grid = () => {
  const random = mulberry32(20260101)
  const cells = []
  for (let col = 0; col < COLS; col += 1) {
    // Contribution density rises toward the recent end of the year.
    const bias = 0.12 + (col / COLS) * 0.7
    for (let row = 0; row < ROWS; row += 1) {
      const x = GRID_X + col * (CELL + GAP)
      const y = GRID_Y + row * (CELL + GAP)
      const roll = random()
      let fill = '#8a8f98'
      let opacity = 0.16
      if (roll < bias) {
        const level = random()
        opacity = level < 0.35 ? 0.3 : level < 0.65 ? 0.55 : level < 0.85 ? 0.8 : 1
        fill = '#5686fe'
      }
      cells.push(rect(x, y, CELL, CELL, `rx="1.5" fill="${fill}" fill-opacity="${opacity}"`))
    }
  }
  return cells.join('')
}

const monthTicks = () => Array.from({ length: 12 }, (_, month) => {
  const col = Math.round((month / 12) * (COLS - 1))
  return rect(GRID_X + col * (CELL + GAP), GRID_Y - 12, 3, 5, 'rx="1.5" fill="#8a8f98" fill-opacity="0.5"')
}).join('')

const yearPills = () => {
  const pills = []
  ;[0, 1, 2].forEach((index) => {
    const y = GRID_Y - 4 + index * 19
    const active = index === 0
    const attrs = active
      ? 'rx="4" fill="#5686fe"'
      : 'rx="4" fill="#8a8f98" fill-opacity="0.12" stroke="#8a8f98" stroke-opacity="0.35"'
    pills.push(rect(546, y, 34, 13, attrs))
  })
  return pills.join('')
}

const legend = () => {
  const y = GRID_Y + ROWS * (CELL + GAP) + 12
  const end = GRID_X + COLS * (CELL + GAP) - GAP
  const parts = []
  const bar = (x, w) => rect(x, y + 2, w, 4, 'rx="2" fill="#8a8f98" fill-opacity="0.45"')
  const cellsWidth = 4 * 8 + 3 * 3
  const start = end - (16 + 6 + cellsWidth + 6 + 16)
  parts.push(bar(start, 16))
  ;[0.16, 0.3, 0.55, 0.8].forEach((opacity, index) => {
    const fill = index === 0 ? '#8a8f98' : '#5686fe'
    parts.push(rect(start + 22 + index * 11, y, 8, 8, `rx="2" fill="${fill}" fill-opacity="${opacity}"`))
  })
  parts.push(bar(start + 22 + cellsWidth + 6, 16))
  return parts.join('')
}

const composer = () => {
  const x = 96
  const y = 46
  const w = 448
  const h = 62
  return [
    rect(x, y, w, h, 'rx="16" fill="#8a8f98" fill-opacity="0.07" stroke="#8a8f98" stroke-opacity="0.35"'),
    rect(x + 18, y + 18, 176, 6, 'rx="3" fill="#8a8f98" fill-opacity="0.38"'),
    rect(x + 18, y + 32, 118, 5, 'rx="2.5" fill="#8a8f98" fill-opacity="0.24"'),
    rect(x + 18, y + 44, 74, 5, 'rx="2.5" fill="#8a8f98" fill-opacity="0.18"'),
    `<circle cx="${x + w - 30}" cy="${y + h - 22}" r="13" fill="#5686fe"/>`,
    `<path d="M ${x + w - 35} ${y + h - 22} h 10 M ${x + w - 29} ${y + h - 26} l 4 4 l -4 4" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('')
}

const header = () => [
  rect(96, 128, 92, 7, 'rx="3.5" fill="#8a8f98" fill-opacity="0.5"'),
  rect(194, 129, 58, 5, 'rx="2.5" fill="#8a8f98" fill-opacity="0.3"'),
].join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="300" viewBox="0 0 640 300" role="img" aria-label="The heatmap panel shown below the message composer on a new conversation">
  <g>${composer()}</g>
  <g>${header()}</g>
  <g>${monthTicks()}</g>
  <g>${grid()}</g>
  <g>${yearPills()}</g>
  <g>${legend()}</g>
</svg>
`

await writeFile(OUT, svg, 'utf8')
console.log(`wrote ${OUT} (${svg.length} bytes)`)
