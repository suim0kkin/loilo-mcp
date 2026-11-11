/**
 * test/mermaid_converter.test.mjs
 * Comprehensive unit test suite for Mermaid Parser, Layout Engine, and .mjs Generator.
 *
 * Requirements:
 * - Native Node.js test runner (node:test, node:assert/strict, node:child_process)
 * - Zero external dependencies
 * - Complete coverage of:
 *   1. Header and direction parsing (graph/flowchart TD, TB, LR, BT, RL, case-insensitivity, headerless)
 *   2. Node shapes (6 standard shapes) and color palette mapping
 *   3. Bare nodes and upgrading
 *   4. Edge types, pipe labels, infix labels, undirected edges
 *   5. Chained edges (A --> B --> C)
 *   6. Subgraphs, nesting, and node scoping
 *   7. Japanese, Unicode, and LaTeX inside node labels
 *   8. Layout coordinates calculation for TD, LR, BT, RL
 *   9. Cycle graph resilience (feedback loop termination)
 *   10. Generated .mjs code syntax validation (via child_process.spawnSync and node --input-type=module --check)
 *   11. convertMermaidToMjs helper structure and output
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  parseMermaid,
  mermaidToLoiloLayout,
  generateMermaidMjs,
  convertMermaidToMjs,
  computeTopologicalRanks,
  SHAPE_TO_COLOR_MAP,
  splitMermaidStatements,
  parseNodeToken,
  scanStatementTokens
} from '../src/mermaid_converter.mjs';

describe('Mermaid Converter Engine (Milestone 3)', () => {

  describe('1. Statement Splitting & Tokenizer Sanitization', () => {
    test('splits statements by newlines and semicolons', () => {
      const input = `
        graph TD;
        A[Node 1]; B[Node 2]
        C[Node 3]
      `;
      const statements = splitMermaidStatements(input);
      assert.strictEqual(statements.length, 4);
      assert.strictEqual(statements[0], 'graph TD');
      assert.strictEqual(statements[1], 'A[Node 1]');
      assert.strictEqual(statements[2], 'B[Node 2]');
      assert.strictEqual(statements[3], 'C[Node 3]');
    });

    test('strips comments (%%...) correctly', () => {
      const input = `
        %% This is a diagram comment
        graph LR
        A[Start] --> B[End] %% inline comment
      `;
      const statements = splitMermaidStatements(input);
      assert.strictEqual(statements.length, 2);
      assert.strictEqual(statements[0], 'graph LR');
      assert.strictEqual(statements[1], 'A[Start] --> B[End]');
    });

    test('does not treat semicolons inside quoted labels as statement delimiters', () => {
      const input = `
        graph TD
        A["Step 1; Important; Next"] --> B["Step 2"]
      `;
      const statements = splitMermaidStatements(input);
      assert.strictEqual(statements.length, 2);
      assert.ok(statements[1].includes('Step 1; Important; Next'));
    });
  });

  describe('2. Header & Direction Parsing', () => {
    test('parses graph TD and flowchart TD', () => {
      const ast1 = parseMermaid('graph TD\nA --> B');
      assert.strictEqual(ast1.diagramType, 'graph');
      assert.strictEqual(ast1.direction, 'TD');

      const ast2 = parseMermaid('flowchart TD\nA --> B');
      assert.strictEqual(ast2.diagramType, 'flowchart');
      assert.strictEqual(ast2.direction, 'TD');
    });

    test('parses all directions: TB, LR, BT, RL', () => {
      const tb = parseMermaid('graph TB\nA --> B');
      assert.strictEqual(tb.direction, 'TB');

      const lr = parseMermaid('flowchart LR\nA --> B');
      assert.strictEqual(lr.direction, 'LR');

      const bt = parseMermaid('graph BT\nA --> B');
      assert.strictEqual(bt.direction, 'BT');

      const rl = parseMermaid('flowchart RL\nA --> B');
      assert.strictEqual(rl.direction, 'RL');
    });

    test('case-insensitivity of header and direction', () => {
      const ast = parseMermaid('FLOWCHART lr\nA --> B');
      assert.strictEqual(ast.diagramType, 'flowchart');
      assert.strictEqual(ast.direction, 'LR');
    });

    test('headerless fallback defaults to flowchart TD', () => {
      const ast = parseMermaid('A --> B\nB --> C');
      assert.strictEqual(ast.diagramType, 'flowchart');
      assert.strictEqual(ast.direction, 'TD');
      assert.strictEqual(ast.nodes.length, 3);
      assert.strictEqual(ast.edges.length, 2);
    });

    test('handles statements on the same line as header', () => {
      const ast = parseMermaid('graph TD; A[Start] --> B[End]');
      assert.strictEqual(ast.direction, 'TD');
      assert.strictEqual(ast.nodes.length, 2);
      assert.strictEqual(ast.edges.length, 1);
    });
  });

  describe('3. Node Shapes & Color Palette Mapping', () => {
    test('parses rectangle [rect] -> white', () => {
      const ast = parseMermaid('graph TD\nA[Process Step]');
      assert.strictEqual(ast.nodes[0].shape, 'rect');
      assert.strictEqual(ast.nodes[0].label, 'Process Step');

      const layout = mermaidToLoiloLayout('graph TD\nA[Process Step]');
      assert.strictEqual(layout.nodes[0].color, 'white');
    });

    test('parses rounded rectangle (rounded) -> lightBlue', () => {
      const ast = parseMermaid('graph TD\nB(Rounded Info)');
      assert.strictEqual(ast.nodes[0].shape, 'rounded');
      assert.strictEqual(ast.nodes[0].label, 'Rounded Info');

      const layout = mermaidToLoiloLayout('graph TD\nB(Rounded Info)');
      assert.strictEqual(layout.nodes[0].color, 'lightBlue');
    });

    test('parses stadium / pill ([stadium]) -> green', () => {
      const ast = parseMermaid('graph TD\nC([Start / End Terminal])');
      assert.strictEqual(ast.nodes[0].shape, 'stadium');
      assert.strictEqual(ast.nodes[0].label, 'Start / End Terminal');

      const layout = mermaidToLoiloLayout('graph TD\nC([Start / End Terminal])');
      assert.strictEqual(layout.nodes[0].color, 'green');
    });

    test('parses decision diamond {diamond} -> pink', () => {
      const ast = parseMermaid('graph TD\nD{Is Valid?}');
      assert.strictEqual(ast.nodes[0].shape, 'diamond');
      assert.strictEqual(ast.nodes[0].label, 'Is Valid?');

      const layout = mermaidToLoiloLayout('graph TD\nD{Is Valid?}');
      assert.strictEqual(layout.nodes[0].color, 'pink');
    });

    test('parses circle ((circle)) -> yellow', () => {
      const ast = parseMermaid('graph TD\nE((Important Note))');
      assert.strictEqual(ast.nodes[0].shape, 'circle');
      assert.strictEqual(ast.nodes[0].label, 'Important Note');

      const layout = mermaidToLoiloLayout('graph TD\nE((Important Note))');
      assert.strictEqual(layout.nodes[0].color, 'yellow');
    });

    test('parses cylinder / database [(cylinder)] -> blue', () => {
      const ast = parseMermaid('graph TD\nF[(Database Storage)]');
      assert.strictEqual(ast.nodes[0].shape, 'cylinder');
      assert.strictEqual(ast.nodes[0].label, 'Database Storage');

      const layout = mermaidToLoiloLayout('graph TD\nF[(Database Storage)]');
      assert.strictEqual(layout.nodes[0].color, 'blue');
    });

    test('parses bare node identifier and defaults to rect / white with label = id', () => {
      const ast = parseMermaid('graph TD\nAlpha --> Beta');
      assert.strictEqual(ast.nodes[0].id, 'Alpha');
      assert.strictEqual(ast.nodes[0].label, 'Alpha');
      assert.strictEqual(ast.nodes[0].shape, 'rect');

      assert.strictEqual(ast.nodes[1].id, 'Beta');
      assert.strictEqual(ast.nodes[1].label, 'Beta');
      assert.strictEqual(ast.nodes[1].shape, 'rect');

      const layout = mermaidToLoiloLayout('graph TD\nAlpha --> Beta');
      assert.strictEqual(layout.nodes[0].color, 'white');
      assert.strictEqual(layout.nodes[1].color, 'white');
    });

    test('upgrades bare node when shaped definition appears later', () => {
      const input = `
        graph TD
        A --> B
        A([Start Terminal])
        B[(Storage DB)]
      `;
      const ast = parseMermaid(input);
      assert.strictEqual(ast.nodesMap['A'].shape, 'stadium');
      assert.strictEqual(ast.nodesMap['A'].label, 'Start Terminal');
      assert.strictEqual(ast.nodesMap['B'].shape, 'cylinder');
      assert.strictEqual(ast.nodesMap['B'].label, 'Storage DB');
    });
  });

  describe('4. Edge Styles & Label Parsing', () => {
    test('parses standard directed edge (-->)', () => {
      const ast = parseMermaid('graph TD\nA --> B');
      assert.strictEqual(ast.edges.length, 1);
      assert.strictEqual(ast.edges[0].from, 'A');
      assert.strictEqual(ast.edges[0].to, 'B');
      assert.strictEqual(ast.edges[0].directed, true);
      assert.strictEqual(ast.edges[0].stroke, 'solid');
      assert.strictEqual(ast.edges[0].label, null);
    });

    test('parses pipe labels on directed edges (-->|label|)', () => {
      const ast = parseMermaid('graph TD\nA -->|Submit| B');
      assert.strictEqual(ast.edges[0].directed, true);
      assert.strictEqual(ast.edges[0].label, 'Submit');
    });

    test('parses infix labels (-- label -->)', () => {
      const ast = parseMermaid('graph TD\nA -- Approve --> B');
      assert.strictEqual(ast.edges[0].directed, true);
      assert.strictEqual(ast.edges[0].label, 'Approve');
    });

    test('parses dotted edges (-.-> and -. label .->)', () => {
      const ast1 = parseMermaid('graph TD\nA -.-> B');
      assert.strictEqual(ast1.edges[0].directed, true);
      assert.strictEqual(ast1.edges[0].stroke, 'dotted');

      const ast2 = parseMermaid('graph TD\nA -. Optional .-> B');
      assert.strictEqual(ast2.edges[0].directed, true);
      assert.strictEqual(ast2.edges[0].stroke, 'dotted');
      assert.strictEqual(ast2.edges[0].label, 'Optional');
    });

    test('parses thick edges (==> and == label ==>)', () => {
      const ast1 = parseMermaid('graph TD\nA ==> B');
      assert.strictEqual(ast1.edges[0].directed, true);
      assert.strictEqual(ast1.edges[0].stroke, 'thick');

      const ast2 = parseMermaid('graph TD\nA == Critical ==> B');
      assert.strictEqual(ast2.edges[0].directed, true);
      assert.strictEqual(ast2.edges[0].stroke, 'thick');
      assert.strictEqual(ast2.edges[0].label, 'Critical');
    });

    test('parses undirected edges (--- and ---|label|)', () => {
      const ast1 = parseMermaid('graph TD\nA --- B');
      assert.strictEqual(ast1.edges[0].directed, false);

      const ast2 = parseMermaid('graph TD\nA ---|Relates| B');
      assert.strictEqual(ast2.edges[0].directed, false);
      assert.strictEqual(ast2.edges[0].label, 'Relates');
    });
  });

  describe('5. Chained Statements (Multi-Node Edges)', () => {
    test('parses 3-node chained edge: A --> B --> C', () => {
      const ast = parseMermaid('graph TD\nA[First] --> B[Second] --> C[Third]');
      assert.strictEqual(ast.nodes.length, 3);
      assert.strictEqual(ast.edges.length, 2);
      assert.strictEqual(ast.edges[0].from, 'A');
      assert.strictEqual(ast.edges[0].to, 'B');
      assert.strictEqual(ast.edges[1].from, 'B');
      assert.strictEqual(ast.edges[1].to, 'C');
    });

    test('parses 4-node chained edge with labels: A -->|Step 1| B -->|Step 2| C --> D', () => {
      const ast = parseMermaid('graph TD\nA -->|Step 1| B -->|Step 2| C --> D');
      assert.strictEqual(ast.nodes.length, 4);
      assert.strictEqual(ast.edges.length, 3);
      assert.strictEqual(ast.edges[0].label, 'Step 1');
      assert.strictEqual(ast.edges[1].label, 'Step 2');
      assert.strictEqual(ast.edges[2].label, null);
    });
  });

  describe('6. Subgraphs and Scoping', () => {
    test('parses simple subgraph Title ... end', () => {
      const input = `
        graph TD
        subgraph Backend Services
          API[REST API]
          DB[(PostgreSQL)]
          API --> DB
        end
        Client[Web App] --> API
      `;
      const ast = parseMermaid(input);
      assert.strictEqual(ast.subgraphs.length, 1);
      assert.strictEqual(ast.subgraphs[0].title, 'Backend Services');
      assert.ok(ast.subgraphs[0].nodes.includes('API'));
      assert.ok(ast.subgraphs[0].nodes.includes('DB'));

      assert.strictEqual(ast.nodesMap['API'].subgraphId, 'Backend Services');
      assert.strictEqual(ast.nodesMap['DB'].subgraphId, 'Backend Services');
      assert.strictEqual(ast.nodesMap['Client'].subgraphId, null);
    });

    test('parses subgraph id [Title] format', () => {
      const input = `
        graph TD
        subgraph sg1 ["Core Infrastructure"]
          NodeA[Worker 1]
          NodeB[Worker 2]
        end
      `;
      const ast = parseMermaid(input);
      assert.strictEqual(ast.subgraphs.length, 1);
      assert.strictEqual(ast.subgraphs[0].id, 'sg1');
      assert.strictEqual(ast.subgraphs[0].title, 'Core Infrastructure');
      assert.strictEqual(ast.nodesMap['NodeA'].subgraphId, 'sg1');
    });

    test('warns gracefully on unmatched end keyword', () => {
      const input = `
        graph TD
        A --> B
        end
      `;
      const ast = parseMermaid(input);
      assert.ok(ast.warnings.some(w => w.includes('Extraneous "end"')));
    });
  });

  describe('7. Japanese, Unicode & LaTeX Math in Labels', () => {
    test('preserves Japanese Kanji, Hiragana, Katakana, and punctuation', () => {
      const input = `
        flowchart TD
        A[【開始】ログイン認証] --> B{「パスワード」照合}
        B -->|一致| C([マイページ表示])
        B -->|不一致| D((エラー通知！))
      `;
      const ast = parseMermaid(input);
      assert.strictEqual(ast.nodesMap['A'].label, '【開始】ログイン認証');
      assert.strictEqual(ast.nodesMap['B'].label, '「パスワード」照合');
      assert.strictEqual(ast.nodesMap['C'].label, 'マイページ表示');
      assert.strictEqual(ast.nodesMap['D'].label, 'エラー通知！');
    });

    test('preserves LaTeX math formulas ($E=mc^2$) inside node labels', () => {
      const input = `
        flowchart TD
        Energy["エネルギー: $E=mc^2$"] --> Mass["質量: $m$"]
      `;
      const ast = parseMermaid(input);
      assert.strictEqual(ast.nodesMap['Energy'].label, 'エネルギー: $E=mc^2$');
      assert.strictEqual(ast.nodesMap['Mass'].label, '質量: $m$');
    });
  });

  describe('8. Layout Coordinates & Topological Ranking', () => {
    test('calculates TD layout: rank increases along Y, centered along X', () => {
      const input = `
        graph TD
        A[Start] --> B[Step 1]
        A --> C[Step 2]
        B --> D[Finish]
        C --> D
      `;
      const layout = mermaidToLoiloLayout(input, {
        cardWidth: 260,
        cardHeight: 180,
        spacingX: 120,
        spacingY: 100
      });

      assert.strictEqual(layout.direction, 'TD');
      const nodeA = layout.nodes.find(n => n.id === 'A');
      const nodeB = layout.nodes.find(n => n.id === 'B');
      const nodeC = layout.nodes.find(n => n.id === 'C');
      const nodeD = layout.nodes.find(n => n.id === 'D');

      // Rank 0: nodeA (y = 0)
      assert.strictEqual(nodeA.y, 0);

      // Rank 1: nodeB and nodeC (y = 1 * (180 + 100) = 280)
      assert.strictEqual(nodeB.y, 280);
      assert.strictEqual(nodeC.y, 280);
      // nodeB and nodeC centered on X:
      assert.ok(nodeB.x !== nodeC.x, 'Nodes in same layer must have different X positions');
      assert.strictEqual(nodeB.x + nodeC.x, 0, 'Symmetric layer should be centered at X=0');

      // Rank 2: nodeD (y = 2 * 280 = 560)
      assert.strictEqual(nodeD.y, 560);
    });

    test('calculates LR layout: rank increases along X, centered along Y', () => {
      const input = `
        graph LR
        A[Input] --> B[Transform]
        B --> C[Output]
      `;
      const layout = mermaidToLoiloLayout(input, {
        cardWidth: 260,
        cardHeight: 180,
        spacingX: 120,
        spacingY: 100
      });

      assert.strictEqual(layout.direction, 'LR');
      const nodeA = layout.nodes.find(n => n.id === 'A');
      const nodeB = layout.nodes.find(n => n.id === 'B');
      const nodeC = layout.nodes.find(n => n.id === 'C');

      assert.strictEqual(nodeA.x, 0);
      assert.strictEqual(nodeB.x, 380); // 260 + 120
      assert.strictEqual(nodeC.x, 760); // 2 * 380
    });

    test('calculates BT layout: rank is inverted along Y', () => {
      const input = `
        graph BT
        A[Base] --> B[Peak]
      `;
      const layout = mermaidToLoiloLayout(input, {
        cardHeight: 180,
        spacingY: 100
      });
      assert.strictEqual(layout.direction, 'BT');
      const nodeA = layout.nodes.find(n => n.id === 'A');
      const nodeB = layout.nodes.find(n => n.id === 'B');

      // Base (rank 0) should have larger Y than Peak (rank 1)
      assert.ok(nodeA.y > nodeB.y, 'In BT layout, root node has larger Y than leaf');
    });

    test('calculates RL layout: rank is inverted along X', () => {
      const input = `
        graph RL
        A[Start] --> B[End]
      `;
      const layout = mermaidToLoiloLayout(input, {
        cardWidth: 260,
        spacingX: 120
      });
      assert.strictEqual(layout.direction, 'RL');
      const nodeA = layout.nodes.find(n => n.id === 'A');
      const nodeB = layout.nodes.find(n => n.id === 'B');

      assert.ok(nodeA.x > nodeB.x, 'In RL layout, root node has larger X than leaf');
    });
  });

  describe('9. Cycle Graph Resilience (Feedback Loops)', () => {
    test('terminates safely on 3-node feedback cycle: A -> B -> C -> A', () => {
      const input = `
        graph TD
        A[Phase 1] --> B[Phase 2]
        B --> C[Phase 3]
        C --> A
      `;
      const startTime = Date.now();
      const layout = mermaidToLoiloLayout(input);
      const elapsed = Date.now() - startTime;

      assert.ok(elapsed < 200, `Cycle breaking must terminate promptly (took ${elapsed}ms)`);
      assert.strictEqual(layout.nodes.length, 3);
      assert.strictEqual(layout.edges.length, 3);
    });

    test('handles self-looping node: A -> A', () => {
      const input = `
        graph TD
        A[Self Loop] --> A
        A --> B[Exit]
      `;
      const layout = mermaidToLoiloLayout(input);
      assert.strictEqual(layout.nodes.length, 2);
      assert.strictEqual(layout.edges.length, 2);
    });
  });

  describe('10. Standalone .mjs Code Generation & Node Syntax Validation', () => {
    test('generates valid executable .mjs script content with all 5 lifecycle steps', () => {
      const input = `
        flowchart TD
        Start([開始]) --> Check{検証}
        Check -->|OK| Save[(保存)]
        Check -->|NG| Retry((再試行))
        Retry --> Start
      `;

      const mjsCode = generateMermaidMjs(input, { clientImportPath: '../src/loilo_client.mjs' });

      assert.ok(typeof mjsCode === 'string', 'Generated code must be a string');
      assert.ok(mjsCode.includes('import { LoiloClient } from "../src/loilo_client.mjs";'));
      assert.ok(mjsCode.includes('client.connect()'));
      assert.ok(mjsCode.includes('client.createColorCard'));
      assert.ok(mjsCode.includes('client.setCardTextAndStyle'));
      assert.ok(mjsCode.includes('client.layoutCards'));
      assert.ok(mjsCode.includes('client.connectCards'));
      assert.ok(mjsCode.includes('client.zoomFit()'));
      assert.ok(mjsCode.includes('client.close()'));
      assert.ok(mjsCode.includes('try {'));
      assert.ok(mjsCode.includes('finally {'));

      // Validate that node colors match shapes
      assert.ok(mjsCode.includes('"color": "green"'), 'Start stadium should have green color');
      assert.ok(mjsCode.includes('"color": "pink"'), 'Check diamond should have pink color');
      assert.ok(mjsCode.includes('"color": "blue"'), 'Save cylinder should have blue color');
      assert.ok(mjsCode.includes('"color": "yellow"'), 'Retry circle should have yellow color');
    });

    test('generated .mjs code passes node --input-type=module --check syntax verification', () => {
      const input = `
        graph TD
        subgraph Pipeline
          A[データの収集] --> B{バリデーション}
          B -->|有効| C([処理成功])
          B -->|無効| D[(エラーログ)]
        end
      `;

      const mjsCode = generateMermaidMjs(input);

      // Execute node syntax check via spawnSync
      const res = spawnSync('node', ['--input-type=module', '--check'], {
        input: mjsCode,
        encoding: 'utf-8'
      });

      assert.strictEqual(
        res.status,
        0,
        `Node syntax check failed: ${res.stderr || res.stdout}`
      );
    });

    test('safely escapes special characters and quotes against code injection', () => {
      const maliciousInput = `
        graph TD
        A["Test \\"; process.exit(1); //"] --> B['Single Quote \\' Injection']
      `;

      const mjsCode = generateMermaidMjs(maliciousInput);

      // Syntax check must pass without breaking string literals
      const res = spawnSync('node', ['--input-type=module', '--check'], {
        input: mjsCode,
        encoding: 'utf-8'
      });

      assert.strictEqual(
        res.status,
        0,
        `Syntax check failed on escaped quotes: ${res.stderr}`
      );
    });
  });

  describe('11. Coordinator convertMermaidToMjs Interface Contract', () => {
    test('returns complete unified object with both camelCase and snake_case properties', () => {
      const input = `
        flowchart LR
        A[Step 1] --> B[Step 2]
      `;
      const result = convertMermaidToMjs(input);

      assert.ok(result.mjsCode, 'mjsCode must be populated');
      assert.strictEqual(result.mjs_code, result.mjsCode);
      assert.strictEqual(result.nodeCount, 2);
      assert.strictEqual(result.node_count, 2);
      assert.strictEqual(result.edgeCount, 1);
      assert.strictEqual(result.edge_count, 1);
      assert.strictEqual(result.layout.nodes.length, 2);
      assert.strictEqual(result.layout.edges.length, 1);
    });
  });
});
