import { parse } from '../core/parse.js'
import type {
  InferRow,
  ParseArgs,
  ParseArgsWithSchema,
  ParseOptions,
  ParseResult,
  Schema,
} from '../core/types.js'

/**
 * `<input type="file">` 等で取得したファイルを読み込んでパースする
 *
 * 読み込み失敗時は `{ ok: false, error: { code: 'read-failed' } }` を返す。
 * `schema` の有無・挙動は {@link parse} と同じ
 *
 * @example
 * ```ts
 * const handleChange = async (e: Event) => {
 *   const file = (e.target as HTMLInputElement).files?.[0]
 *   if (!file) return
 *   const result = await parseFile(file, { schema })
 *   if (result.ok) setRows(result.data)
 * }
 * ```
 */
export async function parseFile(
  file: File,
  args?: ParseArgs,
): Promise<ParseResult<Record<string, string>>>
export async function parseFile<S extends Schema>(
  file: File,
  args: ParseArgsWithSchema<S>,
): Promise<ParseResult<InferRow<S>>>
export async function parseFile(
  file: File,
  args: { schema?: Schema; options?: ParseOptions } = {},
): Promise<ParseResult<Record<string, unknown>>> {
  let text: string
  try {
    text = await file.text()
  } catch (e) {
    const message = e instanceof Error ? e.message : 'ファイル読込に失敗しました'
    return { ok: false, error: { code: 'read-failed', message } }
  }
  // parse は throw せず Result を返すため try の外に出す（読み込み失敗だけを read-failed に）。
  // args をそのまま実装へ転送する（オーバーロード選択を介さず、公開型は上の宣言で担保）
  const run = parse as (
    t: string,
    a?: { schema?: Schema; options?: ParseOptions },
  ) => ParseResult<Record<string, unknown>>
  return run(text, args)
}
