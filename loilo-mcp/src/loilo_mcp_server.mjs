#!/usr/bin/env node
/**
 * loilo_mcp_server.mjs
 * Model Context Protocol (MCP) Server for LoiLoNote Official UI Automation.
 *
 * 動作環境: Node.js v22+ / v24 (外部npmパッケージ不要・完全ネイティブ実装)
 * 接続方式: Chrome DevTools Protocol (CDP: http://127.0.0.1:9222)
 *
 * 設計原則 (FEEDBACK-012 準拠):
 * 1. ゼロ推測・安全駆動: 内部プロパティの直接注入を完全排除し、公式UI/DOMイベントおよび公式ディスパッチャのみを使用。
 * 2. 単一責任とモジュール再利用: コアロジックは LoiloClient に集約し、MCPサーバー層はJSON-RPCインターフェースに特化。
 * 3. 確定状態知覚: React Fiber巡回によりキャンバストポロジー（DAG・階層）を非破壊で抽出。
 */

import { LoiloClient } from './loilo_client.mjs';
import { SLIDE_TEMPLATES, DADS_TOKENS } from './dads_templates.mjs';

let sharedClient = null;

async function getClient() {
  if (!sharedClient) {
    sharedClient = new LoiloClient();
    await sharedClient.connect();
  }
  return sharedClient;
}

