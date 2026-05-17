import { describe, expect, it } from 'vitest'
import { stringify } from '../src/stringify'

describe('stringify', () => {
  // デフォルト挙動が Excel 互換（BOM + CRLF）であることを担保
  describe('基本動作', () => {
    it('オブジェクト配列をCSVにシリアライズする (BOM + CRLF デフォルト)', () => {
      // 先頭の ﻿ が BOM、行末が \r\n になっていることを文字列リテラルで明示
      const rows = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]
      expect(stringify(rows)).toBe('﻿name,age\r\nAlice,30\r\nBob,25')
    })

    it('空配列の場合は BOM のみを返す', () => {
      // データが0件でも BOM は出力する（Excel互換のため）
      expect(stringify([])).toBe('﻿')
    })

    it('bom: false で BOM を付与しない', () => {
      expect(stringify([{ a: 1 }], { bom: false })).toBe('a\r\n1')
    })

    it("newline: '\\n' で LF 区切り", () => {
      // Linux/macOS ツール向けに改行を切り替えできることを担保
      expect(stringify([{ a: 1, b: 2 }], { bom: false, newline: '\n' })).toBe('a,b\n1,2')
    })

    it('1件目のキー順を列順として使う', () => {
      // headers 未指定時は 1件目のキー挿入順を採用する（README で明示推奨と注意書きあり）
      expect(stringify([{ b: 2, a: 1 }], { bom: false })).toBe('b,a\r\n2,1')
    })
  })

  // RFC 4180 のエスケープ規則（特殊文字を含む値は引用符で囲み、内部の " は "" にする）を担保
  describe('引用符のエスケープ', () => {
    it('カンマを含むフィールドを引用符で囲む', () => {
      // , はフィールド区切りなので、値に含まれる場合は引用符で囲まないとCSVが壊れる
      expect(stringify([{ name: 'Alice, B' }], { bom: false })).toBe('name\r\n"Alice, B"')
    })

    it('改行(LF)を含むフィールドを引用符で囲む', () => {
      // \n は行区切りなので、値に含まれる場合は引用符で囲んで保持
      expect(stringify([{ memo: 'line1\nline2' }], { bom: false })).toBe('memo\r\n"line1\nline2"')
    })

    it('CRを含むフィールドを引用符で囲む', () => {
      // \r も行区切り扱いされうるので引用符で囲む
      expect(stringify([{ x: 'a\rb' }], { bom: false })).toBe('x\r\n"a\rb"')
    })

    it('引用符を含むフィールドを"" にエスケープして引用符で囲む', () => {
      // RFC 4180: 引用符内の " は "" にエスケープ。parse 側との対称性も担保
      expect(stringify([{ q: 'say "Hi"' }], { bom: false })).toBe('q\r\n"say ""Hi"""')
    })

    it('特殊文字を含まないフィールドは引用符で囲まない', () => {
      // 必要時のみ引用符で囲む = 出力サイズ削減 + 視覚的ノイズ削減
      expect(stringify([{ a: 'plain text' }], { bom: false })).toBe('a\r\nplain text')
    })
  })

  // ジェネリック T のキーから列の選択・並び替え・表示名変更ができることを担保
  describe('headers / headerLabels', () => {
    it('headers指定で列の順序と種類を制御する', () => {
      // 元データが {a,b,c} でも、headersで指定したキーと順序で出力できる
      expect(stringify([{ a: 1, b: 2, c: 3 }], { bom: false, headers: ['c', 'a'] })).toBe(
        'c,a\r\n3,1',
      )
    })

    it('headerLabels で表示名をマッピング', () => {
      // 業務用語（日本語など）でヘッダーを出力する用途
      const csv = stringify([{ id: 1, name: 'Alice' }], {
        bom: false,
        headers: ['id', 'name'],
        headerLabels: { id: 'ID', name: '名前' },
      })
      expect(csv).toBe('ID,名前\r\n1,Alice')
    })

    it('headerLabels が一部キーのみの場合、残りはキー名のまま', () => {
      // Partial 型で部分指定を許容することを担保
      const csv = stringify([{ id: 1, name: 'Alice' }], {
        bom: false,
        headers: ['id', 'name'],
        headerLabels: { id: 'ID' },
      })
      expect(csv).toBe('ID,name\r\n1,Alice')
    })
  })

  // CSVは文字列ベースなので、各種JS型を妥当な文字列表現に変換することを担保
  describe('値の変換', () => {
    it('数値を文字列に変換する', () => {
      expect(stringify([{ a: 100 }], { bom: false })).toBe('a\r\n100')
    })

    it('null と undefined は空文字列にする', () => {
      // DB の NULL や undefined フィールドを CSV の空セルで表現
      expect(stringify([{ a: null, b: undefined, c: 1 }], { bom: false })).toBe('a,b,c\r\n,,1')
    })

    it('boolean を文字列に変換する', () => {
      expect(stringify([{ a: true, b: false }], { bom: false })).toBe('a,b\r\ntrue,false')
    })
  })

  // Excelで開いたときに数式実行されるリスクを防ぐサニタイズ（デフォルトON）を担保
  describe('CSV インジェクション対策', () => {
    it('= で始まる文字列の先頭にシングルクォートを付ける（デフォルト true）', () => {
      // =SUM(A1:A10) を Excel が数式として評価しないように ' を頭に付ける
      expect(stringify([{ a: '=SUM(A1:A10)' }], { bom: false })).toBe("a\r\n'=SUM(A1:A10)")
    })

    it('+ で始まる文字列もサニタイズ', () => {
      expect(stringify([{ a: '+1234' }], { bom: false })).toBe("a\r\n'+1234")
    })

    it('- で始まる文字列もサニタイズ', () => {
      expect(stringify([{ a: '-1+2' }], { bom: false })).toBe("a\r\n'-1+2")
    })

    it('@ で始まる文字列もサニタイズ', () => {
      // Excel の @import などの関数を防ぐ
      expect(stringify([{ a: '@import' }], { bom: false })).toBe("a\r\n'@import")
    })

    it('sanitizeFormula: false では無効化', () => {
      // 既にサニタイズ済みのデータを再度サニタイズしないための逃げ道
      expect(stringify([{ a: '=SUM()' }], { bom: false, sanitizeFormula: false })).toBe(
        'a\r\n=SUM()',
      )
    })

    it('数値型の負数はサニタイズしない（文字列型のみ対象）', () => {
      // -100 (number) を "'-100" にすると Excel で数値として扱われなくなるため、
      // サニタイズ対象は文字列型に限定する
      expect(stringify([{ a: -100 }], { bom: false })).toBe('a\r\n-100')
    })
  })
})
