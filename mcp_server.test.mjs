/**
 * test/mcp_server.test.mjs
 * Integration Test Suite for LoiLoNote Model Context Protocol (MCP) Server
 *
 * Requirements: TEST_INFRA.md, PROJECT.md, and explorer_3_report.md
 * - Tier 1: MCP Feature Coverage (initialize, ping, tools/list, tools/call, prompts/list, prompts/get)
 * - Tier 2: Boundary & Corner Cases (Method Not Found, Malformed JSON, Invalid Params, Pipelining, Payloads, Unicode/Emojis, Clamping)
 *
 * Zero external dependencies: Uses node:test, node:assert/strict, node:child_process.
 * Operates purely over stdio JSON-RPC 2.0 child processes without external browser requirement.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import EventEmitter from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, '../src/loilo_mcp_server.mjs');

/**
 * Lightweight helper client managing stdio JSON-RPC 2.0 communication
 */
class McpTestClient extends EventEmitter {
  constructor(serverPath = SERVER_PATH) {
    super();
    this.serverPath = serverPath;
    this.process = null;
    this.buffer = '';
    this.pendingRequests = new Map();
    this.nextId = 1;
  }

  async start() {
    this.process = spawn('node', [this.serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    this.process.stdout.setEncoding('utf-8');
    this.process.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop(); // keep remainder
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
            const { resolve, timer } = this.pendingRequests.get(msg.id);
            clearTimeout(timer);
            this.pendingRequests.delete(msg.id);
            resolve(msg);
          } else {
            this.emit('message', msg);
          }
        } catch (err) {
          this.emit('rawError', line, err);
        }
      }
    });

    this.process.stderr.on('data', (d) => {
      this.emit('stderr', d.toString());
    });

    return new Promise((resolve) => setTimeout(resolve, 150));
  }

  request(method, params = {}, timeoutMs = 4000) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP Request timed out (${timeoutMs}ms): method=${method}, id=${id}`));
        }
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.process.stdin.write(payload);
    });
  }

  notify(method, params = {}) {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.process.stdin.write(payload);
  }

  sendRaw(rawString) {
    this.process.stdin.write(rawString + '\n');
  }

  stop() {
    if (this.process) {
      for (const [id, req] of this.pendingRequests.entries()) {
        clearTimeout(req.timer);
        req.reject(new Error('Process terminated'));
      }
      this.pendingRequests.clear();
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }
}

describe('MCP Server Integration Tests', () => {
  let client;

  before(async () => {
    client = new McpTestClient();
    await client.start();
  });

  after(() => {
    client.stop();
  });

  describe('Tier 1: Feature Coverage', () => {
    test('T1-MCP-01: initialize returns protocolVersion, serverInfo, and capabilities including tools and prompts', async () => {
      const res = await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {}
      });
      assert.strictEqual(res.jsonrpc, '2.0');
      assert.strictEqual(res.result.protocolVersion, '2024-11-05');
      assert.strictEqual(res.result.serverInfo.name, 'loilo-mcp-server');
      assert.ok(res.result.capabilities.tools, 'capabilities.tools must be present');
      assert.ok(res.result.capabilities.prompts, 'capabilities.prompts must be present');
    });

    test('T1-MCP-02: notifications/initialized produces no response', async () => {
      let receivedAny = false;
      const onMsg = () => { receivedAny = true; };
      client.on('message', onMsg);
      client.notify('notifications/initialized');
      await new Promise(r => setTimeout(r, 200));
      client.off('message', onMsg);
      assert.strictEqual(receivedAny, false);
    });

    test('T1-MCP-03: ping returns empty result', async () => {
      const res = await client.request('ping');
      assert.strictEqual(res.jsonrpc, '2.0');
      assert.deepEqual(res.result, {});
    });

    test('T1-MCP-04: tools/list contains official LoiLo tools including loilo_set_card_style, loilo_parse_styled_text, and Mermaid tools', async () => {
      const res = await client.request('tools/list');
      const tools = res.result?.tools;
      assert.ok(Array.isArray(tools), 'tools must be an array');
      assert.ok(tools.length >= 13, 'Tool count should reflect added Mermaid tools');

      // Verify loilo_set_card_style updated metadata
      const setStyleTool = tools.find(t => t.name === 'loilo_set_card_style');
      assert.ok(setStyleTool, 'loilo_set_card_style must be present');
      assert.ok(setStyleTool.inputSchema.required.includes('card_id'));
      assert.ok(setStyleTool.inputSchema.required.includes('text'));
      assert.ok(
        setStyleTool.description.includes('LaTeX') ||
        setStyleTool.description.includes('Markdown') ||
        setStyleTool.description.includes('装飾'),
        'loilo_set_card_style description must document rich styling support'
      );

      // Verify loilo_parse_styled_text metadata
      const parseTool = tools.find(t => t.name === 'loilo_parse_styled_text');
      assert.ok(parseTool, 'loilo_parse_styled_text must be present in tools/list');
      assert.deepEqual(parseTool.inputSchema.required, ['text']);
      assert.ok(parseTool.inputSchema.properties.text);
      assert.ok(parseTool.inputSchema.properties.base_font_size);
      assert.ok(parseTool.inputSchema.properties.base_color);
      assert.ok(parseTool.inputSchema.properties.default_bold);

      // Verify loilo_convert_mermaid_to_mjs metadata
      const convertMermaidTool = tools.find(t => t.name === 'loilo_convert_mermaid_to_mjs');
      assert.ok(convertMermaidTool, 'loilo_convert_mermaid_to_mjs must be present in tools/list');
      assert.deepEqual(convertMermaidTool.inputSchema.required, ['mermaid_text']);
      assert.ok(convertMermaidTool.inputSchema.properties.mermaid_text);
      assert.ok(convertMermaidTool.inputSchema.properties.direction);
      assert.ok(convertMermaidTool.inputSchema.properties.card_width);
      assert.ok(convertMermaidTool.inputSchema.properties.card_height);
      assert.ok(convertMermaidTool.inputSchema.properties.spacing_x);
      assert.ok(convertMermaidTool.inputSchema.properties.spacing_y);
      assert.ok(convertMermaidTool.inputSchema.properties.base_font_size);
      assert.ok(convertMermaidTool.inputSchema.properties.client_import_path);

      // Verify loilo_create_cards_from_mermaid metadata
      const createMermaidTool = tools.find(t => t.name === 'loilo_create_cards_from_mermaid');
      assert.ok(createMermaidTool, 'loilo_create_cards_from_mermaid must be present in tools/list');
      assert.deepEqual(createMermaidTool.inputSchema.required, ['mermaid_text']);
      assert.ok(createMermaidTool.inputSchema.properties.mermaid_text);

      const formatTool = tools.find(t => t.name === 'loilo_format_card');
      assert.ok(formatTool);

      const canvasTool = tools.find(t => t.name === 'loilo_get_canvas_state');
      assert.ok(canvasTool);
    });

    test('T1-MCP-05: tools/call loilo_parse_styled_text dry-run executes successfully offline', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: '**太字** と \\textbf{強調}', base_font_size: 24 }
      });

      assert.strictEqual(res.error, undefined, 'Must not return JSON-RPC error');
      assert.strictEqual(res.result?.isError, undefined, 'Must not return tool error');
      assert.ok(Array.isArray(res.result?.content), 'Result must have content array');
      assert.strictEqual(res.result.content[0].type, 'text');

      const parsed = JSON.parse(res.result.content[0].text);
      assert.strictEqual(parsed.cleanText, '太字 と 強調');
      assert.ok(Array.isArray(parsed.attributes));
      assert.ok(Array.isArray(parsed.attributeRanges));
      assert.strictEqual(parsed.attributesCount, parsed.attributes.length);
      assert.strictEqual(parsed.attributeRangesCount, parsed.attributeRanges.length);
      assert.ok(parsed.attributesCount >= 4, 'Should contain at least 4 baseline fallback attributes');
      assert.ok(Array.isArray(parsed.styleRanges), 'styleRanges must be an array');
      assert.ok(parsed.styleRanges.length >= 2, 'styleRanges must contain both bold ranges');
      assert.ok(parsed.styleRanges.some(r => r.type === 'bold' || r.bold));
    });

    test('T1-MCP-06: tools/call loilo_parse_styled_text preserves LaTeX math without crashing', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: '数式 $E=mc^2$ と $$\\int_0^1 x dx$$' }
      });

      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.result?.isError, undefined);
      const textContent = res.result.content[0]?.text;
      assert.ok(textContent, 'content[0].text must be non-empty');

      const parsed = JSON.parse(textContent);
      assert.strictEqual(parsed.cleanText, '数式 $E=mc^2$ と $$\\int_0^1 x dx$$');
      assert.strictEqual(parsed.styleRanges.length, 0, 'Math expression must not generate false style ranges');
    });

    test('T1-MCP-07: tools/call loilo_parse_styled_text handles colors and font scaling', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: '\\textcolor{red}{\\huge{見出し}}', base_font_size: 20 }
      });

      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.result?.isError, undefined);
      const textContent = res.result.content[0]?.text;
      assert.ok(textContent, 'content[0].text must be non-empty');

      const parsed = JSON.parse(textContent);
      assert.strictEqual(parsed.cleanText, '見出し');

      // huge multiplier is 2.0; 20 * 2.0 = 40
      const fontAttr = parsed.attributes?.find(a => a.type === 'font' && a.value?.size === 40);
      assert.ok(fontAttr, 'Scaled font attribute of size 40 must exist');

      const colorAttr = parsed.attributes?.find(a => a.type === 'foreground_color' && a.value === '#FFED1E14');
      assert.ok(colorAttr, 'Red foreground color attribute (#FFED1E14) must exist');
    });

    test('T1-MCP-08: prompts/list returns registered prompts including generate_styled_card', async () => {
      const res = await client.request('prompts/list');

      assert.strictEqual(res.error, undefined, 'Must not return method not found error');
      assert.ok(res.result, 'prompts/list must return result');
      assert.ok(Array.isArray(res.result.prompts), 'result.prompts must be an array');
      const prompt = res.result.prompts.find(p => p.name === 'generate_styled_card');
      assert.ok(prompt, 'Prompt generate_styled_card must be returned');
      assert.ok(prompt.description && prompt.description.length > 10);
      assert.ok(Array.isArray(prompt.arguments));

      const topicArg = prompt.arguments.find(a => a.name === 'topic');
      assert.ok(topicArg, 'topic argument must be present');
      assert.strictEqual(topicArg.required, true);
    });

    test('T1-MCP-09: prompts/get returns structured prompt messages with styling guidelines', async () => {
      const res = await client.request('prompts/get', {
        name: 'generate_styled_card',
        arguments: { topic: '光合成の仕組み' }
      });

      assert.strictEqual(res.error, undefined, 'Must not return error for valid prompt request');
      assert.ok(res.result?.description);
      assert.ok(Array.isArray(res.result?.messages));
      assert.ok(res.result.messages.length >= 1);

      const msg = res.result.messages[0];
      assert.strictEqual(msg.role, 'user');
      assert.strictEqual(msg.content.type, 'text');
      assert.ok(msg.content.text.includes('光合成の仕組み'), 'Message text must interpolate topic');
      assert.ok(
        msg.content.text.includes('\\textbf') || msg.content.text.includes('**'),
        'Prompt guidelines must mention bold formatting syntax'
      );
      assert.ok(
        msg.content.text.includes('\\textcolor') || msg.content.text.includes('<red>'),
        'Prompt guidelines must mention color formatting syntax'
      );
      assert.ok(
        msg.content.text.includes('$') || msg.content.text.includes('数式'),
        'Prompt guidelines must mention LaTeX math formula rules'
      );
    });

    test('T1-MCP-10: prompts/list and prompts/get support generate_mermaid_card_deck', async () => {
      const listRes = await client.request('prompts/list');
      const mermaidPrompt = listRes.result?.prompts?.find(p => p.name === 'generate_mermaid_card_deck');
      assert.ok(mermaidPrompt, 'generate_mermaid_card_deck must be registered in prompts/list');
      assert.ok(mermaidPrompt.arguments.some(a => a.name === 'topic' && a.required === true));

      const getRes = await client.request('prompts/get', {
        name: 'generate_mermaid_card_deck',
        arguments: { topic: '日本の三権分立', diagram_type: 'flowchart', direction: 'TD' }
      });

      assert.strictEqual(getRes.error, undefined);
      assert.ok(getRes.result?.description);
      const text = getRes.result.messages[0].content.text;
      assert.ok(text.includes('日本の三権分立'));
      assert.ok(text.includes('flowchart TD') || text.includes('flowchart'));
      assert.ok(text.includes('しろいろ') || text.includes('white'));
      assert.ok(text.includes('みどりいろ') || text.includes('green'));
    });

    test('T1-MCP-11: tools/call loilo_convert_mermaid_to_mjs converts diagram and produces node-executable syntax', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_convert_mermaid_to_mjs',
        arguments: {
          mermaid_text: `
            flowchart TD
            A([スタート]) --> B{判定処理}
            B -->|OK| C[完了カード]
            B -->|NG| D[(エラー記録)]
          `,
          direction: 'TD',
          base_font_size: 22
        }
      });

      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.result?.isError, undefined);
      assert.ok(Array.isArray(res.result?.content));

      const parsed = JSON.parse(res.result.content[0].text);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.nodeCount, 4);
      assert.strictEqual(parsed.edgeCount, 3);
      assert.ok(parsed.mjsCode && typeof parsed.mjsCode === 'string');
      assert.strictEqual(parsed.mjs_code, parsed.mjsCode);

      // Verify node syntax check passes
      const checkRes = spawnSync('node', ['--input-type=module', '--check'], {
        input: parsed.mjsCode,
        encoding: 'utf-8'
      });
      assert.strictEqual(checkRes.status, 0, `Generated mjs_code must pass node --check: ${checkRes.stderr}`);
    });
  });

  describe('Tier 2: Boundary & Corner Cases', () => {
    test('T2-MCP-01: unknown method returns -32601 Method Not Found', async () => {
      const res = await client.request('non_existent_method_xyz');
      assert.ok(res.error);
      assert.strictEqual(res.error.code, -32601);
      assert.ok(res.error.message.includes('Method not found'));
    });

    test('T2-MCP-02: malformed JSON payload does not crash server', async () => {
      client.sendRaw('{"broken json');
      // Follow up with valid ping to verify server is alive and functioning
      const res = await client.request('ping');
      assert.deepEqual(res.result, {});
    });

    test('T2-MCP-03: empty JSON object, null, and primitive payloads do not throw unhandled exception or crash server', async () => {
      client.sendRaw('{}');
      client.sendRaw('null');
      client.sendRaw('123');
      client.sendRaw('"string_value"');
      client.sendRaw('true');
      const res = await client.request('ping');
      assert.deepEqual(res.result, {});
    });

    test('T2-MCP-04: tools/call with missing required parameters handles error safely', async () => {
      const resStyle = await client.request('tools/call', {
        name: 'loilo_set_card_style',
        arguments: {}
      });
      assert.ok(resStyle.error || resStyle.result?.isError);

      const resParse = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: {}
      });
      assert.ok(resParse.error || resParse.result?.isError, 'Missing text parameter must trigger error');

      const resMermaidConvert = await client.request('tools/call', {
        name: 'loilo_convert_mermaid_to_mjs',
        arguments: {}
      });
      assert.ok(resMermaidConvert.error || resMermaidConvert.result?.isError, 'Missing mermaid_text must trigger error');
    });

    test('T2-MCP-05: tools/call with unknown tool returns error message cleanly without CDP connection attempt', async () => {
      const res = await client.request('tools/call', {
        name: 'unknown_tool_nonexistent',
        arguments: {}
      });
      assert.ok(res.result?.isError, 'Should return tool error');
      const errorMsg = res.result.content?.[0]?.text || '';
      assert.ok(errorMsg.includes('未知のツールです: unknown_tool_nonexistent'), 'Should report unknown tool error without CDP port 9222 connection failure');
      assert.ok(!errorMsg.includes('port 9222'), 'Must not attempt to connect to CDP on unknown tool');
    });

    test('T2-MCP-06: boundary: tools/call handles out-of-range base_font_size with clamping', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: 'テスト本文', base_font_size: -10 }
      });
      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.result?.isError, undefined);
      const parsed = JSON.parse(res.result.content[0].text);
      assert.strictEqual(parsed.cleanText, 'テスト本文');
      const baseAttr = parsed.attributes.find(a => a.type === 'font');
      assert.strictEqual(baseAttr.value.size, 10, 'Negative font size must clamp to MIN_FONT_SIZE (10)');
    });

    test('T2-MCP-07: boundary: tools/call handles non-numeric base_font_size with fallback', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: 'テスト本文', base_font_size: 'abc' }
      });
      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.result?.isError, undefined);
      const parsed = JSON.parse(res.result.content[0].text);
      assert.strictEqual(parsed.cleanText, 'テスト本文');
      const baseAttr = parsed.attributes.find(a => a.type === 'font');
      assert.strictEqual(baseAttr.value.size, 24, 'Non-numeric font size must fallback to 24');
    });

    test('T2-MCP-08: boundary: tools/call handles invalid hex color format with fallback', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: 'テスト本文', base_color: 'invalid-color' }
      });
      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.result?.isError, undefined);
      const parsed = JSON.parse(res.result.content[0].text);
      const colorAttr = parsed.attributes.find(a => a.type === 'foreground_color');
      assert.strictEqual(colorAttr.value, '#FF000000', 'Invalid color must fallback to #FF000000');
    });

    test('T2-MCP-09: prompts/get with unrecognized prompt name returns clean error', async () => {
      const res = await client.request('prompts/get', {
        name: 'invalid_prompt_name'
      });
      assert.ok(res.error || res.result?.isError);
      if (res.error) {
        assert.strictEqual(res.error.code, -32602, 'Should return -32602 Invalid params for unknown prompt');
      }
    });

    test('T2-MCP-10: prompts/get with missing parameters returns clean error', async () => {
      const res = await client.request('prompts/get', {});
      assert.ok(res.error || res.result?.isError);
      if (res.error) {
        assert.strictEqual(res.error.code, -32602);
      }
    });

    test('T2-MCP-11: pipelined parallel requests are handled with correct id correlation', async () => {
      const p1 = client.request('ping');
      const p2 = client.request('tools/list');
      const p3 = client.request('ping');
      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      assert.deepEqual(r1.result, {});
      assert.ok(Array.isArray(r2.result.tools));
      assert.deepEqual(r3.result, {});
    });

    test('T2-MCP-12: empty text and large payload are processed cleanly without hang', async () => {
      const emptyRes = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: '' }
      });
      assert.strictEqual(emptyRes.error, undefined);
      assert.strictEqual(emptyRes.result?.isError, undefined);
      const emptyParsed = JSON.parse(emptyRes.result.content[0].text);
      assert.strictEqual(emptyParsed.cleanText, '');
      assert.strictEqual(emptyParsed.styleRanges.length, 0);

      const largeText = '通常テキストと\\textbf{太字}。'.repeat(250);
      const largeRes = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: largeText }
      });
      assert.strictEqual(largeRes.error, undefined);
      assert.strictEqual(largeRes.result?.isError, undefined);
      const largeParsed = JSON.parse(largeRes.result.content[0].text);
      assert.strictEqual(largeParsed.cleanText.length, 2500);
      assert.strictEqual(largeParsed.styleRanges.length, 250);
    });

    test('T2-MCP-13: boundary: tools/call preserves exact UTF-16 surrogate pair and Japanese offsets', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: '🎉 **祝賀イベント** と \\textcolor{blue}{🚀 発射}' }
      });
      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.result?.isError, undefined);
      const parsed = JSON.parse(res.result.content[0].text);
      assert.strictEqual(parsed.cleanText, '🎉 祝賀イベント と 🚀 発射');

      // Verify UTF-16 location mapping
      // '🎉 ' = 3 code units
      const boldHighlight = parsed.attributeRanges[0];
      assert.strictEqual(boldHighlight.range.location, 3);
      assert.strictEqual(boldHighlight.range.length, 6);
      assert.strictEqual(parsed.cleanText.slice(boldHighlight.range.location, boldHighlight.range.location + boldHighlight.range.length), '祝賀イベント');

      // '🎉 祝賀イベント と ' = 3 + 6 + 3 = 12 code units
      const blueHighlight = parsed.attributeRanges[1];
      assert.strictEqual(blueHighlight.range.location, 12);
      assert.strictEqual(blueHighlight.range.length, 5); // '🚀 発射' (2 + 1 + 2 = 5)
      assert.strictEqual(parsed.cleanText.slice(blueHighlight.range.location, blueHighlight.range.location + blueHighlight.range.length), '🚀 発射');
    });

    test('T2-MCP-14: boundary: tools/call clamps extreme upper base_font_size to MAX_FONT_SIZE (120)', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: '巨大文字テスト', base_font_size: 9999 }
      });
      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.result?.isError, undefined);
      const parsed = JSON.parse(res.result.content[0].text);
      const baseAttr = parsed.attributes.find(a => a.type === 'font');
      assert.strictEqual(baseAttr.value.size, 120, 'Extreme font size must be clamped to 120');
    });

    test('T2-MCP-15: prompts/get interpolates optional style and target_audience arguments', async () => {
      const res = await client.request('prompts/get', {
        name: 'generate_styled_card',
        arguments: {
          topic: '情報科学の歴史',
          style: 'academic',
          target_audience: '高校生'
        }
      });
      assert.strictEqual(res.error, undefined);
      const text = res.result.messages[0].content.text;
      assert.ok(text.includes('情報科学の歴史'));
      assert.ok(text.includes('academic') || text.includes('高校生') || text.includes('対象'));
    });

    test('T2-MCP-16: tools/call loilo_parse_styled_text merges compound font attributes into single object', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_parse_styled_text',
        arguments: { text: '\\huge{\\textbf{タイトル}}', base_font_size: 24 }
      });
      assert.strictEqual(res.error, undefined);
      assert.strictEqual(res.result?.isError, undefined);
      const parsed = JSON.parse(res.result.content[0].text);
      assert.strictEqual(parsed.cleanText, 'タイトル');

      const highlightRange = parsed.attributeRanges[0];
      const compoundFont = parsed.attributes[highlightRange.index];
      assert.strictEqual(compoundFont.type, 'font');
      assert.strictEqual(compoundFont.value.bold, true);
      assert.strictEqual(compoundFont.value.size, 48); // 24 * 2.0 = 48
    });
  });
});