const TOOLS_MANIFEST = [
  {
    name: 'loilo_get_canvas_state',
    description: 'ロイロノートの現在のキャンバス上に存在する全カード一覧、階層関係、プレゼンテーション連結チェーンを取得します。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'loilo_create_white_card',
    description: '公式ツールバーのカラーパレットから「しろいろ」を選択し、正規の白背景テキストカードを新規作成します。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'loilo_format_card',
    description: '指定したカードをダブルクリックして公式エディタを開き、テキスト本文・文字サイズ・太字・文字色を設定してキャンバスへ復帰します。',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'string', description: '対象カードのUUID' },
        text: { type: 'string', description: 'カードに入力する本文' },
        font_size: { type: 'string', description: 'フォントサイズ (例: "30", "24", "40")' },
        color_rgb: { type: 'string', description: '文字色のRGB部分文字列 (例: "237" (赤), "163" (緑), "206" (紫))' },
        is_bold: { type: 'boolean', description: '太字にするか否か (デフォルト: true)' },
      },
      required: ['card_id', 'text'],
    },
  },
  {
    name: 'loilo_connect_cards',
    description: '公式イベントディスパッチャ（onEmitCardCommand）を用いてカードAからカードBを有向矢印で連結します。',
    inputSchema: {
      type: 'object',
      properties: {
        source_card_id: { type: 'string', description: '連結元カードのID' },
        target_card_id: { type: 'string', description: '連結先カードのID' },
      },
      required: ['source_card_id', 'target_card_id'],
    },
  },
  {
    name: 'loilo_submit_card',
    description: 'カードをツールバーの「提出」アイコンへドラッグ＆ドロップし、指定した提出箱へ提出します。',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'string', description: '提出する先頭カードのID' },
        box_keyword: { type: 'string', description: '提出箱の名称・キーワード' },
      },
      required: ['card_id', 'box_keyword'],
    },
  },
  {
    name: 'loilo_set_card_style',
    description: '公式カードコマンド（cardEdited）を用いて指定したカードの本文・フォントサイズ・太字・文字色（強調色指定など）を正確に反映します。',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'string', description: '対象カードのUUID' },
        text: { type: 'string', description: 'カードに入力する本文' },
        font_size: { type: 'number', description: 'フォントサイズ (デフォルト: 30)' },
        forecolor: { type: 'string', description: '前景色HEX8 (デフォルト: "#FF000000", 強調赤: "#FFED1E14")' },
        is_bold: { type: 'boolean', description: '太字にするか否か (デフォルト: true)' },
      },
      required: ['card_id', 'text'],
    },
  },
  {
    name: 'loilo_layout_cards',
    description: '公式カードコマンド（cardSizesChanged）を用いて複数のカードの位置座標および表示サイズを一括で安全に再配置・整列します。',
    inputSchema: {
      type: 'object',
      properties: {
        layout_list: {
          type: 'array',
          description: '配置指定リスト [{ cardId, position: {x, y}, layoutSize: {width, height} }]',
          items: {
            type: 'object',
            properties: {
              cardId: { type: 'string' },
              position: {
                type: 'object',
                properties: { x: { type: 'number' }, y: { type: 'number' } },
                required: ['x', 'y'],
              },
              layoutSize: {
                type: 'object',
                properties: { width: { type: 'number' }, height: { type: 'number' } },
                required: ['width', 'height'],
              },
            },
            required: ['cardId', 'position', 'layoutSize'],
          },
        },
      },
      required: ['layout_list'],
    },
  },
  {
    name: 'loilo_list_templates',
    description: 'デジタル庁デザインシステム（DADS）準拠の利用可能なスライドテンプレート一覧（10種類）および仕様定義を取得します。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'loilo_create_slide_from_template',
    description: '指定したDADSテンプレート（cover, agenda, threeTierDiagram, timeline, comparison, gridFeature, bigNumber, quote, problemSolution, summary）に基づいて新規白カードを作成し、スタイル・レイアウト・本文を適用します。',
    inputSchema: {
      type: 'object',
      properties: {
        template_name: {
          type: 'string',
          description: 'テンプレート名 (cover, agenda, threeTierDiagram, timeline, comparison, gridFeature, bigNumber, quote, problemSolution, summary)',
        },
        template_props: {
          type: 'object',
          description: 'テンプレートに渡すデータ引数オブジェクト',
        },
      },
      required: ['template_name', 'template_props'],
    },
  },
  {
    name: 'loilo_apply_template_to_card',
    description: 'キャンバス上の既存カードに対してDADSテンプレートを適用し、タイポグラフィと本文を更新します。',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'string', description: '対象カードのUUID' },
        template_name: { type: 'string', description: 'テンプレート名' },
        template_props: { type: 'object', description: 'データ引数オブジェクト' },
      },
      required: ['card_id', 'template_name', 'template_props'],
    },
  },
  {
    name: 'loilo_take_screenshot',
    description: '現在のロイロノート画面全体のスクリーンショットを高圧縮・高品質（デフォルトWebP）で保存します。',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '保存先ファイルパス (推奨: "screenshot.webp", 拡張子省略時は自動で.webpが付加されます)',
        },
        quality: {
          type: 'integer',
          description: '圧縮品質 (1〜100、デフォルト: 85。WebP/JPEG保存時に有効)',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'loilo_create_note',
    description: '指定した授業・クラスに切り替え、指定したノート名で新しいノートを作成してキャンバス画面を開きます。',
    inputSchema: {
      type: 'object',
      properties: {
        note_name: {
          type: 'string',
          description: '作成するノートの名前 (例: "プレゼンテーション01")',
        },
        class_name: {
          type: 'string',
          description: '作成先の授業・クラス名。省略時は現在開いているクラスで作成します。',
        },
      },
      required: ['note_name'],
    },
  },
];

