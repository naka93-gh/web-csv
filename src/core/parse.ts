import { applySchema, findDuplicateProp, firstDuplicate, type SchemaRow } from './schema.js'
import type {
  FileError,
  InferRow,
  ParseArgs,
  ParseArgsWithSchema,
  ParseOptions,
  ParseResult,
  Schema,
} from './types.js'

const BOM = '﻿'

/** parseRawRows の 1 行（フィールド配列 ＋ 開始行番号） */
type RawRow = { cells: string[]; line: number }

/**
 * CSV文字列をパースする
 *
 * BOM 除去、引用符、複数の改行コード（LF/CRLF/CR）に対応。失敗は例外でなく
 * {@link ParseResult} で返す（`ok:false` の file エラー / `ok:true` の `data`＋行エラー）
 *
 * `schema` を渡すと列を型・必須・既定値・追加検証で検証し、型付き行（`data`）と
 * 検証に落ちた行（`errors`）に分ける。渡さなければ全セル文字列の `Record<string, string>`
 *
 * @example
 * ```ts
 * // 低レベル（全セル文字列）
 * const r1 = parse('name,age\nAlice,30')
 *
 * // schema で型付き
 * const schema = { 名前: { prop: 'name', type: 'string' }, 年齢: { prop: 'age', type: 'number' } } satisfies Schema
 * const r2 = parse('名前,年齢\nAlice,30', { schema })
 * // r2.data: { name: string; age: number | null }[]
 * ```
 */
export function parse(text: string, args?: ParseArgs): ParseResult<Record<string, string>>
export function parse<S extends Schema>(
  text: string,
  args: ParseArgsWithSchema<S>,
): ParseResult<InferRow<S>>
export function parse(
  text: string,
  args: { schema?: Schema; options?: ParseOptions } = {},
): ParseResult<Record<string, unknown>> {
  const { schema, options = {} } = args
  const { headers: explicitHeaders, skipEmptyLines = true } = options
  // header 未指定かつ headers 指定時は header:false 扱いとする（headers を使う意図を汲む）
  const header = options.header ?? explicitHeaders === undefined

  // BOM除去。空文字なら空結果
  const stripped = text.startsWith(BOM) ? text.slice(1) : text
  if (stripped.length === 0) return { ok: true, data: [], errors: [] }

  // 行・列にパース。失敗（引用符不整合 等）は file エラー
  const rowsResult = parseRawRows(stripped)
  if (!rowsResult.ok) return { ok: false, error: rowsResult.error }

  // 空行スキップ（元の行番号は保持）
  const rawRows = skipEmptyLines
    ? rowsResult.rows.filter((r) => isNonEmptyRow(r.cells))
    : rowsResult.rows

  const firstRow = rawRows[0]
  if (!firstRow) return { ok: true, data: [], errors: [] }

  // ヘッダー（キー）と データ行を解決
  let keys: string[]
  let dataRows: RawRow[]
  if (header) {
    keys = firstRow.cells
    dataRows = rawRows.slice(1)
  } else if (explicitHeaders) {
    keys = [...explicitHeaders]
    dataRows = rawRows
  } else {
    keys = Array.from({ length: firstRow.cells.length }, (_, i) => `column${i}`)
    dataRows = rawRows
  }

  // schema 経路: 検証・型付け
  if (schema) return applyParseSchema(keys, dataRows, schema)

  // 低レベル経路: 全セル文字列の Record（同名ヘッダーは後勝ち）
  const data = dataRows.map(
    (row) =>
      Object.fromEntries(keys.map((k, i) => [k, row.cells[i] ?? ''])) as Record<string, string>,
  )
  return { ok: true, data, errors: [] }
}

/**
 * 解決済みヘッダー・データ行に schema を適用する（file エラー / 行エラーを分離）
 */
