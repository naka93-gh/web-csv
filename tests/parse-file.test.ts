import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseFile } from '../src/parse'

describe('parseFile', () => {
  afterEach(() => {
    // spyOn したものを自動復元（テスト失敗時の汚染防止）
    vi.restoreAllMocks()
  })

  it('File オブジェクトを読み込んでパースする', async () => {
    // <input type="file"> から取得した File を直接渡せることを担保
    const file = new File(['name,age\nAlice,30'], 'test.csv', { type: 'text/csv' })
    const result = await parseFile<{ name: string; age: string }>(file)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual([{ name: 'Alice', age: '30' }])
  })

  it('BOM付き File を正しくパースする', async () => {
    // Excel が出力した File（先頭BOMあり）でもキー名がずれないことを担保
    const file = new File(['﻿name,age\nAlice,30'], 'test.csv', { type: 'text/csv' })
    const result = await parseFile(file)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual([{ name: 'Alice', age: '30' }])
  })

  it('parse のオプションを引き継ぐ (header: false)', async () => {
    // parseFile は parse のラッパー。オプションが透過的に渡ることを担保
    const file = new File(['1,2\n3,4'], 'test.csv', { type: 'text/csv' })
    const result = await parseFile(file, { header: false, headers: ['a', 'b'] })
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.data).toEqual([
        { a: '1', b: '2' },
        { a: '3', b: '4' },
      ])
  })

  it('File.text() が失敗した場合は file-read エラーを返す', async () => {
    // I/Oエラーを例外にせず、Result.error として返す設計を担保
    const file = new File(['dummy'], 'test.csv', { type: 'text/csv' })
    vi.spyOn(file, 'text').mockRejectedValue(new Error('読込失敗'))
    const result = await parseFile(file)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('file-read')
      expect(result.error.message).toBe('読込失敗')
    }
  })

  it('File.text() が Error 以外で reject した場合もデフォルトメッセージで返す', async () => {
    // Error インスタンス以外で reject されても堅牢に処理することを担保
    const file = new File(['dummy'], 'test.csv', { type: 'text/csv' })
    vi.spyOn(file, 'text').mockRejectedValue('予期しないエラー')
    const result = await parseFile(file)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('file-read')
      expect(result.error.message).toBe('ファイル読込に失敗しました')
    }
  })
})
