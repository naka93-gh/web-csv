import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'

describe('parse', () => {
  // ヘッダーあり/データのみ/空入力など、典型的なCSVが正しくオブジェクト化されることを担保
  describe('基本動作', () => {
    it('ヘッダー付きCSVをオブジェクト配列にパースする', () => {
      const text = 'name,age\nAlice,30\nBob,25'
      const result = parse<{ name: string; age: string }>(text)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data).toEqual([
          { name: 'Alice', age: '30' },
          { name: 'Bob', age: '25' },
        ])
      }
    })

    it('単一データ行のCSVをパースする', () => {
      const result = parse('name,age\nAlice,30')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ name: 'Alice', age: '30' }])
    })

    it('ヘッダーのみ（データ行なし）の場合は空配列を返す', () => {
      const result = parse('name,age')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([])
    })

    it('空文字列の場合は空配列を返す', () => {
      const result = parse('')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([])
    })
  })

  // RFC 4180 で定義される引用符の扱い（区切り文字や改行を含む値、エスケープ）の正しさを担保
  describe('引用符の処理', () => {
    it('引用符で囲まれたフィールドをパースする', () => {
      const result = parse('name,age\n"Alice",30')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ name: 'Alice', age: '30' }])
    })

    it('引用符内のカンマをデータとして扱う', () => {
      // 引用符内の , はフィールド区切りにならない
      const result = parse('name,desc\n"Alice","Hello, World"')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ name: 'Alice', desc: 'Hello, World' }])
    })

    it('引用符内の改行をデータとして扱う', () => {
      // 引用符内の \n は行区切りにならず、値の一部として保持される
      const result = parse('name,memo\n"Alice","line1\nline2"')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ name: 'Alice', memo: 'line1\nline2' }])
    })

    it('連続する2つの引用符("")をエスケープされた引用符として扱う', () => {
      // RFC 4180: 引用符内で " を表すには "" と書く
      const result = parse('name,quote\n"Alice","say ""Hi"""')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ name: 'Alice', quote: 'say "Hi"' }])
    })

    it('引用符で囲まれた空フィールド', () => {
      const result = parse('a,b\n"","x"')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ a: '', b: 'x' }])
    })
  })

  // Excel(CRLF) / Unix(LF) / Mac Classic(CR) のいずれも受け付ける必要があるため網羅
  describe('改行コード', () => {
    it('LF (\\n) で区切られたCSV', () => {
      const result = parse('a,b\n1,2\n3,4')
      expect(result.ok).toBe(true)
      if (result.ok)
        expect(result.data).toEqual([
          { a: '1', b: '2' },
          { a: '3', b: '4' },
        ])
    })

    it('CRLF (\\r\\n) で区切られたCSV', () => {
      const result = parse('a,b\r\n1,2\r\n3,4')
      expect(result.ok).toBe(true)
      if (result.ok)
        expect(result.data).toEqual([
          { a: '1', b: '2' },
          { a: '3', b: '4' },
        ])
    })

    it('CR (\\r) のみで区切られたCSV', () => {
      const result = parse('a,b\r1,2\r3,4')
      expect(result.ok).toBe(true)
      if (result.ok)
        expect(result.data).toEqual([
          { a: '1', b: '2' },
          { a: '3', b: '4' },
        ])
    })

    it('改行コード混在のCSV', () => {
      // 異なる環境で編集されたCSVが混在することは実務で頻発するため検証
      const result = parse('a,b\n1,2\r\n3,4\r5,6')
      expect(result.ok).toBe(true)
      if (result.ok)
        expect(result.data).toEqual([
          { a: '1', b: '2' },
          { a: '3', b: '4' },
          { a: '5', b: '6' },
        ])
    })

    it('末尾の改行を無視する', () => {
      // テキストエディタが末尾に改行を入れる慣習があるため、空行を生まないように担保
      const result = parse('a,b\n1,2\n')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ a: '1', b: '2' }])
    })
  })

  // Excel が出力するCSVには先頭にBOMが付くことが多いため、自動除去を担保
  describe('BOM', () => {
    it('UTF-8 BOM を除去してパースする', () => {
      // 先頭の ﻿ が BOM (U+FEFF)。除去しないとヘッダー名がずれる
      const result = parse('﻿name,age\nAlice,30')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ name: 'Alice', age: '30' }])
    })
  })

  // 空行・空フィールドの扱いは実データで揺れがちなので、デフォルト挙動とオプション両方を担保
  describe('空行とフィールド', () => {
    it('skipEmptyLines (デフォルト true) で空行をスキップする', () => {
      const result = parse('a,b\n1,2\n\n3,4')
      expect(result.ok).toBe(true)
      if (result.ok)
        expect(result.data).toEqual([
          { a: '1', b: '2' },
          { a: '3', b: '4' },
        ])
    })

    it('skipEmptyLines: false では空行も保持する', () => {
      // 行番号を保ちたい用途（行単位で外部システムと突合など）のためのオプション
      const result = parse('a,b\n1,2\n\n3,4', { skipEmptyLines: false })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data.length).toBe(3)
    })

    it('skipEmptyLines: false でも末尾改行(LF)は空行を生まない', () => {
      // 末尾改行はファイル終端の慣習でありデータ行ではない。
      // skipEmptyLines: false でも幻の空行を生まないことを担保
      const result = parse('a,b\n1,2\n', { skipEmptyLines: false })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ a: '1', b: '2' }])
    })

    it('skipEmptyLines: false でも末尾改行(CRLF)は空行を生まない', () => {
      const result = parse('a,b\r\n1,2\r\n', { skipEmptyLines: false })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ a: '1', b: '2' }])
    })

    it('全行が空行のCSV（改行のみ）は空配列を返す', () => {
      // フィルタ後に行が0件になるケースの早期return分岐を担保
      const result = parse('\n')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([])
    })

    it('途中の空フィールドを空文字列として扱う', () => {
      const result = parse('a,b,c\n1,,3')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ a: '1', b: '', c: '3' }])
    })

    it('末尾カンマを空フィールドとして扱う', () => {
      const result = parse('a,b,c\n1,2,')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ a: '1', b: '2', c: '' }])
    })

    it('先頭カンマを空フィールドとして扱う', () => {
      const result = parse('a,b,c\n,2,3')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.data).toEqual([{ a: '', b: '2', c: '3' }])
    })
  })

  // ヘッダー行がないCSV（センサーデータなど）への対応分岐を担保
  describe('header オプション', () => {
    it('header: false + headers指定で指定キーのオブジェクト配列', () => {
      const result = parse('1,2\n3,4', { header: false, headers: ['a', 'b'] })
      expect(result.ok).toBe(true)
      if (result.ok)
        expect(result.data).toEqual([
          { a: '1', b: '2' },
          { a: '3', b: '4' },
        ])
    })

    it('header: false で headers 未指定の場合は column0, column1... をキーとする', () => {
      // ヘッダーが完全に未知のCSV処理用のフォールバック挙動
      const result = parse('1,2\n3,4', { header: false })
      expect(result.ok).toBe(true)
      if (result.ok)
        expect(result.data).toEqual([
          { column0: '1', column1: '2' },
          { column0: '3', column1: '4' },
        ])
    })
  })

  // 不正CSVを例外ではなく Result.error として返す設計を担保
  // line 番号が正しく検出されていることも合わせて確認（呼び出し側のエラー表示で利用するため）
  describe('エラーケース', () => {
    it('閉じていない引用符の場合は Result.error を返す', () => {
      const result = parse('name,age\n"Alice,30')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('parse')
        expect(result.error.line).toBeDefined()
      }
    })

    it('引用符の直後に文字が続くと Result.error', () => {
      // 例: "x"y のように引用符終端後にカンマ/改行以外が続く
      const result = parse('a,b\n"x"y,z')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.type).toBe('parse')
    })

    it('フィールド途中で引用符が現れると Result.error', () => {
      // 例: ab"c のようにフィールド先頭以外で引用符が出る
      const result = parse('a,b\nab"c,d')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('parse')
        expect(result.error.line).toBeDefined()
      }
    })

    it('引用符内の \\r でも line がカウントされる（Mac Classic形式の改行）', () => {
      // 引用符内モードでも \r で line++ されることを担保（エラー行番号の正確性のため）
      // "line1\rline2" で1行、\n で1行 → 3行目で不正引用符
      const result = parse('"line1\rline2"\nc"d')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('parse')
        expect(result.error.line).toBe(3)
      }
    })

    it('引用符内の \\r\\n が二重カウントされない', () => {
      // \r で line++ → 次の \n をまとめて消費して二重カウントを防ぐ実装を担保
      // "line1\r\nline2" で1行、\n で1行 → 3行目で不正引用符
      const result = parse('"line1\r\nline2"\nc"d')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('parse')
        expect(result.error.line).toBe(3)
      }
    })
  })
})
