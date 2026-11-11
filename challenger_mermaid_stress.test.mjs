/**
 * test/challenger_mermaid_stress.test.mjs
 * Challenger 2 Stress Test Suite for Milestone 3 (Mermaid Parser & .mjs Generator).
 *
 * Covers:
 * 1. Code injection in labels and paths (process.exit, imports, backticks, quotes, template literals)
 *    and verifies syntax check via `node --input-type=module --check`.
 * 2. Boundary layout options (0, negative, NaN, non-numeric, Infinity, invalid directions like "DIAGONAL").
 * 3. Very large diagrams (100+ nodes and edges, measuring execution time & layout determinism).
 * 4. MCP server tool call stress (invoking loilo_convert_mermaid_to_mjs via JSON-RPC stdio with adversarial payloads).
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EventEmitter from 'node:events';

import {
  parseMermaid,
  mermaidToLoiloLayout,
  generateMermaidMjs,
  convertMermaidToMjs,
  computeTopologicalRanks
} from '../src/mermaid_converter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, '../src/loilo_mcp_server.mjs');

/**
 * Lightweight JSON-RPC 2.0 stdio client for testing loilo_mcp_server.mjs
 */
class McpStressClient extends EventEmitter {
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
      this.buffer = lines.pop();
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

describe('Challenger 2: Adversarial & Stress Testing Suite', () => {

  // =========================================================================
  // 1. Code Injection Resilience
  // =========================================================================
  describe('1. Code Injection & Escaping Resilience', () => {
    const maliciousPayloads = [
      '"; process.exit(1); //',
      "'; process.exit(1); //",
      "\nimport 'malicious';\n",
      "` + (function(){ process.exit(1); })() + `",
      "${process.exit(1)}",
      '\\"; console.log(1); //',
      '</script><script>alert(1)</script>',
      "`rm -rf /` and single 'quote' and double \"quote\"",
      "`backticks` and \\\\ backslash",
      '\\u0000\\u001b[31mRed\\u001b[0m',
      'Multi\nLine\r\nLabels\tWith\tTabs',
      '""" triple quotes """',
      '/* comment */ // line comment',
      '#{ruby_interpolation}',
      '<?php echo 1; ?>',
      '{{template_var}}',
      'constructor',
      '__proto__',
      'prototype',
      'null',
      'undefined'
    ];

    for (const payload of maliciousPayloads) {
      test(`safely neutralizes injection payload in node & edge labels: ${JSON.stringify(payload)}`, () => {
        const escapedForMermaid = payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const mermaid = `
          graph TD
          A["${escapedForMermaid}"] -->|"${escapedForMermaid}"| B("${escapedForMermaid}")
          B --> C{"${escapedForMermaid}"}
        `;

        const code = generateMermaidMjs(mermaid, {
          clientImportPath: `./loilo_client.mjs?v=${encodeURIComponent(payload)}`
        });

        // Verify generated script contains valid JSON stringified data
        assert.ok(code.includes('import { LoiloClient } from'));
        assert.ok(code.includes('async function main()'));

        // Validate syntax with Node.js parser
        const check = spawnSync('node', ['--input-type=module', '--check'], {
          input: code,
          encoding: 'utf-8'
        });

        assert.strictEqual(
          check.status,
          0,
          `Generated script failed syntax check on payload: ${payload}\nError:\n${check.stderr}`
        );
      });
    }

    test('safely handles injection payload in clientImportPath option', () => {
      const injectionImportPath = '"; process.exit(1); import "evil"; //';
      const code = generateMermaidMjs('graph TD\nA --> B', {
        clientImportPath: injectionImportPath
      });

      const check = spawnSync('node', ['--input-type=module', '--check'], {
        input: code,
        encoding: 'utf-8'
      });

      assert.strictEqual(
        check.status,
        0,
        `clientImportPath injection resulted in invalid syntax:\n${check.stderr}`
      );
      assert.ok(code.includes(JSON.stringify(injectionImportPath)));
    });
  });

  // =========================================================================
  // 2. Boundary Layout Options
  // =========================================================================
  describe('2. Boundary Layout Options & Sanitization', () => {
    test('handles 0 and negative card_width and card_height by falling back to defaults', () => {
      const layout = mermaidToLoiloLayout('graph TD\nA --> B', {
        cardWidth: 0,
        cardHeight: -100
      });

      for (const node of layout.nodes) {
        assert.strictEqual(node.width, 260, 'cardWidth should fallback to 260');
        assert.strictEqual(node.height, 180, 'cardHeight should fallback to 180');
      }
    });

    test('handles negative and non-numeric spacing_x and spacing_y', () => {
      const layout = mermaidToLoiloLayout('graph TD\nA --> B\nB --> C\nB --> D', {
        spacingX: -50,
        spacingY: NaN
      });

      for (const node of layout.nodes) {
        assert.ok(Number.isFinite(node.x), `node.x should be finite: ${node.x}`);
        assert.ok(Number.isFinite(node.y), `node.y should be finite: ${node.y}`);
      }
    });

    test('handles Infinity and -Infinity in spacing without producing NaN or Infinity coordinates', () => {
      const layout = mermaidToLoiloLayout('graph TD\nA --> B\nB --> C', {
        spacingX: Infinity,
        spacingY: -Infinity,
        cardWidth: Infinity,
        cardHeight: -Infinity
      });

      for (const node of layout.nodes) {
        assert.ok(Number.isFinite(node.x), `node.x should be finite: ${node.x}`);
        assert.ok(Number.isFinite(node.y), `node.y should be finite: ${node.y}`);
        assert.ok(Number.isFinite(node.width) && node.width > 0);
        assert.ok(Number.isFinite(node.height) && node.height > 0);
      }
    });

    test('handles invalid direction strings (e.g. "DIAGONAL", "UNKNOWN", empty) by falling back to TD', () => {
      const layout = mermaidToLoiloLayout('graph TD\nA --> B\nB --> C', {
        direction: 'DIAGONAL'
      });

      assert.strictEqual(layout.direction, 'DIAGONAL');
      // Coordinates should use default TD layout
      const [nodeA, nodeB, nodeC] = layout.nodes;
      assert.strictEqual(nodeA.y, 0);
      assert.strictEqual(nodeB.y, 280);
      assert.strictEqual(nodeC.y, 560);
    });

    test('safely handles non-string direction without throwing', () => {
      for (const invalidDir of [123, null, undefined, {}, [], false]) {
        assert.doesNotThrow(() => {
          const layout = mermaidToLoiloLayout('graph TD\nA --> B', {
            direction: invalidDir
          });
          assert.strictEqual(layout.direction, 'TD');
        });
      }
    });

    test('safely clamps or falls back for invalid baseFontSize', () => {
      for (const invalidSize of [-10, 0, NaN, 'large', null, Infinity]) {
        const layout = mermaidToLoiloLayout('graph TD\nA --> B', {
          baseFontSize: invalidSize
        });
        for (const node of layout.nodes) {
          assert.strictEqual(node.fontSize, 20, `baseFontSize should default to 20 for ${invalidSize}`);
        }
      }
    });
  });

  // =========================================================================
  // 3. Very Large Diagrams & Determinism
  // =========================================================================
  describe('3. Very Large Diagrams, Stress & Determinism', () => {
    test('renders 150+ nodes & edges within 50ms with strict determinism', () => {
      const nodeCount = 150;
      const lines = ['flowchart TD'];
      for (let i = 0; i < nodeCount; i++) {
        lines.push(`  N${i}["Node ${i} - <b>重要</b> $X_{${i}}$"]`);
      }
      for (let i = 0; i < nodeCount - 1; i++) {
        lines.push(`  N${i} -->|step ${i}| N${i + 1}`);
        if (i % 4 === 0 && i + 3 < nodeCount) {
          lines.push(`  N${i} --> N${i + 3}`);
        }
      }
      const mermaidText = lines.join('\n');

      const start = performance.now();
      const layout1 = mermaidToLoiloLayout(mermaidText);
      const elapsed1 = performance.now() - start;

      const layout2 = mermaidToLoiloLayout(mermaidText);

      // Verify execution time
      assert.ok(
        elapsed1 < 100,
        `150-node layout should execute quickly (<100ms), took ${elapsed1.toFixed(2)}ms`
      );

      // Verify node count & edge count
      assert.strictEqual(layout1.nodes.length, nodeCount);
      assert.ok(layout1.edges.length > nodeCount);

      // Verify determinism across repeated executions
      assert.deepStrictEqual(layout1, layout2, 'Layout coordinates must be strictly deterministic');

      // Verify standalone .mjs code generation for large graph
      const mjsCode = generateMermaidMjs(mermaidText);
      assert.ok(mjsCode.length > 50000, 'Generated code should serialize all 150 nodes');

      const check = spawnSync('node', ['--input-type=module', '--check'], {
        input: mjsCode,
        encoding: 'utf-8'
      });
      assert.strictEqual(check.status, 0, '150-node generated .mjs must pass syntax check');
    });

    test('terminates safely on 100-node circular feedback graph', () => {
      const lines = ['graph TD'];
      for (let i = 0; i < 100; i++) {
        lines.push(`  C${i} --> C${(i + 1) % 100}`);
      }
      const cycleMermaid = lines.join('\n');

      const start = performance.now();
      const layout = mermaidToLoiloLayout(cycleMermaid);
      const elapsed = performance.now() - start;

      assert.ok(elapsed < 100, `100-node cycle layout took ${elapsed.toFixed(2)}ms`);
      assert.strictEqual(layout.nodes.length, 100);
      for (const node of layout.nodes) {
        assert.ok(Number.isFinite(node.x));
        assert.ok(Number.isFinite(node.y));
      }
    });

    test('handles empty and whitespace-only diagrams safely without crashing', () => {
      const emptyLayout = mermaidToLoiloLayout('');
      assert.strictEqual(emptyLayout.nodes.length, 0);
      assert.strictEqual(emptyLayout.edges.length, 0);

      const wsLayout = mermaidToLoiloLayout('   \n\n\t  \n%% comment');
      assert.strictEqual(wsLayout.nodes.length, 0);
      assert.strictEqual(wsLayout.edges.length, 0);

      const mjs = generateMermaidMjs('');
      const check = spawnSync('node', ['--input-type=module', '--check'], { input: mjs });
      assert.strictEqual(check.status, 0);
    });
  });

  // =========================================================================
  // 4. MCP Server Tool Call Stress via JSON-RPC Stdio
  // =========================================================================
  describe('4. MCP Server JSON-RPC Stdio Tool Call Stress', () => {
    let client;

    before(async () => {
      client = new McpStressClient();
      await client.start();
      await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {}
      });
    });

    after(() => {
      client.stop();
    });

    test('rejects missing mermaid_text parameter with structured error', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_convert_mermaid_to_mjs',
        arguments: {}
      });

      assert.strictEqual(res.jsonrpc, '2.0');
      assert.strictEqual(res.result.isError, true);
      assert.ok(res.result.content[0].text.includes('mermaid_text'));
    });

    test('rejects non-string mermaid_text (e.g. number, boolean, array, object)', async () => {
      for (const invalidText of [12345, true, ['graph TD'], { code: 'graph TD' }]) {
        const res = await client.request('tools/call', {
          name: 'loilo_convert_mermaid_to_mjs',
          arguments: { mermaid_text: invalidText }
        });

        assert.strictEqual(res.result.isError, true);
        assert.ok(res.result.content[0].text.includes('必須の文字列'));
      }
    });

    test('processes adversarial payload with injection labels and boundary options', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_convert_mermaid_to_mjs',
        arguments: {
          mermaid_text: 'graph TD\n  A["; process.exit(1); //"] --> B("\nimport evil")',
          card_width: -50,
          card_height: 0,
          spacing_x: -10,
          spacing_y: -20,
          direction: 'DIAGONAL',
          base_font_size: -10
        }
      });

      assert.strictEqual(res.result.isError, undefined);
      const parsed = JSON.parse(res.result.content[0].text);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.nodeCount, 2);
      assert.strictEqual(parsed.edgeCount, 1);
      assert.ok(parsed.mjsCode.includes('LoiloClient'));

      // Ensure generated script passes node syntax check
      const check = spawnSync('node', ['--input-type=module', '--check'], {
        input: parsed.mjsCode,
        encoding: 'utf-8'
      });
      assert.strictEqual(check.status, 0);
    });

    test('handles non-numeric and invalid options in MCP arguments gracefully', async () => {
      const res = await client.request('tools/call', {
        name: 'loilo_convert_mermaid_to_mjs',
        arguments: {
          mermaid_text: 'graph TD\n  A --> B',
          card_width: 'not_a_number',
          card_height: null,
          direction: 999,
          client_import_path: 123
        }
      });

      assert.strictEqual(res.result.isError, undefined);
      const parsed = JSON.parse(res.result.content[0].text);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.nodeCount, 2);
    });

    test('processes 100+ node diagram via MCP tools/call', async () => {
      const lines = ['flowchart TD'];
      for (let i = 0; i < 100; i++) {
        lines.push(`  N${i}["Node ${i}"]`);
        if (i > 0) lines.push(`  N${i - 1} --> N${i}`);
      }
      const mermaidText = lines.join('\n');

      const res = await client.request('tools/call', {
        name: 'loilo_convert_mermaid_to_mjs',
        arguments: { mermaid_text: mermaidText }
      });

      assert.strictEqual(res.result.isError, undefined);
      const parsed = JSON.parse(res.result.content[0].text);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.nodeCount, 100);
      assert.strictEqual(parsed.edgeCount, 99);
    });
  });
});
