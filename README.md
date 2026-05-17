# web-csv

ブラウザ向けのCSVパース・シリアライズ機能を提供するライブラリです。

## 特徴

- TypeScriptで実装しています。
- フロントエンドで動作します。
- 別のライブラリへの依存を減らし、ライブラリ自体のサイズを減らしています。
- エラーハンドリングにResult型を採用しています。

## インストール

GitHub から直接インストールしてください。

```bash
pnpm add github:naka93-gh/web-csv
# バージョン固定する場合
pnpm add github:naka93-gh/web-csv#v0.1.0
```

## 使い方

```ts
import { parse, downloadCSV } from "web-csv";

// 読み込み
const result = parse<{ name: string; age: string }>("name,age\nAlice,30");
if (result.ok) console.log(result.data); // [{ name: 'Alice', age: '30' }]

// 書き出し（ダウンロード起動）
downloadCSV(users, "users.csv", { headers: ["id", "name", "email"] });
```
