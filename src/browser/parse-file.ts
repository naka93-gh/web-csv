import { parse } from '../core/parse.js'
import type { ParsedRow, ParseOptions, Result } from '../core/types.js'

/**
 * `<input type="file">` 等で取得したファイルを読み込んでパースする
 * 読み込み失敗時は `{ ok: false, error: { type: 'file-read' } }` を返す
 *
 * @example
 * ```ts
 * const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 *   const file = e.target.files?.[0]
 *   if (!file) return
 *   const result = await parseFile<User>(file)
 *   if (result.ok) setUsers(result.data)
 * }
 * ```
 */
export async function parseFile<T extends object = Record<string, string>>(
  file: File,
  options?: ParseOptions,
): Promise<Result<ParsedRow<T>[]>> {
  try {
    const text = await file.text()
    return parse<T>(text, options)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'ファイル読込に失敗しました'
    return { ok: false, error: { type: 'file-read', message } }
  }
}
