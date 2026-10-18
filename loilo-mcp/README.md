# LoiLoNote Official UI-driven MCP & Automation Toolkit

ロイロノート（`https://loilonote.app`）を対象とした、**推測プロパティ注入ゼロ・公式UI駆動** の Model Context Protocol (MCP) サーバーおよび自動化クライアントです。

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

| ファイル | 役割 |
| :--- | :--- |
| `src/loilo_client.mjs` | **公式UI自動化クライアントコア**: CDP接続、Fiber非破壊知覚、白・カラーカード生成、公式コマンド内包（`treeStateChanged`）、削除（`cardDeleted`）、カード配置レイアウト（`cardSizesChanged`）、カード連結（`connectorConnected`）、ズームフィット（`handleJustFitZoom`）、ドラッグ提出、DADSカードインカード構築を完備 |
| `src/dads_templates.mjs` | **DADS テンプレートエンジン**: デジタル庁デザインシステム（DADS）全ビジュアル体系（全12種類）のカードインカード幾何定義・子カード連結定義・親カードテキスト（テキスト内アスキーアート完全排除・150字以内自動ガード内包）を定義 |
| `src/loilo_mcp_server.mjs` | **MCP サーバー**: `LoiloClient` および `dads_templates.mjs` をバックエンドとし、標準入出力（stdio JSON-RPC 2.0）経由で全機能をエクスポートするサーバー |
| `bin/launch_chrome_debug.sh` | デバッグポート (`9222`) を開放して Chrome を起動するスクリプト |
| `examples/basic_example.mjs` | **基本サンプル**: DADS全ビジュアル準拠のスライド生成、カードインカード内包・配置・連結、水平整列、ズームフィット、WebPスクリーンショット撮影を実行 |

---

## 🎨 デジタル庁デザインシステム（DADS）準拠 スライド・カード設計標準

ロイロMCPおよび自動化スクリプトを用いて資料・カードを作成する際は、**デジタル庁デザインシステム（DADS: Digital Agency Design System）**（`https://design.digital.go.jp/dads/`）のガイドラインを厳格に適用します。

### 1. テキスト内アスキーアートの完全排除とネイティブDAG化原則
- **テキスト記号による疑似図解の完全禁止**:
  - `──▶` や `▼` などの矢印記号、`┌─ ─┐` や `┏━━┓` などの枠線・罫線テキスト表現は一切行わない。
  - すべて「親カードの中に配置された本物のカード（子カード）」と「本物の有向矢印コネクタ」で表現する。
- **2重DAGトポロジーと幾何学的次元適合性**:
  - **短語横展開 (Horizontal Flow)**: 短い言葉・キーワード・順接ステップの遷移は、X軸方向（横）に子カードを並べて横矢印コネクタで連結。
  - **長文縦積み (Vertical Stack)**: 長文・論理展開・階層構造は、Y軸方向（縦）に子カードを積み上げて下向き縦矢印コネクタで連結。
  - **中央並列・下部説明 (Parallel Gallery with Base Summary)**: 制度の3本柱、比較対照、多面評価などの並列事案は、親カードの中央にカラー子カード群を等間隔並列（ギャラリー配置）し、親カード下部に統括解説を配置。

### 2. DADS デザイントークンとアクセシビリティ原則
- **アクセシビリティファースト (WCAG 2.1 AA 準拠)**:
  - テキストと背景のコントラスト比は **4.5:1 以上**（大見出しは 3:1 以上）を数学的に保証。
  - 親カードは純白背景（`#FFFFFFFF`）に対し、本文は高コントラストな黒文字（`#FF000000`、比率 21:1）で統一。
- **子カードのカラーパレット仕様**:
  - 親カードは白背景を厳守。
  - 親カード内に内包する子カードは、認知性を高めるために**白以外のカラー**（青・緑・黄・赤・ピンク・橙）を使用。
  - 子カード内には「短い単語・キーワード」を配置し、視覚的インフォグラフィックスとして機能させる。
- **文字色の用途限定（強調専用・DADS Accent Red）**:
  - カード単位での本文色分けは視覚的ノイズとなるため禁止。
  - 強調色文字は結論や最重要メッセージに限定し、DADS推奨のアクセシブルな赤（`#FFC00000`、比率 5.8:1）を使用。
