/**
 * test/e2e_scenarios.test.mjs
 * Comprehensive End-to-End Test Suite for Rich Text & LaTeX Styling in LoiLo Note MCP
 *
 * Requirements: TEST_INFRA.md, PROJECT.md, and explorer_3_test_spec.md
 * - Tier 3: Cross-Feature Combinations (14 test cases)
 * - Tier 4: Real-World Application Scenarios (5 scenarios)
 *
 * Runs natively with Node.js test runner (`node --test`) with zero external dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRichStyledText } from '../src/rich_text_parser.mjs';

// Helper assertion validating LoiLo Note's linear lookup order (highlights precede fallbacks)
function assertLinearLookupIntegrity(result, expectedBaseSize = 24, expectedBaseColor = '#FF000000', expectedDefaultBold = false) {
  const { cleanText, attributes, attributeRanges } = result;
  const totalLength = cleanText.length;

  // Fallbacks MUST be at the end of attributeRanges spanning [0, totalLength)
  assert.ok(attributeRanges.length >= 4, 'Must contain at least 4 fallback ranges');
  const fallbackTail = attributeRanges.slice(-4);
  for (const fb of fallbackTail) {
    assert.equal(fb.range.location, 0, 'Fallback location must be 0');
    assert.equal(fb.range.length, totalLength, 'Fallback length must equal totalLength');
  }

  // Verify the 4 baseline styles at the tail
  const [fontRange, paraRange, langRange, colorRange] = fallbackTail;
  assert.deepEqual(attributes[fontRange.index], {
    type: 'font',
    value: { bold: expectedDefaultBold, size: expectedBaseSize }
  });
  assert.deepEqual(attributes[paraRange.index], {
    type: 'paragraph_style',
    value: { line_spacing: 0 }
  });
  assert.deepEqual(attributes[langRange.index], {
    type: 'language',
    value: 'ja-JP'
  });
  assert.deepEqual(attributes[colorRange.index], {
    type: 'foreground_color',
    value: expectedBaseColor
  });

  // Any custom highlights must appear strictly BEFORE the fallback tail
  const customRanges = attributeRanges.slice(0, -4);
  for (const cr of customRanges) {
    assert.ok(cr.range.location >= 0, 'Highlight location must be non-negative');
    assert.ok(cr.range.location + cr.range.length <= totalLength, 'Highlight range must not exceed totalLength');
  }
}

// Simulates LoiLo Note's forward linear search (attributeAt)
function simulateAttributeAt(result, charIndex, targetType) {
  const { attributes, attributeRanges } = result;
  for (const entry of attributeRanges) {
    const { location, length } = entry.range;
    if (charIndex >= location && charIndex < location + length) {
      const attr = attributes[entry.index];
      if (attr && attr.type === targetType) {
        return attr.value;
      }
    }
  }
  return null;
}

describe('E2E Scenarios Test Suite', () => {

  describe('Tier 3: Cross-Feature Combinations', () => {

    describe('Pairwise Interactions', () => {
      it('3.1: Bold + Color via Markdown and HTML tag', () => {
        const input = '注意：**<red>立入禁止区域</red>**です。';
        const res = parseRichStyledText(input, { baseFontSize: 24, baseColor: '#FF000000', defaultBold: false });

        assert.equal(res.cleanText, '注意：立入禁止区域です。');
        assert.equal(res.cleanText.length, 12);
        assert.equal(res.cleanText.slice(3, 9), '立入禁止区域');

        // Font highlight
        const fontRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === 3);
        assert.ok(fontRange, 'Font highlight must be present');
        assert.equal(fontRange.range.length, 6);
        assert.equal(res.attributes[fontRange.index].value.bold, true);

        // Color highlight
        const colorRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 3);
        assert.ok(colorRange, 'Color highlight must be present');
        assert.equal(colorRange.range.length, 6);
        assert.equal(res.attributes[colorRange.index].value, '#FFED1E14');

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });

      it('3.2: Bold + Color via nested LaTeX syntax', () => {
        const input = '本年度の\\textbf{\\textcolor{blue}{重要方針}}を発表します。';
        const res = parseRichStyledText(input, { baseFontSize: 24, baseColor: '#FF000000' });

        assert.equal(res.cleanText, '本年度の重要方針を発表します。');
        assert.equal(res.cleanText.length, 15);
        assert.equal(res.cleanText.slice(4, 8), '重要方針');

        const fontRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === 4);
        assert.ok(fontRange);
        assert.equal(fontRange.range.length, 4);
        assert.equal(res.attributes[fontRange.index].value.bold, true);

        const colorRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 4);
        assert.ok(colorRange);
        assert.equal(colorRange.range.length, 4);
        assert.equal(res.attributes[colorRange.index].value, '#FF003366');

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });

      it('3.3: Size + Color via LaTeX commands', () => {
        const input = '\\huge{\\textcolor{green}{目標達成}}';
        const res = parseRichStyledText(input, { baseFontSize: 20 });

        assert.equal(res.cleanText, '目標達成');
        assert.equal(res.cleanText.length, 4);

        // huge = 20 * 2.0 = 40
        const fontRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === 0);
        assert.ok(fontRange);
        assert.equal(fontRange.range.length, 4);
        assert.equal(res.attributes[fontRange.index].value.size, 40);

        const colorRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 0);
        assert.ok(colorRange);
        assert.equal(colorRange.range.length, 4);
        assert.equal(res.attributes[colorRange.index].value, '#FF006633');

        assertLinearLookupIntegrity(res, 20, '#FF000000', false);
      });

      it('3.4: Size + Color via HTML tags', () => {
        const input = 'ステータス: <size value="36"><color value="#FFB34700">進行中</color></size>';
        const res = parseRichStyledText(input, { baseFontSize: 24, baseColor: '#FF000000' });

        assert.equal(res.cleanText, 'ステータス: 進行中');
        assert.equal(res.cleanText.length, 10);
        assert.equal(res.cleanText.slice(7, 10), '進行中');

        const fontRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === 7);
        assert.ok(fontRange);
        assert.equal(fontRange.range.length, 3);
        assert.equal(res.attributes[fontRange.index].value.size, 36);

        const colorRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 7);
        assert.ok(colorRange);
        assert.equal(colorRange.range.length, 3);
        assert.equal(res.attributes[colorRange.index].value, '#FFB34700');

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });

      it('3.5: Bold + Size (Compound Font Merging)', () => {
        const input = '\\textbf{\\Large{次世代アーキテクチャ}}';
        const res = parseRichStyledText(input, { baseFontSize: 20 });

        assert.equal(res.cleanText, '次世代アーキテクチャ');
        assert.equal(res.cleanText.length, 10);

        // Large = 20 * 1.4 = 28
        // Single compound font attribute for this span to prevent shadowing
        const fontHighlightRanges = res.attributeRanges.slice(0, -4).filter(r => res.attributes[r.index].type === 'font');
        assert.equal(fontHighlightRanges.length, 1, 'Must merge into a single compound font attribute');
        assert.equal(fontHighlightRanges[0].range.location, 0);
        assert.equal(fontHighlightRanges[0].range.length, 10);

        const fontAttr = res.attributes[fontHighlightRanges[0].index];
        assert.equal(fontAttr.value.bold, true);
        assert.equal(fontAttr.value.size, 28);

        assertLinearLookupIntegrity(res, 20, '#FF000000', false);
      });

      it('3.6: Bold + Size (Markdown Bold outer, LaTeX size inner)', () => {
        const input = '注記：**\\small{※本データは2026年現在の推定値です}**';
        const res = parseRichStyledText(input, { baseFontSize: 24 });

        assert.equal(res.cleanText, '注記：※本データは2026年現在の推定値です');
        assert.equal(res.cleanText.length, 22);
        assert.equal(res.cleanText.slice(3, 22), '※本データは2026年現在の推定値です');

        // small = 24 * 0.85 = 20
        const fontHighlightRanges = res.attributeRanges.slice(0, -4).filter(r => res.attributes[r.index].type === 'font');
        assert.equal(fontHighlightRanges.length, 1);
        assert.equal(fontHighlightRanges[0].range.location, 3);
        assert.equal(fontHighlightRanges[0].range.length, 19);

        const fontAttr = res.attributes[fontHighlightRanges[0].index];
        assert.equal(fontAttr.value.bold, true);
        assert.equal(fontAttr.value.size, 20);

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });
    });

    describe('Math Formula Interactions', () => {
      it('3.7: Math inside colored block preserved verbatim with color applied', () => {
        const input = '数式：\\textcolor{green}{$E = mc^2$}';
        const res = parseRichStyledText(input, { baseFontSize: 24, baseColor: '#FF000000' });

        assert.equal(res.cleanText, '数式：$E = mc^2$');
        assert.equal(res.cleanText.length, 13);
        assert.equal(res.cleanText.slice(3, 13), '$E = mc^2$');

        const colorRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 3);
        assert.ok(colorRange);
        assert.equal(colorRange.range.length, 10);
        assert.equal(res.attributes[colorRange.index].value, '#FF006633');

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });

      it('3.8: Math block adjacent to bold and color spans', () => {
        const input = '\\textbf{公式}: \\textcolor{blue}{2次方程式の解} は $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$ である。';
        const res = parseRichStyledText(input, { baseFontSize: 24, baseColor: '#FF000000' });

        assert.equal(res.cleanText, '公式: 2次方程式の解 は $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$ である。');
        assert.ok(res.cleanText.includes('$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$'));

        // Span 1: "公式" at loc 0, len 2
        const fontRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === 0);
        assert.ok(fontRange);
        assert.equal(fontRange.range.length, 2);
        assert.equal(res.attributes[fontRange.index].value.bold, true);

        // Span 2: "2次方程式の解" (7 characters: 2, 次, 方, 程, 式, の, 解) at loc 4
        const colorRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 4);
        assert.ok(colorRange);
        assert.equal(colorRange.range.length, 7);
        assert.equal(res.attributes[colorRange.index].value, '#FF003366');

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });

      it('3.9: Inline math surrounded by multi-colored text', () => {
        const input = '<red>速度</red> $v = \\frac{dx}{dt}$ と <blue>加速度</blue> $a = \\frac{dv}{dt}$';
        const res = parseRichStyledText(input, { baseFontSize: 24, baseColor: '#FF000000' });

        assert.equal(res.cleanText, '速度 $v = \\frac{dx}{dt}$ と 加速度 $a = \\frac{dv}{dt}$');
        assert.ok(res.cleanText.includes('$v = \\frac{dx}{dt}$'));
        assert.ok(res.cleanText.includes('$a = \\frac{dv}{dt}$'));

        // "速度" at 0, 2 -> red
        const redRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 0);
        assert.ok(redRange);
        assert.equal(redRange.range.length, 2);
        assert.equal(res.attributes[redRange.index].value, '#FFED1E14');

        // "加速度" at location index in cleanText
        const blueLoc = res.cleanText.indexOf('加速度');
        const blueRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === blueLoc);
        assert.ok(blueRange);
        assert.equal(blueRange.range.length, 3);
        assert.equal(res.attributes[blueRange.index].value, '#FF003366');

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });
    });

    describe('Triple & Multi-Span Combinations', () => {
      it('3.10: Triple Combination (LaTeX Bold + Size + Color)', () => {
        const input = '\\textbf{\\huge{\\textcolor{red}{大緊急警報}}}';
        const res = parseRichStyledText(input, { baseFontSize: 20 });

        assert.equal(res.cleanText, '大緊急警報');
        assert.equal(res.cleanText.length, 5);

        // Compound Font: bold=true, size = 20 * 2.0 = 40
        const fontRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === 0);
        assert.ok(fontRange);
        assert.equal(fontRange.range.length, 5);
        assert.equal(res.attributes[fontRange.index].value.bold, true);
        assert.equal(res.attributes[fontRange.index].value.size, 40);

        // Color: red = #FFED1E14
        const colorRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 0);
        assert.ok(colorRange);
        assert.equal(colorRange.range.length, 5);
        assert.equal(res.attributes[colorRange.index].value, '#FFED1E14');

        assertLinearLookupIntegrity(res, 20, '#FF000000', false);
      });

      it('3.11: Triple Combination (HTML Tags + Markdown)', () => {
        const input = '<size value="32"><color value="#FF003366">**プロジェクト概要**</color></size>';
        const res = parseRichStyledText(input, { baseFontSize: 24 });

        assert.equal(res.cleanText, 'プロジェクト概要');
        assert.equal(res.cleanText.length, 8);

        const fontRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === 0);
        assert.ok(fontRange);
        assert.equal(fontRange.range.length, 8);
        assert.equal(res.attributes[fontRange.index].value.bold, true);
        assert.equal(res.attributes[fontRange.index].value.size, 32);

        const colorRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 0);
        assert.ok(colorRange);
        assert.equal(colorRange.range.length, 8);
        assert.equal(res.attributes[colorRange.index].value, '#FF003366');

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });

      it('3.12: Multi-span alternating styles with standard separators', () => {
        const input = '基盤: \\textbf{Alpha} / \\textcolor{green}{Beta} / \\Large{Gamma} 完了';
        const res = parseRichStyledText(input, { baseFontSize: 20 });

        assert.equal(res.cleanText, '基盤: Alpha / Beta / Gamma 完了');
        assert.equal(res.cleanText.length, 27);

        // "Alpha": loc 4, len 5, bold: true
        const alphaLoc = res.cleanText.indexOf('Alpha');
        const alphaRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === alphaLoc);
        assert.ok(alphaRange);
        assert.equal(alphaRange.range.length, 5);
        assert.equal(res.attributes[alphaRange.index].value.bold, true);

        // "Beta": color: green (#FF006633)
        const betaLoc = res.cleanText.indexOf('Beta');
        const betaRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === betaLoc);
        assert.ok(betaRange);
        assert.equal(betaRange.range.length, 4);
        assert.equal(res.attributes[betaRange.index].value, '#FF006633');

        // "Gamma": size: Large (20 * 1.4 = 28)
        const gammaLoc = res.cleanText.indexOf('Gamma');
        const gammaRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === gammaLoc);
        assert.ok(gammaRange);
        assert.equal(gammaRange.range.length, 5);
        assert.equal(res.attributes[gammaRange.index].value.size, 28);

        assertLinearLookupIntegrity(res, 20, '#FF000000', false);
      });

      it('3.13: Contiguous adjacent styled boundaries without separator', () => {
        const input = '\\textbf{左側}\\textcolor{red}{右側}';
        const res = parseRichStyledText(input, { baseFontSize: 24, baseColor: '#FF000000' });

        assert.equal(res.cleanText, '左側右側');
        assert.equal(res.cleanText.length, 4);

        // Left span: loc 0, len 2 (bold: true)
        const leftRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === 0);
        assert.ok(leftRange);
        assert.equal(leftRange.range.length, 2);
        assert.equal(res.attributes[leftRange.index].value.bold, true);

        // Right span: loc 2, len 2 (color: red)
        const rightRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === 2);
        assert.ok(rightRange);
        assert.equal(rightRange.range.length, 2);
        assert.equal(res.attributes[rightRange.index].value, '#FFED1E14');

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });

      it('3.14: Japanese full-width / half-width mixed with LaTeX tags', () => {
        const input = '【第１章】\\textbf{量子論の夜明け}：\\textcolor{blue}{Planck定数 $h$}の導入';
        const res = parseRichStyledText(input, { baseFontSize: 24, baseColor: '#FF000000' });

        assert.equal(res.cleanText, '【第１章】量子論の夜明け：Planck定数 $h$の導入');

        // "量子論の夜明け": loc 5, len 7
        const boldLoc = res.cleanText.indexOf('量子論の夜明け');
        assert.equal(boldLoc, 5);
        const boldRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'font' && r.range.location === boldLoc);
        assert.ok(boldRange);
        assert.equal(boldRange.range.length, 7);
        assert.equal(res.attributes[boldRange.index].value.bold, true);

        // "Planck定数 $h$": loc 13, len 12 ('Planck定数 $h$'.length === 12)
        const blueLoc = res.cleanText.indexOf('Planck定数 $h$');
        assert.equal(blueLoc, 13);
        const blueRange = res.attributeRanges.find(r => res.attributes[r.index].type === 'foreground_color' && r.range.location === blueLoc);
        assert.ok(blueRange);
        assert.equal(blueRange.range.length, 12);
        assert.equal(res.attributes[blueRange.index].value, '#FF003366');

        assertLinearLookupIntegrity(res, 24, '#FF000000', false);
      });
    });
  });

  describe('Tier 4: Real-World Application Scenarios', () => {

    it('Scenario 1: Academic Lecture Card with Math & Highlight', () => {
      const input = `\\huge{\\textcolor{blue}{第3講：特殊相対性理論とエネルギー}}

\\textbf{1. 質量とエネルギーの等価性}
アインシュタインの特殊相対性理論により、静止エネルギー $E_0$ は以下の公式で表されます：
$$E_0 = m_0 c^2$$

ここで、$m_0$ は静止質量、$c$ は真空中の光速度（\\textcolor{#FF003366}{$c \\approx 3.0 \\times 10^8 \\text{ m/s}$}）です。

\\textbf{2. 放射エネルギーと光子の関係}
光子1個が持つエネルギー $E$ は、プランク定数 $h$ と振動数 $\\nu$ を用いて次のように表されます：
$$E = h \\nu = \\frac{hc}{\\lambda}$$

\\textbf{<red>【重要注意】</red>}
質量欠損 $\\Delta m$ が生じると、解放されるエネルギーは \\textcolor{red}{$\\Delta E = \\Delta m \\cdot c^2$} となり、莫大なエネルギーが発生します。`;

      const res = parseRichStyledText(input, { baseFontSize: 20, baseColor: '#FF000000' });

      // Verification Criterion 1: Formula Verbatim Protection
      assert.ok(res.cleanText.includes('$E_0$'));
      assert.ok(res.cleanText.includes('$m_0$'));
      assert.ok(res.cleanText.includes('$c$'));
      assert.ok(res.cleanText.includes('$c \\approx 3.0 \\times 10^8 \\text{ m/s}$'));
      assert.ok(res.cleanText.includes('$$E_0 = m_0 c^2$$'));
      assert.ok(res.cleanText.includes('$E$'));
      assert.ok(res.cleanText.includes('$h$'));
      assert.ok(res.cleanText.includes('$\\nu$'));
      assert.ok(res.cleanText.includes('$$E = h \\nu = \\frac{hc}{\\lambda}$$'));
      assert.ok(res.cleanText.includes('$\\Delta m$'));
      assert.ok(res.cleanText.includes('$\\Delta E = \\Delta m \\cdot c^2$'));

      // Zero LaTeX math commands stripped
      assert.ok(res.cleanText.includes('\\approx'));
      assert.ok(res.cleanText.includes('\\times'));
      assert.ok(res.cleanText.includes('\\frac'));

      // Verification Criterion 2: Styling Extraction
      // Headline: huge (20 * 2.0 = 40) + blue (#FF003366)
      const titleLoc = res.cleanText.indexOf('第3講：特殊相対性理論とエネルギー');
      const titleFont = simulateAttributeAt(res, titleLoc, 'font');
      assert.equal(titleFont.size, 40);
      const titleColor = simulateAttributeAt(res, titleLoc, 'foreground_color');
      assert.equal(titleColor, '#FF003366');

      // Headings are bold
      const sec1Loc = res.cleanText.indexOf('1. 質量とエネルギーの等価性');
      assert.equal(simulateAttributeAt(res, sec1Loc, 'font').bold, true);

      const sec2Loc = res.cleanText.indexOf('2. 放射エネルギーと光子の関係');
      assert.equal(simulateAttributeAt(res, sec2Loc, 'font').bold, true);

      // Callout: 【重要注意】 has bold and red
      const alertLoc = res.cleanText.indexOf('【重要注意】');
      assert.equal(simulateAttributeAt(res, alertLoc, 'font').bold, true);
      assert.equal(simulateAttributeAt(res, alertLoc, 'foreground_color'), '#FFED1E14');

      // Math span color: $\Delta E = \Delta m \cdot c^2$ has red
      const mathAlertLoc = res.cleanText.indexOf('$\\Delta E = \\Delta m \\cdot c^2$');
      assert.equal(simulateAttributeAt(res, mathAlertLoc, 'foreground_color'), '#FFED1E14');

      // Verification Criterion 3: Linear lookup integrity
      assertLinearLookupIntegrity(res, 20, '#FF000000', false);
    });

    it('Scenario 2: Multi-Tier Headline Card with Size & Color Hierarchy', () => {
      const input = `\\huge{\\textcolor{#003366}{行政DX推進計画 2026年度 年次報告}}
\\textbf{\\Large{\\textcolor{#001B44}{第1四半期：オンライン申請利用率の進捗}}}

全国自治体における主要手続きのオンライン化が計画を上回るペースで進捗しています。

\\textbf{\\huge{\\textcolor{green}{達成率: 142.5%}}} （目標: 80.0%）

\\textbf{主要要因}:
マイナンバーカード連携APIのレスポンス改善およびUIアクセシビリティ標準（JIS X 8341-3）への準拠が寄与。

\\small{\\textcolor{gray}{※出典: デジタル庁 オープンデータダッシュボード（2026年6月速報値）}}`;

      const res = parseRichStyledText(input, { baseFontSize: 20, baseColor: '#FF000000' });

      // Verification Criterion 1 & 2: Font Size Scaling & Compound Merging
      // Title: base 20 * 2.0 = 40
      const titleLoc = res.cleanText.indexOf('行政DX推進計画 2026年度 年次報告');
      assert.equal(simulateAttributeAt(res, titleLoc, 'font').size, 40);
      assert.equal(simulateAttributeAt(res, titleLoc, 'foreground_color'), '#FF003366');

      // Sub-headline: base 20 * 1.4 = 28, bold: true, color: #FF001B44
      const subLoc = res.cleanText.indexOf('第1四半期：オンライン申請利用率の進捗');
      const subFont = simulateAttributeAt(res, subLoc, 'font');
      assert.equal(subFont.size, 28);
      assert.equal(subFont.bold, true);
      assert.equal(simulateAttributeAt(res, subLoc, 'foreground_color'), '#FF001B44');

      // KPI Metric: base 20 * 2.0 = 40, bold: true, color: green (#FF006633)
      const kpiLoc = res.cleanText.indexOf('達成率: 142.5%');
      const kpiFont = simulateAttributeAt(res, kpiLoc, 'font');
      assert.equal(kpiFont.size, 40);
      assert.equal(kpiFont.bold, true);
      assert.equal(simulateAttributeAt(res, kpiLoc, 'foreground_color'), '#FF006633');

      // Source footnote: small (20 * 0.85 = 17 -> clamped to 18 minimum by resolveFontSize or rounded)
      const footLoc = res.cleanText.indexOf('※出典: デジタル庁');
      const footFont = simulateAttributeAt(res, footLoc, 'font');
      assert.ok(footFont.size <= 20);
      assert.equal(simulateAttributeAt(res, footLoc, 'foreground_color'), '#FF757575');

      assertLinearLookupIntegrity(res, 20, '#FF000000', false);
    });

    it('Scenario 3: Flash AI Generated Multi-Card Slide Deck Simulation', () => {
      const cards = [
        {
          id: 'card-deck-001',
          text: `\\huge{\\textcolor{#003366}{脱炭素社会に向けたエネルギー転換戦略}}
\\textbf{\\Large{持続可能な未来を創る再生可能エネルギー技術}}
\\small{\\textcolor{gray}{2026年11月 / 環境エネルギー工学研究所}}`
        },
        {
          id: 'card-deck-002',
          text: `\\Large{\\textbf{3大主要施策とロードマップ}}

1. \\textbf{\\textcolor{blue}{洋上風力発電の拡充}}: <color value="#006633">2030年までに10GW</color>
2. \\textbf{\\textcolor{blue}{次世代ペロブスカイト太陽電池}}: 変換効率 $25\\%$ 超の社会実装
3. \\textbf{\\textcolor{red}{系統連系と蓄電池整備}}: 安定供給の確保

\\textbf{<red>注記</red>}: 投資回収期間は従来比で \\textbf{\\Large{30%短縮}} の見込み。`
        },
        {
          id: 'card-deck-003',
          text: `\\huge{\\textbf{\\textcolor{#006633}{まとめ：提言と今後のアクション}}}

\\textbf{結論}: 技術革新と規制改革を一体化させ、官民投資を加速させる。
公式問い合わせ: \\textcolor{blue}{contact@energy-transition.jp}`
        }
      ];

      // Process cards sequentially through parser pipeline
      const processedDeck = cards.map(card => {
        const parsed = parseRichStyledText(card.text, { baseFontSize: 24, baseColor: '#FF000000' });
        return {
          cardId: card.id,
          payload: {
            'gadgets.title.text': parsed.cleanText,
            'gadgets.title.attributes': parsed.attributes,
            'gadgets.title.attribute_ranges': parsed.attributeRanges,
            'gadgets.title.forecolor': '#FF000000',
            'gadgets.title.font_size': 24
          },
          parsed
        };
      });

      // Verification Criterion 1 & 2: Clean text and DADS card constraints
      for (const card of processedDeck) {
        assert.ok(!card.payload['gadgets.title.text'].includes('\\huge'));
        assert.ok(!card.payload['gadgets.title.text'].includes('\\textbf'));
        assert.ok(!card.payload['gadgets.title.text'].includes('<color'));
        assertLinearLookupIntegrity(card.parsed, 24, '#FF000000', false);
      }

      // Card 2 specific verification: Math formula $25\%$ preserved
      assert.ok(processedDeck[1].payload['gadgets.title.text'].includes('$25\\%$'));
      const card2Text = processedDeck[1].payload['gadgets.title.text'];
      const offshoreLoc = card2Text.indexOf('洋上風力発電の拡充');
      assert.equal(simulateAttributeAt(processedDeck[1].parsed, offshoreLoc, 'foreground_color'), '#FF003366');
      assert.equal(simulateAttributeAt(processedDeck[1].parsed, offshoreLoc, 'font').bold, true);
    });

    it('Scenario 4: Complex Japanese Classroom Card with Combined Tags', () => {
      const input = `\\Large{\\textbf{\\textcolor{#003366}{【実験】斜面を下る台車の運動と速度変化}}}

\\textbf{◆ 目的}
台車が斜面を下るときの位置 $x$ と時間 $t$ の関係を記録タイマーで測定し、運動の規則性を見出す。

\\textbf{◆ 理論式（等加速度直線運動）}
速度の計算：$v = v_0 + a t$
移動距離の計算：$x = v_0 t + \\frac{1}{2} a t^2$

\\textbf{<red>【実験時の注意点】</red>}
1. \\textbf{\\textcolor{red}{斜面の角度を固定}}し、毎回同じ位置から静止状態（$v_0 = 0$）で手を放すこと。
2. タイマーの打点数が50Hz（$0.02\\text{秒}$間隔）であることを確認すること。

\\textbf{\\textcolor{green}{班での問い}}:
「角度を2倍にすると、加速度 $a$ も2倍になるだろうか？ \\textbf{\\Large{グラフから検証しよう！}}」`;

      const res = parseRichStyledText(input, { baseFontSize: 22, baseColor: '#FF000000' });

      // Verification Criterion 1: UTF-16 Character Offset Accuracy with Japanese text
      const title = '【実験】斜面を下る台車の運動と速度変化';
      const titleLoc = res.cleanText.indexOf(title);
      assert.equal(titleLoc, 0);
      assert.equal(simulateAttributeAt(res, 0, 'foreground_color'), '#FF003366');
      assert.equal(simulateAttributeAt(res, 0, 'font').bold, true);

      // Target phrase slices
      const angleHighlight = '斜面の角度を固定';
      const angleLoc = res.cleanText.indexOf(angleHighlight);
      assert.ok(angleLoc > 0);
      assert.equal(simulateAttributeAt(res, angleLoc, 'foreground_color'), '#FFED1E14');
      assert.equal(simulateAttributeAt(res, angleLoc, 'font').bold, true);

      // Verification Criterion 2: Math formulas preserved untouched
      assert.ok(res.cleanText.includes('$x$'));
      assert.ok(res.cleanText.includes('$t$'));
      assert.ok(res.cleanText.includes('$v = v_0 + a t$'));
      assert.ok(res.cleanText.includes('$x = v_0 t + \\frac{1}{2} a t^2$'));
      assert.ok(res.cleanText.includes('$v_0 = 0$'));
      assert.ok(res.cleanText.includes('$0.02\\text{秒}$'));
      assert.ok(res.cleanText.includes('$a$'));

      // Nested emphasis: グラフから検証しよう！
      const graphLoc = res.cleanText.indexOf('グラフから検証しよう！');
      assert.ok(graphLoc > 0);
      assert.equal(simulateAttributeAt(res, graphLoc, 'font').bold, true);

      assertLinearLookupIntegrity(res, 22, '#FF000000', false);
    });

    it('Scenario 5: MCP Stdio Tool Request Pipeline Simulation', async () => {
      // Simulate external AI agent executing dry-run parsing via loilo_parse_styled_text logic
      const dryRunText = '大見出し: \\huge{\\textcolor{blue}{新機能リリース}}\n詳細: **高速処理**と $O(N \\log N)$ の計算量を実現。';
      const parsed = parseRichStyledText(dryRunText, {
        baseFontSize: 24,
        baseColor: '#FF000000',
        defaultBold: false
      });

      // Assert dry-run output schema
      const dryRunResult = {
        cleanText: parsed.cleanText,
        attributesCount: parsed.attributes.length,
        attributeRangesCount: parsed.attributeRanges.length,
        styleRanges: parsed.styleRanges
      };

      assert.ok(dryRunResult.cleanText.includes('大見出し: 新機能リリース\n詳細: 高速処理と $O(N \\log N)$ の計算量を実現。'));
      assert.ok(dryRunResult.attributesCount >= 6);
      assert.ok(dryRunResult.attributeRangesCount >= 6);
      assert.ok(Array.isArray(dryRunResult.styleRanges));

      // Simulate loilo_set_card_style payload generation
      const cardId = 'card-test-uuid-5555';
      const cardText = '\\textbf{\\textcolor{red}{緊急告知}}: システム停止のご案内';
      const cardParsed = parseRichStyledText(cardText, { baseFontSize: 26, baseColor: '#FF000000', defaultBold: false });

      const replacementPayload = {
        type: 'cardEdited',
        cardId,
        replacement: {
          'gadgets.title.h_alignment': 'left',
          'gadgets.title.v_alignment': 'middle',
          'gadgets.title.vertical': false,
          'gadgets.title.text': cardParsed.cleanText,
          'gadgets.title.attributes': cardParsed.attributes,
          'gadgets.title.attribute_ranges': cardParsed.attributeRanges,
          'gadgets.title.forecolor': '#FF000000',
          'gadgets.title.font_size': 26
        }
      };

      assert.equal(replacementPayload.replacement['gadgets.title.text'], '緊急告知: システム停止のご案内');
      assertLinearLookupIntegrity(cardParsed, 26, '#FF000000', false);
    });

  });
});
