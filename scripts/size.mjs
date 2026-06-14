// バンドルサイズゲート（公開サブパスごとに gzip が上限内かを検査）
//
// サブパス独立課金のため合算でなく個別 LIMIT で判定。1つでも超過で exit 1。
// 依存は esbuild（既存 devDep）と node:zlib のみ。`pnpm size:check` で実行する。

import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

/** 各エントリの gzip LIMIT（バイト）。core は軽量死守、browser は core+DOM を含むぶん緩め */
const LIMITS = { 'web-csv-ops': 2 * 1024, 'web-csv-ops/browser': 4 * 1024 }

/** 計測対象エントリ（公開する import 単位＝サブパス） */
const ENTRIES = [
  { label: 'web-csv-ops', entry: 'src/index.ts' },
  { label: 'web-csv-ops/browser', entry: 'src/browser.ts' },
]

/** 1 エントリを本番と同じ設定でバンドルし min / gzip を返す */
async function measure(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2020',
    write: false,
  })
  const code = result.outputFiles[0].contents
  return { min: code.length, gzip: gzipSync(code).length }
}

const rows = []
for (const { label, entry } of ENTRIES) rows.push({ label, ...(await measure(entry)) })

const fmt = (n) => `${(n / 1024).toFixed(2)} KB`

// サブパスごとに個別 LIMIT で判定（独立課金なので合算は見ない）
let over = false
for (const r of rows) {
  const limit = LIMITS[r.label]
  const ok = r.gzip <= limit
  if (!ok) over = true
  console.log(
    `${r.label.padEnd(20)} min ${fmt(r.min).padStart(9)}  gzip ${fmt(r.gzip).padStart(9)}` +
      `  / LIMIT ${fmt(limit)}  ${ok ? `✓ 余白 ${fmt(limit - r.gzip)}` : `✗ 超過 ${r.gzip - limit} B`}`,
  )
}

if (over) {
  console.error('\n✗ LIMIT 超過のサブパスがあります')
  process.exit(1)
}
console.log('\n✓ 全サブパス LIMIT 内')
