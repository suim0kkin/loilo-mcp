![image](https://github-production-user-asset-6210df.s3.amazonaws.com/343793908/701909537-4ad23c61-2345-46fc-9478-939cf965959c.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAVCODYLSA53PQK4ZA%2F20261111%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261111T045714Z&X-Amz-Expires=300&X-Amz-Signature=c4db2d509967ed4377fb2f182a15630a95e5869b3834e8943db49a40a0060756&X-Amz-SignedHeaders=host&response-content-type=image%2Fpng)
<h1 align="center">loilo-mcp</h1>

<p align="center">
  <b>ロイロノート（LoiLoNote）向け Model Context Protocol (MCP) サーバー & 自動化ツールキット</b><br>
  Chrome DevTools Protocol (CDP) 連携・リッチテキスト/数式装飾・Mermaid ダイアグラム自動配置
</p>

<p align="center">
  <a href="https://技術者倫理.com"><img src="https://img.shields.io/badge/%E6%8A%80%E8%A1%93%E8%80%85%E5%80%AB%E7%90%86-%E9%81%B5%E5%AE%88%E6%B8%88%E3%81%BF-0a0a0a?style=flat-square&labelColor=ffffff" alt="技術者倫理 遵守済み"></a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg?style=flat-square" alt="Node.js >= 18">
  <img src="https://img.shields.io/badge/Tests-187%20passing-brightgreen.svg?style=flat-square" alt="Tests 187 passing">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT">
</p>

---

## 📖 概要

**loilo-mcp** は、教育プラットフォーム「ロイロノート・スクール（[loilonote.app](https://loilonote.app)）」を外部の AI やスクリプトから操作するための Model Context Protocol (MCP) サーバーおよびクライアントライブラリです。

外部 npm パッケージに依存せず、Node.js ネイティブ実装で動作します。

### ✨ 主な機能

1. **リッチテキスト & 数式装飾パーサー (`rich_text_parser.mjs`)**
   - **Markdown**: 見出し（`#` 〜 `######`）、太字（`**text**`）、斜体（`*text*`）、取り消し線（`~~text~~`）、インラインコード
   - **LaTeX**: `\textbf{}`, `\textit{}`, `\textcolor{red}{}`, `\huge{}`, `\small{}` 等
   - **HTML**: `<b>`, `<i>`, `<u>`, `<s>`, `<color value="...">`, `<size value="...">`, `<red>`, `<blue>` などのカラータグ
   - **数式保護**: `$E=mc^2$` や `$$\sum x_i$$` などの LaTeX 数式を崩さず保護（`$50` などの通貨記号とも自動判別）
   - **属性自動コンパイル**: ロイロノートのカード編集コマンドが求める属性配列（`attributes` / `attribute_ranges`）へオフラインで即座に変換

2. **Mermaid ダイアグラム変換 (`mermaid_converter.mjs`)**
   - Mermaid 記法のフローチャート（`TD`, `LR`, `BT`, `RL`）からカード群と有向コネクタを自動生成
   - ノード形状に応じたカード色（長方形=白、角丸=水色、スタジアム=緑、ひし形=ピンク、円形=黄色、円柱=青）の自動マッピング
   - トポロジカルソートによる重なりのないカード座標の自動計算（循環参照を含むグラフでも安全に動作）
   - スタンドアロン実行可能な `.mjs` 自動化スクリプトの出力

3. **デジタル庁デザインシステム (DADS) 準拠テンプレート (全12種)**
   - 表紙、目次、年表、3本柱、因果関係、引用、大判数値、縦積み論理、比較、4象限マトリクス、循環サイクル、総括の各テンプレートを用意

4. **公式 UI 準拠の自動化クライアント (`loilo_client.mjs`)**
   - Chrome DevTools Protocol (CDP) 経由でブラウザを操作
   - カード作成・レイアウト整列・コネクタ接続・提出・高圧縮 WebP スクリーンショット撮影に対応

---

## 🚀 クイックスタート

### 1. リモートデバッグ用 Chrome を起動
```bash
./bin/launch_chrome_debug.sh
```

### 2. ロイロノートにログイン
起動した Chrome で [loilonote.app](https://loilonote.app) を開き、ログインして対象のノートを開きます。

### 3. スクリプトの実行

```bash
# リッチテキスト装飾 & Mermaid 変換サンプル
npm run example:rich-text

# DADS スライド作成サンプル
npm run example

# 多階層カード作成サンプル
npm run example:bullying

# テスト実行 (187 テスト)
npm test
```

---

## ⚙️ MCP クライアント設定

Claude Desktop や Cursor / Antigravity から MCP サーバーとして利用できます。

### 設定例 (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "loilo": {
      "command": "node",
      "args": ["/path/to/loilo-mcp/src/loilo_mcp_server.mjs"]
    }
  }
}
```

---

## 🛠️ 提供 MCP ツール一覧

| ツール名 | 説明 | 主要引数 |
| :--- | :--- | :--- |
| `loilo_parse_styled_text` | Markdown/LaTeX/HTML 装飾テキストを解析し、属性配列をドライラン出力（オフライン対応） | `text` (必須), `base_font_size`, `base_color`, `default_bold` |
| `loilo_convert_mermaid_to_mjs` | Mermaid ダイアグラムから実行可能な `.mjs` スクリプトと配置メタデータを生成（オフライン対応） | `mermaid_text` (必須), `direction`, `card_width`, `card_height`, `base_font_size` |
| `loilo_create_cards_from_mermaid` | Mermaid 定義からキャンバス上にカード・装飾・コネクタを一括自動作成 | `mermaid_text` (必須), `direction`, `card_width`, `card_height`, `base_font_size` |
| `loilo_set_card_style` | カードの本文・文字サイズ・色を設定（Markdown/LaTeX/数式のインライン装飾対応） | `card_id`, `text`, `font_size`, `forecolor`, `is_bold` |
| `loilo_create_note` | 指定クラスで新規ノートを作成して開く | `note_name` (必須), `class_name` |
| `loilo_get_canvas_state` | キャンバス上の全カード・親子階層・コネクタ接続情報を取得 | なし |
| `loilo_create_white_card` | ツールバーから白背景テキストカードを作成 | なし |
| `loilo_format_card` | エディタを開いてテキスト本文や書式を設定 | `card_id`, `text`, `font_size`, `color_rgb`, `is_bold` |
| `loilo_layout_cards` | カードの位置座標と表示サイズを一括整列 | `layout_list` |
| `loilo_connect_cards` | 2枚のカード間に有向矢印コネクタを接続 | `source_card_id`, `target_card_id` |
| `loilo_create_slide_from_template` | DADS テンプレートに基づいてスライドを作成 | `template_name`, `template_props` |
| `loilo_apply_template_to_card` | 既存カードに DADS テンプレートを適用 | `card_id`, `template_name`, `template_props` |
| `loilo_list_templates` | 利用可能な DADS テンプレート一覧（12種類）を取得 | なし |
| `loilo_submit_card` | 指定した提出箱へカードをドラッグ提出 | `card_id`, `box_keyword` |
| `loilo_take_screenshot` | 画面全体を高効率 WebP 形式で保存 | `file_path`, `quality` |

---

## 💡 提供 MCP プロンプト一覧

| プロンプト名 | 説明 | 引数 |
| :--- | :--- | :--- |
| `generate_styled_card` | Markdown・LaTeX 記法・数式を含むカード本文の作成プロンプト | `topic` (必須), `card_type`, `tone`, `include_math`, `style`, `target_audience` |
| `generate_mermaid_card_deck` | ロイロノートのカード群・コネクタに変換可能な Mermaid 定義の作成プロンプト | `topic` (必須), `diagram_type`, `direction`, `max_nodes` |

---

## 📁 ディレクトリ構成

```text
loilo-mcp/
├── src/
│   ├── loilo_mcp_server.mjs   # MCP サーバー本体（stdio JSON-RPC）
│   ├── loilo_client.mjs       # CDP 自動化クライアントコア
│   ├── rich_text_parser.mjs   # リッチテキスト & LaTeX 装飾パーサー
│   ├── mermaid_converter.mjs  # Mermaid 変換 & .mjs ジェネレーター
│   └── dads_templates.mjs     # DADS スライドテンプレート（全12種）
├── bin/
│   └── launch_chrome_debug.sh # デバッグ用 Chrome 起動スクリプト
├── examples/
│   ├── rich_text_and_mermaid_example.mjs # 装飾 & Mermaid 統合サンプル
│   ├── basic_example.mjs      # DADS スライド生成基本サンプル
│   └── anti_bullying_cards.mjs# 多階層スライド作成サンプル
├── test/
│   ├── rich_text_parser.test.mjs  # パーサー単体テスト
│   └── mermaid_converter.test.mjs # Mermaid 変換テスト
├── package.json
└── README.md
```

---

## 📄 ライセンス

本プロジェクトは [MIT License](LICENSE) のもとで公開されています。