function applyParseSchema<S extends Schema>(
  keys: string[],
  dataRows: RawRow[],
  schema: S,
): ParseResult<InferRow<S>> {
  // schema の prop 重複は値が黙って上書きされるため入口で拒否
  const dupProp = findDuplicateProp(schema)
  if (dupProp) {
    return fileError('invalid-option', `スキーマの prop が重複しています: ${dupProp}`)
  }

  // 同名ヘッダーは列の対応が一意に決まらないため拒否（後勝ち上書きをやめる）
  const dupHeader = firstDuplicate(keys)
  if (dupHeader !== undefined) {
    return fileError('duplicate-header', `ヘッダーが重複しています: ${dupHeader}`)
  }

  // 必須列（required・defaultValue 無し）がヘッダーに無ければ全行で落ちるため file エラーで早期に弾く
  const headerSet = new Set(keys)
  for (const [name, col] of Object.entries(schema)) {
    if (col.required && col.defaultValue === undefined && !headerSet.has(name)) {
      return fileError('missing-column', `必須列がヘッダーにありません: ${name}`)
    }
  }

  // ヘッダー名 → セル文字列へ（__proto__ 列名対策に Object.create(null)）
  const rows: SchemaRow[] = dataRows.map((row) => {
    const values: Record<string, string> = Object.create(null)
    keys.forEach((k, i) => {
      values[k] = row.cells[i] ?? ''
    })
    return { values, row: row.line }
  })

  const { data, errors } = applySchema(rows, schema)
  return { ok: true, data: data as InferRow<S>[], errors }
}

/**
 * 行データが空行でないかを判定する（空フィールド1つだけの行 [''] を空行とみなす）
 */
function isNonEmptyRow(cells: readonly string[]): boolean {
  return !(cells.length === 1 && cells[0] === '')
}

/**
 * CSVテキスト全体を行と列にパースする
 *
 * 引用符内の改行をデータとして扱うため行分割もここで行う。各行に開始行番号を付ける
 */
function parseRawRows(
  text: string,
): { ok: true; rows: RawRow[] } | { ok: false; error: FileError } {
  const rows: RawRow[] = []
  let currentRow: string[] = []
  let currentField = ''
  let i = 0
  // 現在の物理行番号（1始まり）と、組み立て中の行が始まった行番号
  let line = 1
  let rowStart = 1
  let inQuotes = false

  while (i < text.length) {
    const char = text[i]

    // --- 引用符内モード ---
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // "" はエスケープされた引用符1つとして追加
          currentField += '"'
          i += 2
        } else {
          // 引用符の終端。後続は , か改行か末尾でなければ不正
          inQuotes = false
          i++
          const after = text[i]
          if (after !== undefined && after !== ',' && after !== '\n' && after !== '\r') {
            return {
              ok: false,
              error: {
                code: 'malformed',
                message: `引用符の直後に予期しない文字: "${after}"`,
                line,
              },
            }
          }
        }
      } else {
        // 引用符以外はそのまま取り込む（改行も含む）。\r / \n / \r\n を1行としてカウント
        if (char === '\r') {
          line++
          currentField += char
          i++
          if (text[i] === '\n') {
            currentField += '\n'
            i++
          }
          continue
        }
        if (char === '\n') line++
        currentField += char
        i++
      }
      continue
    }

    // --- 通常モード ---
    // 引用符はフィールド先頭でのみ許可
    if (char === '"') {
      if (currentField.length > 0) {
        return {
          ok: false,
          error: { code: 'malformed', message: 'フィールド途中での引用符は不正です', line },
        }
      }
      inQuotes = true
      i++
      continue
    }

    // カンマ → フィールド確定
    if (char === ',') {
      currentRow.push(currentField)
      currentField = ''
      i++
      continue
    }

    // 改行 → フィールドと行を確定。CRLF は \n もまとめて消費
    if (char === '\r' || char === '\n') {
      currentRow.push(currentField)
      currentField = ''
      rows.push({ cells: currentRow, line: rowStart })
      currentRow = []
      line++
      i++
      if (char === '\r' && text[i] === '\n') i++
      // 次の行はこの行番号から始まる
      rowStart = line
      continue
    }

    // 通常文字
    currentField += char
    i++
  }

  // 閉じられていない引用符は不正
  if (inQuotes) {
    return { ok: false, error: { code: 'malformed', message: '閉じられていない引用符', line } }
  }

  // 末尾に残ったフィールドと行を確定（改行終端時の幻の空行は作らない）
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push({ cells: currentRow, line: rowStart })
  }

  return { ok: true, rows }
}

/**
 * file エラーの ParseResult を作る
 */
function fileError(code: FileError['code'], message: string): ParseResult<never> {
  return { ok: false, error: { code, message } }
}
