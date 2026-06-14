import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadCSV } from '../../src/browser/download'

describe('downloadCSV', () => {
  beforeEach(() => {
    // URL の Object URL 関連を spyOn で差し替え（restoreAllMocks で自動復元される）
    // happy-dom 環境で実際にダウンロードが起きないようにモック化する目的
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Blob を生成して aタグでダウンロードを起動する', () => {
    // createObjectURL → click → revokeObjectURL の一連の流れがすべて呼ばれることを担保
    // revokeObjectURL を忘れるとメモリリークになるため、呼び出し確認が重要
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadCSV([{ name: 'Alice', age: 30 }], 'users.csv')
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('生成 Blob の MIME は text/csv;charset=utf-8', () => {
    // ブラウザに「CSVファイルとして保存」させるための MIME type が正しいことを担保
    const captured: { blob: Blob | null } = { blob: null }
    vi.mocked(URL.createObjectURL).mockImplementation((blob) => {
      captured.blob = blob as Blob
      return 'blob:mock-url'
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadCSV([{ a: 1 }], 'test.csv')
    expect(captured.blob).not.toBeNull()
    expect(captured.blob?.type).toBe('text/csv;charset=utf-8')
  })

  it('指定したファイル名で download 属性が設定される', () => {
    // <a download="..."> 属性によりブラウザの保存ダイアログにファイル名が表示される
    let capturedDownload = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      capturedDownload = this.download
    })
    downloadCSV([{ a: 1 }], 'data.csv')
    expect(capturedDownload).toBe('data.csv')
  })

  it('click が例外を投げても Object URL 解放とリンク破棄が行われる', () => {
    // try/finally により、例外時も revokeObjectURL と <a> 除去が漏れないことを担保
    // （漏れると Object URL と DOM 要素がリークする）
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('click失敗')
    })
    expect(() => downloadCSV([{ a: 1 }], 'test.csv')).toThrow('click失敗')
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce()
    expect(document.querySelector('a')).toBeNull()
  })
})