- **入れ子子カードの文字サイズ下限制約 (9/20 原則)**:
  - 親カード本文のフォントサイズ $S_{\text{parent}}$ に対し、内包された子カードのフォントサイズ $S_{\text{child}}$ は **20分の9（45%）以上** を数学的に保証する:
    $$S_{\text{child}} \ge \left\lceil \frac{9}{20} S_{\text{parent}} \right\rceil$$
  - 親カード本文が $24\text{pt}$ の場合、子カードは最低 $11\text{pt}$ 以上（標準実装では $15\text{pt}$ / 比率 $62.5\%$ を適用）。
  - `dads_templates.mjs` の `validateChildFontSize` ガードおよび `loilo_client.mjs` の `buildDadsSlide` により、設定フォントサイズが下限を下回ることを自動防止。
- **150文字制限と自動バリデーションガード**:
  - 情報の過密を防ぎ認知負荷を最小化するため、1枚の親カードの本文は**150文字以内**を厳守。
  - `dads_templates.mjs` の全テンプレート関数に `validateCharCount` ガードを内包し、超過時は自動調整。

### 3. 公式UI駆動提出プロトコル
- **安全なドラッグ＆ドロップ提出**:
  - 画面左側ツールバーの「提出」ボタンに対し、先頭カードをCDPドラッグ＆ドロップ。
- **2段階ダイアログの自動処理**:
  1. 締め切り済みの提出箱であっても、「締め切り済みの提出箱」（`.submissionDialogExpiredSection .uiButton`）を展開して目的の提出箱（指定キーワード）を選択。
  2. 「締め切り警告ダイアログ（OK）」および過去提出時の「再提出確認ダイアログ（OK）」を連続的・決定論的に検知して自動承認。

### 4. 高効率画像圧縮標準（WebP形式の原則）
- **PNG保存の全廃とWebP（`.webp`）標準化**:
  - スクリーンショットや成果物画像は、可逆PNGと比較してファイルサイズを約50%〜64%削減できる高効率フォーマット **WebP (`.webp`)** を標準とする。
  - Chrome DevTools Protocol (`Page.captureScreenshot`) ネイティブ機能により外部依存ゼロで高品質保存。

---

## 📚 DADS 全ビジュアル対応 テンプレート集（全12種類）

`src/dads_templates.mjs` にて定義され、全テンプレートが**親カード本文（上部題名＋下部解説、アスキーアートゼロ）**、**内包子カード群（カラー・キーワード・幾何配置）**、**子カード間有向コネクタ**を完備しています。

| # | テンプレート名 | 用途・ビジュアル形式 | 子カード配置トポロジー | コネクタ連結 |
|---|---|---|---|---|
| 1 | **`cover`** | 表紙 / カバー | 中央にタイトルバッジ＋作成者バッジ | なし |
| 2 | **`agenda`** | 目次 / ステップフロー | 中央に4ステップ横並び（青・緑・黄・赤） | 01 $\to$ 02 $\to$ 03 $\to$ 04 (横矢印) |
| 3 | **`timeline`** | 時代区分 / 年表 | 中央に4時代横並び（青・緑・黄・桃） | 時代1 $\to$ 2 $\to$ 3 $\to$ 4 (横矢印) |
| 4 | **`multiPillars`** | 制度の3本柱 / 多項目 | 中央に3〜4本柱等間隔並列（青・緑・黄） | なし (並列ギャラリー) |
| 5 | **`causeOutcome`** | 因果チェーン / 国難克服 | 中央に危機 $\to$ 政策 $\to$ 成果 横並び | 危機 $\to$ 決断 $\to$ 成果 (横矢印) |
| 6 | **`quoteCallout`** | 演説・引用コールアウト | 中央に演説者バッジ＋名言カード | 演説者 $\to$ 名言 (横矢印) |
| 7 | **`bigMetrics`** | 統計・重要数値バッジ | 中央に特大数値バッジ（赤）＋施策（青） | なし (数値強調並列) |
| 8 | **`verticalStack`** | 垂直論理スタック | 中央に3層縦積み（上層 $\downarrow$ 中層 $\downarrow$ 下層） | 上層 $\downarrow$ 中層 $\downarrow$ 下層 (縦矢印) |
| 9 | **`comparison`** | 2項目統治哲学対比 | 中央に左モデル（青） vs 右モデル（橙） | なし (左右並列対比) |
| 10 | **`quadrantMatrix`** | 2x2 マトリクス・4象限 | 中央に4象限グリッド（赤・緑・青・黄） | なし (4象限ギャラリー) |
| 11 | **`cycleFlow`** | 循環サイクル / PDCA | 中央に4要素環状配置（青・緑・黄・赤） | 1 $\to$ 2 $\to$ 3 $\to$ 4 $\to$ 1 (ループ矢印) |
| 12 | **`summaryFlow`** | 総括・結論強調フロー | 中央に前提横並び $\to$ 結論赤色強調 | 前提 $\to$ 展開 $\to$ 結論 (横矢印) |

---

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
