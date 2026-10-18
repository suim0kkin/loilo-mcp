[README.md](https://github.com/user-attachments/files/33624831/README.md)
# LoiLoNote Official UI-driven MCP & Automation Toolkit

ロイロノート（`https://loilonote.app`）を対象とした Model Context Protocol (MCP) サーバーおよび自動化クライアントです。

---

## 📁 ディレクトリ構成

```text
loilo-mcp/
├── src/
│   ├── loilo_mcp_server.mjs   # MCP サーバー本体（stdio JSON-RPC 2.0）
│   ├── loilo_client.mjs       # 公式UI自動化クライアントコア（CDP/Fiber知覚/公式コマンド）
│   └── dads_templates.mjs     # デジタル庁デザインシステム（DADS）テンプレートエンジン（全12種）
├── bin/
│   └── launch_chrome_debug.sh # リモートデバッグ (9222) 用 Chrome 起動スクリプト
├── examples/
│   ├── basic_example.mjs      # 基本サンプル（DADSスライド生成・整列・コネクタ・撮影）
│   └── anti_bullying_cards.mjs# 実践サンプル（多階層スライド作成例）
├── package.json               # プロジェクト定義
├── LICENSE                    # MIT License
└── README.md
```

## 🚀 利用手順

### Step 1: デバッグ用 Chrome を起動
```bash
./bin/launch_chrome_debug.sh
```

### Step 2: 目的のクラス・ノートを開く
ブラウザでロイロノートにログインし、対象のノート画面を開きます。

### Step 3: 実行

#### サンプルスクリプト実行（スライド生成・カードインカード構築・コネクタ接続）
```bash
npm run example
```

#### MCPサーバー単体起動
```bash
npm start
```

---

## ⚙️ MCP クライアント設定例

### Claude Desktop (`claude_desktop_config.json`)
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

### Antigravity / Cursor
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

## 🛠️ 提供MCPツール一覧 (`loilo-mcp`)

| ツール名 | 説明 | 主要引数 |
| :--- | :--- | :--- |
| `loilo_create_note` | 指定クラスへ切り替え、指定ノート名で新規ノートを作成して開く | `note_name` (必須), `class_name` (任意) |
| `loilo_get_canvas_state` | 現在のキャンバス上の全カード・親子階層・コネクタ接続を取得 | なし |
| `loilo_create_white_card` | 公式ツールバーパレットから白背景テキストカードを新規作成 | なし |
| `loilo_format_card` | エディタを開き本文・フォントサイズ・太字・文字色を設定 | `card_id`, `text`, `font_size`, `color_rgb`, `is_bold` |
| `loilo_set_card_style` | 公式コマンドディスパッチャ経由でスタイルを即時反映 | `card_id`, `text`, `font_size`, `forecolor`, `is_bold` |
| `loilo_layout_cards` | カードの位置座標および表示サイズを一括整列 | `layout_list` |
| `loilo_connect_cards` | カード間に有向矢印コネクタを接続 | `source_card_id`, `target_card_id` |
| `loilo_create_slide_from_template` | DADSスライドテンプレートに基づきカードインカードを構築 | `template_name`, `template_props` |
| `loilo_apply_template_to_card` | 既存カードにDADSテンプレートを適用 | `card_id`, `template_name`, `template_props` |
| `loilo_list_templates` | 利用可能なDADSテンプレート一覧を取得 | なし |
| `loilo_submit_card` | 指定提出箱へ公式UIドラッグ提出 | `card_id`, `box_keyword` |
| `loilo_take_screenshot` | 画面全体を高効率WebP形式で撮影・保存 | `file_path`, `quality` |

---

## 📄 ライセンス

本プロジェクトは [MIT License](LICENSE) のもとで公開されています。