async function handleToolCall(name, args) {
  const client = await getClient();

  switch (name) {
    case 'loilo_get_canvas_state':
      return await client.getCanvasState();

    case 'loilo_create_white_card': {
      const cardId = await client.createWhiteCard();
      return { success: true, cardId };
    }

    case 'loilo_format_card': {
      await client.editCardText(args.card_id, {
        text: args.text,
        fontSize: args.font_size || '30',
        colorRgb: args.color_rgb || null,
        isBold: args.is_bold ?? true,
      });
      return { success: true, cardId: args.card_id };
    }

    case 'loilo_set_card_style': {
      const result = await client.setCardTextAndStyle(args.card_id, {
        text: args.text,
        fontSize: args.font_size ?? 30,
        forecolor: args.forecolor || '#FF000000',
        isBold: args.is_bold ?? true,
      });
      return { success: true, cardId: args.card_id, result };
    }

    case 'loilo_layout_cards': {
      const result = await client.layoutCards(args.layout_list);
      return { success: true, result };
    }

    case 'loilo_connect_cards': {
      const result = await client.connectCards(args.source_card_id, args.target_card_id);
      return { success: true, result };
    }

    case 'loilo_submit_card': {
      await client.submitCardToBox(args.card_id, args.box_keyword);
      return { success: true, cardId: args.card_id, box: args.box_keyword };
    }

    case 'loilo_list_templates': {
      return {
        success: true,
        templates: Object.keys(SLIDE_TEMPLATES),
        tokens: DADS_TOKENS,
      };
    }

    case 'loilo_create_slide_from_template': {
      const result = await client.createSlideFromTemplate(args.template_name, args.template_props || {});
      return { success: true, cardId: result.cardId, slideData: result.slideData };
    }

    case 'loilo_apply_template_to_card': {
      const result = await client.applyTemplateToCard(args.card_id, args.template_name, args.template_props || {});
      return { success: true, cardId: result.cardId, slideData: result.slideData };
    }

    case 'loilo_take_screenshot': {
      const savedPath = await client.takeScreenshot(args.file_path, {
        quality: args.quality,
      });
      return { success: true, savedPath };
    }

    case 'loilo_create_note': {
      const result = await client.createNote({
        noteName: args.note_name,
        className: args.class_name || null,
      });
      return result;
    }

    default:
      throw new Error(`未知のツールです: ${name}`);
  }
}

async function processJsonRpcMessage(rawMessage) {
  try {
    const fs = await import('node:fs');
    fs.appendFileSync('/tmp/loilo_mcp_debug.log', `[${new Date().toISOString()}] RECV: ${rawMessage}\n`);
  } catch {}

  let request;
  try {
    request = JSON.parse(rawMessage);
  } catch {
    return;
  }

  const { id, method, params } = request;

  if (method === 'initialize') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'loilo-mcp-server', version: '2.0.0' },
      },
    };
    const out = JSON.stringify(response) + '\n';
    try {
      const fs = await import('node:fs');
      fs.appendFileSync('/tmp/loilo_mcp_debug.log', `[${new Date().toISOString()}] SEND: ${out}`);
    } catch {}
    process.stdout.write(out);
    return;
  }

  if (method === 'ping') {
    const response = { jsonrpc: '2.0', id, result: {} };
    const out = JSON.stringify(response) + '\n';
    try {
      const fs = await import('node:fs');
      fs.appendFileSync('/tmp/loilo_mcp_debug.log', `[${new Date().toISOString()}] SEND: ${out}`);
    } catch {}
    process.stdout.write(out);
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    const response = {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS_MANIFEST },
    };
    const out = JSON.stringify(response) + '\n';
    try {
      const fs = await import('node:fs');
      fs.appendFileSync('/tmp/loilo_mcp_debug.log', `[${new Date().toISOString()}] SEND: ${out}`);
    } catch {}
    process.stdout.write(out);
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    try {
      const resultPayload = await handleToolCall(name, args || {});
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(resultPayload, null, 2),
            },
          ],
        },
      };
      const out = JSON.stringify(response) + '\n';
      try {
        const fs = await import('node:fs');
        fs.appendFileSync('/tmp/loilo_mcp_debug.log', `[${new Date().toISOString()}] SEND: ${out}`);
      } catch {}
      process.stdout.write(out);
    } catch (err) {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `エラー: ${err.message}`,
            },
          ],
          isError: true,
        },
      };
      const out = JSON.stringify(response) + '\n';
      try {
        const fs = await import('node:fs');
        fs.appendFileSync('/tmp/loilo_mcp_debug.log', `[${new Date().toISOString()}] SEND: ${out}`);
      } catch {}
      process.stdout.write(out);
    }
    return;
  }

  // その他リクエスト（idが存在する場合、エラーを返さないとクライアントがタイムアウトする）
  if (id !== undefined) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
    const out = JSON.stringify(response) + '\n';
    try {
      const fs = await import('node:fs');
      fs.appendFileSync('/tmp/loilo_mcp_debug.log', `[${new Date().toISOString()}] SEND: ${out}`);
    } catch {}
    process.stdout.write(out);
  }
}

let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();
  for (const line of lines) {
    if (line.trim()) {
      processJsonRpcMessage(line.trim());
    }
  }
});
