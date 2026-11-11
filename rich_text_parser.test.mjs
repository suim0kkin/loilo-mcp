import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRichStyledText,
  normalizeHexColor,
  resolveFontSize,
  COLOR_PALETTE,
  LATEX_FONT_SCALES,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE
} from '../src/rich_text_parser.mjs';

describe('Rich Text & LaTeX Parser Engine (Milestone 1)', () => {

  describe('1. Exported Constants and Helper Functions', () => {
    it('exports COLOR_PALETTE with DADS and LoiLo standard colors', () => {
      assert.ok(COLOR_PALETTE.red);
      assert.strictEqual(COLOR_PALETTE.red, '#FFED1E14');
      assert.strictEqual(COLOR_PALETTE.blue, '#FF003366');
      assert.strictEqual(COLOR_PALETTE.green, '#FF006633');
      assert.strictEqual(COLOR_PALETTE.yellow, '#FFFFD200');
      assert.strictEqual(COLOR_PALETTE.orange, '#FFB34700');
      assert.strictEqual(COLOR_PALETTE.pink, '#FFFF6699');
      assert.strictEqual(COLOR_PALETTE.black, '#FF000000');
      assert.strictEqual(COLOR_PALETTE.white, '#FFFFFFFF');
      assert.strictEqual(COLOR_PALETTE.gray, '#FF757575');
      assert.strictEqual(COLOR_PALETTE.grey, '#FF757575');
      assert.strictEqual(COLOR_PALETTE.darkblue, '#FF001B44');
      assert.strictEqual(COLOR_PALETTE.lightblue, '#FF3399FF');
      assert.strictEqual(COLOR_PALETTE.purple, '#FF800080');
    });

    it('exports LATEX_FONT_SCALES multipliers', () => {
      assert.strictEqual(LATEX_FONT_SCALES.tiny, 0.50);
      assert.strictEqual(LATEX_FONT_SCALES.small, 0.85);
      assert.strictEqual(LATEX_FONT_SCALES.normalsize, 1.00);
      assert.strictEqual(LATEX_FONT_SCALES.large, 1.20);
      assert.strictEqual(LATEX_FONT_SCALES.Large, 1.40);
      assert.strictEqual(LATEX_FONT_SCALES.LARGE, 1.70);
      assert.strictEqual(LATEX_FONT_SCALES.huge, 2.00);
      assert.strictEqual(LATEX_FONT_SCALES.Huge, 2.50);
    });

    it('normalizeHexColor normalizes color names, hex, rgb, and handles fallbacks', () => {
      assert.strictEqual(normalizeHexColor('red'), '#FFED1E14');
      assert.strictEqual(normalizeHexColor('blue'), '#FF003366');
      assert.strictEqual(normalizeHexColor('#f00'), '#FFFF0000');
      assert.strictEqual(normalizeHexColor('#123456'), '#FF123456');
      assert.strictEqual(normalizeHexColor('#80123456'), '#80123456');
      assert.strictEqual(normalizeHexColor('rgb(255, 0, 128)'), '#FFFF0080');
      assert.strictEqual(normalizeHexColor('rgb(0, 51, 102)'), '#FF003366');
      assert.strictEqual(normalizeHexColor(null), '#FF000000');
      assert.strictEqual(normalizeHexColor(undefined), '#FF000000');
      assert.strictEqual(normalizeHexColor(''), '#FF000000');
      assert.strictEqual(normalizeHexColor('unknownColor', '#FFAABBCC'), '#FFAABBCC');
      assert.strictEqual(normalizeHexColor('#GGGGGG', '#FF000000'), '#FF000000');
    });

    it('resolveFontSize scales correctly and clamps into [10, 120]', () => {
      assert.strictEqual(resolveFontSize('tiny', 24), 12);
      assert.strictEqual(resolveFontSize('small', 24), 20);
      assert.strictEqual(resolveFontSize('normalsize', 24), 24);
      assert.strictEqual(resolveFontSize('large', 24), 29);
      assert.strictEqual(resolveFontSize('Large', 24), 34);
      assert.strictEqual(resolveFontSize('LARGE', 24), 41);
      assert.strictEqual(resolveFontSize('huge', 24), 48);
      assert.strictEqual(resolveFontSize('Huge', 24), 60);

      // Direct numeric
      assert.strictEqual(resolveFontSize(36, 24), 36);
      assert.strictEqual(resolveFontSize('36', 24), 36);

      // Clamping
      assert.strictEqual(resolveFontSize(-10, 24), MIN_FONT_SIZE);
      assert.strictEqual(resolveFontSize(5, 24), MIN_FONT_SIZE);
      assert.strictEqual(resolveFontSize(999, 24), MAX_FONT_SIZE);
      assert.strictEqual(resolveFontSize('invalid', 24), 24);
      assert.strictEqual(resolveFontSize(NaN, 24), 24);
    });

    it('safeguards against prototype pollution lookups (__proto__, toString, valueOf)', () => {
      assert.strictEqual(COLOR_PALETTE.__proto__, undefined);
      assert.strictEqual(COLOR_PALETTE.toString, undefined);
      assert.strictEqual(normalizeHexColor('__proto__', '#FF000000'), '#FF000000');
      assert.strictEqual(normalizeHexColor('toString', '#FF000000'), '#FF000000');
      assert.strictEqual(normalizeHexColor('valueOf', '#FF000000'), '#FF000000');
      assert.strictEqual(resolveFontSize('__proto__', 24), 24);
      assert.strictEqual(resolveFontSize('toString', 24), 24);
      assert.strictEqual(resolveFontSize('valueOf', 24), 24);

      // Verify HTML tags do not trigger on Object prototype properties
      const res = parseRichStyledText('<toString>Text</toString>');
      assert.strictEqual(res.cleanText, '<toString>Text</toString>');
      assert.strictEqual(res.styleRanges.length, 0);
    });
  });

  describe('2. Interface Contract & Baseline Tests', () => {
    it('returns expected object shape with all contract properties', () => {
      const res = parseRichStyledText('Hello world');
      assert.strictEqual(typeof res.cleanText, 'string');
      assert.ok(Array.isArray(res.attributes));
      assert.ok(Array.isArray(res.attributeRanges));
      assert.ok(Array.isArray(res.attribute_ranges));
      assert.strictEqual(res.attributeRanges, res.attribute_ranges);
      assert.ok(Array.isArray(res.styleRanges));
    });

    it('emits exact 4 default fallback attributes when no formatting tags exist', () => {
      const text = 'Plain text';
      const res = parseRichStyledText(text, { baseFontSize: 24, baseColor: '#FF000000', defaultBold: false });
      assert.strictEqual(res.cleanText, 'Plain text');
      assert.strictEqual(res.styleRanges.length, 0);
      assert.strictEqual(res.attributes.length, 4);
      assert.strictEqual(res.attributeRanges.length, 4);

      // Verify default fallback attributes
      assert.deepStrictEqual(res.attributes[0], { type: 'font', value: { bold: false, size: 24 } });
      assert.deepStrictEqual(res.attributes[1], { type: 'paragraph_style', value: { line_spacing: 0 } });
      assert.deepStrictEqual(res.attributes[2], { type: 'language', value: 'ja-JP' });
      assert.deepStrictEqual(res.attributes[3], { type: 'foreground_color', value: '#FF000000' });

      // All fallback ranges cover the full text [0, 10)
      for (const ar of res.attributeRanges) {
        assert.strictEqual(ar.range.location, 0);
        assert.strictEqual(ar.range.length, 10);
      }
    });

    it('supports backward-compatible number argument for baseFontSize', () => {
      const res = parseRichStyledText('Hello', 30);
      assert.strictEqual(res.attributes[0].value.size, 30);
    });
  });

  describe('3. Single Formatting Syntaxes (Markdown, LaTeX, HTML)', () => {
    it('parses Markdown bold (**text**)', () => {
      const res = parseRichStyledText('Here is **bold** text');
      assert.strictEqual(res.cleanText, 'Here is bold text');
      const highlight = res.attributeRanges[0];
      assert.strictEqual(highlight.range.location, 8);
      assert.strictEqual(highlight.range.length, 4);
      assert.deepStrictEqual(res.attributes[highlight.index], {
        type: 'font',
        value: { bold: true, size: 24 }
      });
    });

    it('parses Markdown bold (__text__)', () => {
      const res = parseRichStyledText('Here is __underbold__ text');
      assert.strictEqual(res.cleanText, 'Here is underbold text');
      const highlight = res.attributeRanges[0];
      assert.strictEqual(highlight.range.location, 8);
      assert.strictEqual(highlight.range.length, 9);
      assert.deepStrictEqual(res.attributes[highlight.index], {
        type: 'font',
        value: { bold: true, size: 24 }
      });
    });

    it('parses LaTeX bold (\\textbf{text})', () => {
      const res = parseRichStyledText('LaTeX \\textbf{important} keyword');
      assert.strictEqual(res.cleanText, 'LaTeX important keyword');
      const highlight = res.attributeRanges[0];
      assert.strictEqual(highlight.range.location, 6);
      assert.strictEqual(highlight.range.length, 9);
      assert.deepStrictEqual(res.attributes[highlight.index], {
        type: 'font',
        value: { bold: true, size: 24 }
      });
    });

    it('parses HTML bold (<b>text</b> and <strong>text</strong>)', () => {
      const res = parseRichStyledText('<b>First</b> and <strong>Second</strong>');
      assert.strictEqual(res.cleanText, 'First and Second');
      assert.strictEqual(res.attributeRanges[0].range.location, 0);
      assert.strictEqual(res.attributeRanges[0].range.length, 5);
      assert.strictEqual(res.attributeRanges[1].range.location, 10);
      assert.strictEqual(res.attributeRanges[1].range.length, 6);
    });

    it('parses LaTeX color (\\textcolor{red}{text})', () => {
      const res = parseRichStyledText('Alert: \\textcolor{red}{danger}');
      assert.strictEqual(res.cleanText, 'Alert: danger');
      const highlight = res.attributeRanges[0];
      assert.strictEqual(highlight.range.location, 7);
      assert.strictEqual(highlight.range.length, 6);
      assert.deepStrictEqual(res.attributes[highlight.index], {
        type: 'foreground_color',
        value: '#FFED1E14'
      });
    });

    it('parses HTML color tags (<red>text</red> and <blue>text</blue>)', () => {
      const res = parseRichStyledText('<red>Red</red> and <blue>Blue</blue>');
      assert.strictEqual(res.cleanText, 'Red and Blue');
      assert.strictEqual(res.attributeRanges[0].range.location, 0);
      assert.strictEqual(res.attributeRanges[0].range.length, 3);
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value, '#FFED1E14');

      assert.strictEqual(res.attributeRanges[1].range.location, 8);
      assert.strictEqual(res.attributeRanges[1].range.length, 4);
      assert.strictEqual(res.attributes[res.attributeRanges[1].index].value, '#FF003366');
    });

    it('parses HTML <color value="..."> and <color name="..."> tags', () => {
      const res1 = parseRichStyledText('<color value="#006633">Custom Green</color>');
      assert.strictEqual(res1.cleanText, 'Custom Green');
      assert.strictEqual(res1.attributeRanges[0].range.location, 0);
      assert.strictEqual(res1.attributeRanges[0].range.length, 12);
      assert.strictEqual(res1.attributes[res1.attributeRanges[0].index].value, '#FF006633');

      const res2 = parseRichStyledText('<color name="orange">Orange Text</color>');
      assert.strictEqual(res2.cleanText, 'Orange Text');
      assert.strictEqual(res2.attributes[res2.attributeRanges[0].index].value, '#FFB34700');
    });

    it('parses LaTeX font sizes (\\huge{text}, \\small{text})', () => {
      const res = parseRichStyledText('\\huge{Huge Title} and \\small{small note}', { baseFontSize: 24 });
      assert.strictEqual(res.cleanText, 'Huge Title and small note');
      
      // huge = 24 * 2.0 = 48
      const hugeAttr = res.attributes[res.attributeRanges[0].index];
      assert.strictEqual(hugeAttr.value.size, 48);
      assert.strictEqual(res.attributeRanges[0].range.location, 0);
      assert.strictEqual(res.attributeRanges[0].range.length, 10);

      // small = 24 * 0.85 = 20
      const smallAttr = res.attributes[res.attributeRanges[1].index];
      assert.strictEqual(smallAttr.value.size, 20);
      assert.strictEqual(res.attributeRanges[1].range.location, 15);
      assert.strictEqual(res.attributeRanges[1].range.length, 10);
    });

    it('parses HTML <size value="36"> and <size pt="28"> tags', () => {
      const res1 = parseRichStyledText('<size value="36">Sized Text</size>');
      assert.strictEqual(res1.cleanText, 'Sized Text');
      assert.strictEqual(res1.attributes[res1.attributeRanges[0].index].value.size, 36);

      const res2 = parseRichStyledText('<size pt="28">PT Text</size>');
      assert.strictEqual(res2.cleanText, 'PT Text');
      assert.strictEqual(res2.attributes[res2.attributeRanges[0].index].value.size, 28);
    });

    it('supports all palette color tags (<green>, <yellow>, <orange>, <pink>, <purple>, <black>, <white>, <gray>, <grey>, <darkblue>, <lightblue>)', () => {
      const tags = ['green', 'yellow', 'orange', 'pink', 'purple', 'black', 'white', 'gray', 'grey', 'darkblue', 'lightblue'];
      for (const tag of tags) {
        const res = parseRichStyledText(`<${tag}>Text</${tag}>`);
        assert.strictEqual(res.cleanText, 'Text');
        assert.strictEqual(res.attributes[res.attributeRanges[0].index].value, COLOR_PALETTE[tag]);
      }
    });
  });

  describe('4. Math Expression Protection & Currency Disambiguation', () => {
    it('protects inline math with multiplication asterisks ($x_1 * y_2$)', () => {
      const input = 'Formula: $x_1 * y_2 * z_3$ is calculated.';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      // No bold attributes should be created from *
      const boldAttrs = res.attributes.slice(0, res.attributes.length - 4).filter(a => a.value?.bold);
      assert.strictEqual(boldAttrs.length, 0);
    });

    it('protects block math with fractions and sum ($$\\sum_{i=1}^n \\frac{a_i}{b_i}$$)', () => {
      const input = 'Equation:\n$$\\sum_{i=1}^n \\frac{a_i}{b_i}$$\nEnd.';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('protects inline math containing comparison brackets ($a < b > c$)', () => {
      const input = 'Inequality: $a < b > c$ holds true.';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('correctly styles text adjacent to math formulas without offset skew', () => {
      const input = 'Before **bold1** then $E=mc^2$ then \\textbf{bold2} after';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, 'Before bold1 then $E=mc^2$ then bold2 after');

      // bold1: starts at 7, length 5
      assert.strictEqual(res.attributeRanges[0].range.location, 7);
      assert.strictEqual(res.attributeRanges[0].range.length, 5);
      assert.strictEqual(res.cleanText.slice(7, 12), 'bold1');

      // bold2: starts at indexOf('bold2'), length 5
      const bold2Loc = res.cleanText.indexOf('bold2');
      assert.strictEqual(res.attributeRanges[1].range.location, bold2Loc);
      assert.strictEqual(res.attributeRanges[1].range.length, 5);
      assert.strictEqual(res.cleanText.slice(bold2Loc, bold2Loc + 5), 'bold2');
    });

    it('does not treat currency signs as math ($50 and $100)', () => {
      const input = 'Costs are $50 and $100.';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('handles escaped dollar sign (\\$100)', () => {
      const input = 'Cost is \\$100 per unit.';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, 'Cost is \\$100 per unit.');
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('correctly parses adjacent inline math formulas ($a$$b$$c$) without sentinel leak', () => {
      const input = '$a$$b$$c$';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, '$a$$b$$c$');
      assert.strictEqual(res.cleanText.includes('\uE000'), false, 'Should not contain raw PUA sentinel');
      assert.strictEqual(res.cleanText.includes('MATH_'), false, 'Should not leak MATH sentinel');
    });

    it('preserves escaped dollars inside math formulas ($\\text{\\$50}$)', () => {
      const input = 'Total: $\\text{\\$50}$ paid';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, 'Total: $\\text{\\$50}$ paid');
      assert.strictEqual(res.cleanText.includes('\uE000'), false, 'Should not contain raw PUA sentinel');
      assert.strictEqual(res.cleanText.includes('ESCD_'), false, 'Should not leak ESCD sentinel');
    });

    it('protects basic inline math without special operators ($E=mc^2$)', () => {
      const input = '$E=mc^2$';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, '$E=mc^2$');
      assert.strictEqual(res.styleRanges.length, 0);
      const customAttrs = res.attributes.slice(0, Math.max(0, res.attributes.length - 4));
      assert.strictEqual(customAttrs.length, 0);
    });

    it('protects standalone curly-brace LaTeX math formula ($\\frac{a}{b}$)', () => {
      const input = 'Formula: $\\frac{a}{b}$ is a fraction.';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('handles unclosed math delimiter gracefully without hanging or throwing', () => {
      const input = 'This is $unclosed math without closing delimiter';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('protects inline math containing whitespace inside delimiters ($ a + b = c $)', () => {
      const input = 'Math with spaces: $ a + b = c $ end.';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });
  });

  describe('5. Input Sanitization & Boundary Nullability', () => {
    it('handles null safely without throwing (E1)', () => {
      const res = parseRichStyledText(null);
      assert.strictEqual(res.cleanText, '');
      assert.strictEqual(res.styleRanges.length, 0);
      assert.strictEqual(res.attributeRanges[0].range.length, 0);
    });

    it('handles undefined safely without throwing (E2)', () => {
      const res = parseRichStyledText(undefined);
      assert.strictEqual(res.cleanText, '');
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('handles numeric input safely by converting to string (E3)', () => {
      const res = parseRichStyledText(12345);
      assert.strictEqual(res.cleanText, '12345');
      assert.strictEqual(res.attributeRanges[0].range.length, 5);
    });

    it('handles object input safely (E4)', () => {
      const res = parseRichStyledText({});
      assert.strictEqual(res.cleanText, '[object Object]');
      assert.strictEqual(res.attributeRanges[0].range.length, 15);
    });

    it('handles empty string gracefully (E5)', () => {
      const res = parseRichStyledText('');
      assert.strictEqual(res.cleanText, '');
      assert.strictEqual(res.styleRanges.length, 0);
      assert.strictEqual(res.attributeRanges.length, 4);
    });

    it('preserves whitespace-only string verbatim (E6)', () => {
      const input = '   \t\n ';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.attributeRanges[0].range.length, input.length);
    });

    it('treats unclosed \\textbf{ as literal plain text (E8)', () => {
      const input = 'This is \\textbf{unclosed text';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('treats unclosed ** as literal plain text (E9)', () => {
      const input = 'This is **unclosed markdown';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('treats unclosed <color value="red"> as literal plain text (E10)', () => {
      const input = 'Unclosed <color value="red">color tag';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('treats unclosed HTML shorthand tag as literal plain text (E11)', () => {
      const input = '<red>未完の赤文字';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('treats unclosed \\textcolor{red}{ as literal plain text (E12)', () => {
      const input = '\\textcolor{red}{未完';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('treats unclosed \\huge{ as literal plain text (E13)', () => {
      const input = '\\huge{未完の見出し';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('treats unclosed <size value="32"> as literal plain text (E14)', () => {
      const input = '<size value="32">未完';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, input);
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('ignores empty tag bodies without emitting 0-length highlight ranges (E15, E16, E17, E18)', () => {
      const input = 'Empty \\textbf{} and **** and <red></red> and \\textcolor{blue}{}';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, 'Empty  and  and  and ');
      assert.strictEqual(res.styleRanges.length, 0);
    });

    it('correctly handles sequential adjacent tags (E19)', () => {
      const input = '**太字**<red>赤字</red>';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, '太字赤字');
      assert.strictEqual(res.attributeRanges[0].range.location, 0);
      assert.strictEqual(res.attributeRanges[0].range.length, 2);
      assert.strictEqual(res.attributeRanges[1].range.location, 2);
      assert.strictEqual(res.attributeRanges[1].range.length, 2);
    });

    it('correctly handles sequential tags with intervening text (E20)', () => {
      const input = '前**太字**中<red>赤字</red>後';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, '前太字中赤字後');
      assert.strictEqual(res.attributeRanges[0].range.location, 1);
      assert.strictEqual(res.attributeRanges[0].range.length, 2);
      assert.strictEqual(res.attributeRanges[1].range.location, 4);
      assert.strictEqual(res.attributeRanges[1].range.length, 2);
    });
  });

  describe('6. Color & Size Normalization & Clamping Details', () => {
    it('normalizes named colors to standard LoiLo/DADS ARGB hex (E33 fallback)', () => {
      const res = parseRichStyledText('\\textcolor{blue}{Blue} and \\textcolor{unknown}{Unknown}', { baseColor: '#FF000000' });
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value, '#FF003366');
      assert.strictEqual(res.attributes[res.attributeRanges[1].index].value, '#FF000000');
    });

    it('falls back to baseColor on invalid hex #GGGGGG (E34)', () => {
      const res = parseRichStyledText('\\textcolor{#GGGGGG}{エラー}', { baseColor: '#FF000000' });
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value, '#FF000000');
    });

    it('normalizes 3-digit hex (E35)', () => {
      const res = parseRichStyledText('\\textcolor{#f00}{赤}');
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value, '#FFFF0000');
    });

    it('normalizes 6-digit hex (E36)', () => {
      const res = parseRichStyledText('\\textcolor{#123456}{色}');
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value, '#FF123456');
    });

    it('preserves valid 8-digit ARGB hex (E37)', () => {
      const res = parseRichStyledText('\\textcolor{#80123456}{半透明}');
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value, '#80123456');
    });

    it('normalizes rgb(r, g, b) notation (E38)', () => {
      const res = parseRichStyledText('<color value="rgb(255, 0, 128)">桃</color>');
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value, '#FFFF0080');
    });

    it('resolves relative LaTeX sizes (E39, E40)', () => {
      const res1 = parseRichStyledText('\\huge{巨大見出し}', { baseFontSize: 24 });
      assert.strictEqual(res1.attributes[res1.attributeRanges[0].index].value.size, 48);

      const res2 = parseRichStyledText('\\tiny{脚注}', { baseFontSize: 24 });
      assert.strictEqual(res2.attributes[res2.attributeRanges[0].index].value.size, 12);
    });

    it('falls back to baseFontSize for invalid size string (E41)', () => {
      const res = parseRichStyledText('<size value="invalid">文字</size>', { baseFontSize: 24 });
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value.size, 24);
    });

    it('clamps negative font size to MIN_FONT_SIZE (10) (E42)', () => {
      const res = parseRichStyledText('<size value="-20">極小</size>');
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value.size, MIN_FONT_SIZE);
    });

    it('clamps huge font size to MAX_FONT_SIZE (120) (E43)', () => {
      const res = parseRichStyledText('<size value="9999">超巨大</size>');
      assert.strictEqual(res.attributes[res.attributeRanges[0].index].value.size, MAX_FONT_SIZE);
    });
  });

  describe('7. Nested & Compound Formatting', () => {
    it('handles nested LaTeX bold and color (\\textbf{\\textcolor{red}{text}}) (E21)', () => {
      const res = parseRichStyledText('\\textbf{\\textcolor{red}{重要}}');
      assert.strictEqual(res.cleanText, '重要');
      assert.strictEqual(res.attributeRanges[0].range.location, 0);
      assert.strictEqual(res.attributeRanges[0].range.length, 2);
      
      const appliedAttrs = res.attributeRanges.slice(0, 2).map(ar => res.attributes[ar.index]);
      const hasBold = appliedAttrs.some(a => a.type === 'font' && a.value.bold === true);
      const hasRed = appliedAttrs.some(a => a.type === 'foreground_color' && a.value === '#FFED1E14');
      assert.ok(hasBold, 'Should contain bold font attribute');
      assert.ok(hasRed, 'Should contain red color attribute');
    });

    it('handles nested size and bold (\\huge{\\textbf{タイトル}}) (E22)', () => {
      const res = parseRichStyledText('\\huge{\\textbf{タイトル}}', { baseFontSize: 24 });
      assert.strictEqual(res.cleanText, 'タイトル');
      assert.strictEqual(res.attributeRanges[0].range.location, 0);
      assert.strictEqual(res.attributeRanges[0].range.length, 4);

      // Must be MERGED into a single compound font attribute to prevent same-type shadowing!
      const fontAttr = res.attributes[res.attributeRanges[0].index];
      assert.strictEqual(fontAttr.type, 'font');
      assert.strictEqual(fontAttr.value.size, 48);
      assert.strictEqual(fontAttr.value.bold, true);
    });

    it('handles Markdown bold enclosing HTML color (**<red>重要警告</red>**) (E23)', () => {
      const res = parseRichStyledText('**<red>重要警告</red>**');
      assert.strictEqual(res.cleanText, '重要警告');
      assert.strictEqual(res.attributeRanges[0].range.location, 0);
      assert.strictEqual(res.attributeRanges[0].range.length, 4);

      const appliedAttrs = res.attributeRanges.slice(0, 2).map(ar => res.attributes[ar.index]);
      const hasBold = appliedAttrs.some(a => a.type === 'font' && a.value.bold === true);
      const hasRed = appliedAttrs.some(a => a.type === 'foreground_color' && a.value === '#FFED1E14');
      assert.ok(hasBold);
      assert.ok(hasRed);
    });

    it('handles three-level nesting: \\Large{\\textbf{Title with \\textcolor{red}{Red Bold} inside}}', () => {
      const input = '\\Large{\\textbf{Title with \\textcolor{red}{Red Bold} inside}}';
      const res = parseRichStyledText(input, { baseFontSize: 24 });
      assert.strictEqual(res.cleanText, 'Title with Red Bold inside');
      
      const redBoldIndex = res.cleanText.indexOf('Red Bold');
      assert.ok(redBoldIndex > 0);

      // Locate highlight ranges covering 'Red Bold'
      const rangesAtRedBold = res.attributeRanges.filter(
        ar => ar.range.location === redBoldIndex && ar.range.length === 8
      );
      assert.ok(rangesAtRedBold.length >= 2, 'Should have both font and color range for Red Bold');

      const fontAttr = res.attributes[rangesAtRedBold.find(r => res.attributes[r.index].type === 'font').index];
      assert.strictEqual(fontAttr.value.bold, true);
      assert.strictEqual(fontAttr.value.size, 34); // Large = 24 * 1.4 = 34

      const colorAttr = res.attributes[rangesAtRedBold.find(r => res.attributes[r.index].type === 'foreground_color').index];
      assert.strictEqual(colorAttr.value, '#FFED1E14');
    });
  });

  describe('8. Japanese Text, Unicode & Surrogate Pair Offsets', () => {
    it('calculates exact offsets for Japanese Kanji, Hiragana and Katakana (E29)', () => {
      const input = 'はじめに、\\textbf{重要課題}を確認し、<red>改善策</red>を実行する。';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, 'はじめに、重要課題を確認し、改善策を実行する。');

      const boldRange = res.attributeRanges[0].range;
      assert.strictEqual(res.cleanText.slice(boldRange.location, boldRange.location + boldRange.length), '重要課題');

      const redRange = res.attributeRanges[1].range;
      assert.strictEqual(res.cleanText.slice(redRange.location, redRange.location + redRange.length), '改善策');
    });

    it('correctly aligns offsets when 32-bit emoji surrogate pairs precede styled text (E30)', () => {
      const input = '🎉 **祝賀イベント** 🚀';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, '🎉 祝賀イベント 🚀');

      const boldRange = res.attributeRanges[0].range;
      // '🎉 ' is 3 UTF-16 code units (2 for 🎉, 1 for space)
      assert.strictEqual(boldRange.location, 3);
      assert.strictEqual(boldRange.length, 6);
      assert.strictEqual(res.cleanText.slice(boldRange.location, boldRange.location + boldRange.length), '祝賀イベント');
    });

    it('correctly calculates length for emoji contained inside bold tag (E31)', () => {
      const input = '\\textbf{🚀 ロケット発射}';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, '🚀 ロケット発射');

      const boldRange = res.attributeRanges[0].range;
      assert.strictEqual(boldRange.location, 0);
      // '🚀 ロケット発射': 2 + 1 + 6 = 9 code units
      assert.strictEqual(boldRange.length, 9);
      assert.strictEqual(res.cleanText.slice(boldRange.location, boldRange.location + boldRange.length), '🚀 ロケット発射');
    });

    it('correctly calculates offsets when complex ZWJ emojis are present (E32)', () => {
      const input = '👨‍👩‍👧‍👦 \\textbf{家族の時間}';
      const res = parseRichStyledText(input);
      assert.strictEqual(res.cleanText, '👨‍👩‍👧‍👦 家族の時間');

      const boldRange = res.attributeRanges[0].range;
      const expectedLocation = '👨‍👩‍👧‍👦 '.length; // 12 UTF-16 code units
      assert.strictEqual(boldRange.location, expectedLocation);
      assert.strictEqual(res.cleanText.slice(boldRange.location, boldRange.location + boldRange.length), '家族の時間');
    });
  });

  describe('9. LoiLo Note Attribute Range Precedence & Shadowing Rules', () => {
    it('places specific highlight ranges strictly BEFORE full-card fallback attributes (E44)', () => {
      const input = '通常 **太字ハイライト** 通常';
      const res = parseRichStyledText(input);

      const highlightCount = 1;
      assert.strictEqual(res.attributeRanges[0].range.location, 3);
      assert.strictEqual(res.attributeRanges[0].range.length, 7);

      // Verify all 4 fallback ranges (location: 0, length: totalLength) are placed AFTER highlights
      const fallbackRanges = res.attributeRanges.slice(highlightCount);
      assert.strictEqual(fallbackRanges.length, 4);
      for (const fr of fallbackRanges) {
        assert.strictEqual(fr.range.location, 0);
        assert.strictEqual(fr.range.length, res.cleanText.length);
      }
    });

    it('ensures attribute index mapping accurately points to valid attributes elements', () => {
      const input = '**太字** と \\textcolor{red}{赤文字} と \\huge{巨大}';
      const res = parseRichStyledText(input);

      for (const ar of res.attributeRanges) {
        assert.ok(ar.index >= 0 && ar.index < res.attributes.length, `Index ${ar.index} out of bounds`);
        assert.ok(res.attributes[ar.index] !== undefined);
      }
    });
  });
});
