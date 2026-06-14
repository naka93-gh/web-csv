import { stringify } from '../core/stringify.js'
import type { StringifyOptions } from '../core/types.js'

/**
 * オブジェクト配列を CSV 化してブラウザのダウンロードを起動する
 * 内部で Blob と一時 `<a>` を生成し、`URL.createObjectURL` でリンクを発行する
 *
 * @example
 * ```ts
 * downloadCSV(users, 'users.csv', {
 *   headers: ['id', 'name', 'email'],
 *   headerLabels: { id: 'ID', name: '名前', email: 'メールアドレス' },
 * })
 * ```
 */
export function downloadCSV<T>(
  rows: readonly T[],
  filename: string,
  options?: StringifyOptions<T>,
): void {
  // データをシリアライズ
  const csv = stringify(rows, options)

  // Blob作成
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })

  // ダウンロード用のリンクを内部的に構築
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename

  try {
    // クリック起動。この動作でCSVファイルとしてダウンロードされる
    document.body.appendChild(a)
    a.click()
  } finally {
    // 例外が起きても確実にリンク破棄と Object URL 解放を行う（メモリリーク防止）
    // a.remove() は親が無くても例外を投げないため appendChild 失敗時も安全
    a.remove()
    URL.revokeObjectURL(url)
  }
}
