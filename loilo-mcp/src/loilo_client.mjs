import fs from 'node:fs';
import path from 'node:path';
import { SLIDE_TEMPLATES, DADS_TOKENS } from './dads_templates.mjs';

/**
 * Parses markdown-like styled text (**bold** and <red>accent</red>)
 * into plain text and official LoiLoNote attribute ranges.
 */
export function parseStyledText(rawText, baseFontSize = 24, baseColor = '#FF000000', defaultBold = false) {
  if (typeof rawText !== 'string') rawText = String(rawText ?? '');

  const tokenRegex = /(\*\*(.*?)\*\*|<red>(.*?)<\/red>)/g;
  let cleanText = '';
  let lastIndex = 0;
  const styleRanges = [];

  let match;
  while ((match = tokenRegex.exec(rawText)) !== null) {
    cleanText += rawText.slice(lastIndex, match.index);
    const startPos = cleanText.length;

    if (match[2] !== undefined) {
      // **bold**
      const content = match[2];
      cleanText += content;
      styleRanges.push({ start: startPos, length: content.length, type: 'bold' });
    } else if (match[3] !== undefined) {
      // <red>accent</red>
      const content = match[3];
      cleanText += content;
      styleRanges.push({ start: startPos, length: content.length, type: 'red' });
    }

    lastIndex = tokenRegex.lastIndex;
  }
  cleanText += rawText.slice(lastIndex);
  const totalLength = cleanText.length;

  const attributes = [];
  const attributeRanges = [];

  // ロイロノート内部の attributeAt は attribute_ranges.findIndex による前方線形探索を行うため、
  // 個別強調スタイルを先頭に登録しないと、全体のデフォルト範囲にシャドーイングされて無効化される。
  for (const sr of styleRanges) {
    if (sr.type === 'bold') {
      const attrIdx = attributes.length;
      attributes.push({ type: 'font', value: { bold: true, size: baseFontSize } });
      attributeRanges.push({ index: attrIdx, range: { location: sr.start, length: sr.length } });
    } else if (sr.type === 'red') {
      const attrIdx = attributes.length;
      attributes.push({ type: 'foreground_color', value: '#FFC00000' }); // DADS Accent Red
      attributeRanges.push({ index: attrIdx, range: { location: sr.start, length: sr.length } });
    }
  }

  // デフォルト属性（フォールバック）を末尾に配置
  const defFontIdx = attributes.length;
  attributes.push({ type: 'font', value: { bold: defaultBold, size: baseFontSize } });
  attributeRanges.push({ index: defFontIdx, range: { location: 0, length: totalLength } });

  const defParaIdx = attributes.length;
  attributes.push({ type: 'paragraph_style', value: { line_spacing: 0 } });
  attributeRanges.push({ index: defParaIdx, range: { location: 0, length: totalLength } });

  const defLangIdx = attributes.length;
  attributes.push({ type: 'language', value: 'ja-JP' });
  attributeRanges.push({ index: defLangIdx, range: { location: 0, length: totalLength } });

  const defColorIdx = attributes.length;
  attributes.push({ type: 'foreground_color', value: baseColor });
  attributeRanges.push({ index: defColorIdx, range: { location: 0, length: totalLength } });

  return { cleanText, attributes, attributeRanges };
}

/**
 * LoiLoNote Official UI-driven Automation Client
 * Designed with Readable Code and Zero-Guessing standards.
 */
export class LoiloClient {
  constructor(wsUrl = null) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reqId = 1;
  }

  async connect() {
    if (!this.wsUrl) {
      const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
      const loiloTab = tabs.find(t => t.url && t.url.includes('loilonote.app'));
      if (!loiloTab) {
        throw new Error('Active LoiLoNote tab not found on port 9222');
      }
      this.wsUrl = loiloTab.webSocketDebuggerUrl;
    }

    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(method, params = {}, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const currentId = this.reqId++;
      let timer = null;
      const messageHandler = (evt) => {
        try {
          const message = JSON.parse(evt.data);
          if (message.id === currentId) {
            if (timer) clearTimeout(timer);
            this.ws.removeEventListener('message', messageHandler);
            if (message.error) {
              reject(new Error(JSON.stringify(message.error)));
            } else {
              resolve(message.result);
            }
          }
        } catch {
          // ignore JSON parse error
        }
      };
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.ws.removeEventListener('message', messageHandler);
          if (method.startsWith('Input.')) {
            resolve({});
          } else {
            reject(new Error(`CDP command timeout (${timeoutMs}ms): ${method}`));
          }
        }, timeoutMs);
      }
      this.ws.addEventListener('message', messageHandler);
      this.ws.send(JSON.stringify({ id: currentId, method, params }));
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Evaluates predicate expression periodically and resolves as soon as it becomes truthy.
   * Completely eliminates idle waiting time compared to hardcoded sleep.
   *
   * @param {string} predicateExpression - JS expression returning boolean inside browser
   * @param {object} [options]
   * @param {number} [options.timeoutMs=6000] - Maximum waiting time
   * @param {number} [options.intervalMs=25] - Polling interval
   * @returns {Promise<number>} Elapsed time in milliseconds
   */
  async waitFor(predicateExpression, { timeoutMs = 6000, intervalMs = 25 } = {}) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const response = await this.send('Runtime.evaluate', {
        expression: `(() => Boolean(${predicateExpression}))()`,
        returnByValue: true
      });
      if (response.result?.value === true) {
        return Date.now() - startTime;
      }
      await this.sleep(intervalMs);
    }
    throw new Error(`Timeout (${timeoutMs}ms) waiting for predicate: ${predicateExpression}`);
  }

  /**
   * Captures full screen screenshot with high-efficiency compression.
   * Defaults to WebP format (~60% smaller than PNG while maintaining PSNR > 50dB).
   * Supports automatic format resolution based on file extension (.webp, .png, .jpeg).
   *
   * @param {string} filePath - Destination file path (e.g. "screenshot.webp")
   * @param {object} [options] - Optional settings
   * @param {number} [options.quality=85] - Compression quality for webp/jpeg (1-100)
   * @returns {Promise<string>} The actual resolved file path where the screenshot was saved
   */
  async takeScreenshot(filePath, options = {}) {
    const extension = path.extname(filePath).toLowerCase();
    const resolvedPath = extension ? filePath : `${filePath}.webp`;
    const targetExt = extension || '.webp';

    const screenshotParams = {};
    if (targetExt === '.png') {
      screenshotParams.format = 'png';
    } else if (targetExt === '.jpeg' || targetExt === '.jpg') {
      screenshotParams.format = 'jpeg';
      screenshotParams.quality = Math.max(1, Math.min(100, options.quality ?? 85));
    } else {
      // Default to WebP: natively supported by CDP with optimal compression ratio
      screenshotParams.format = 'webp';
      screenshotParams.quality = Math.max(1, Math.min(100, options.quality ?? 85));
    }

    const result = await this.send('Page.captureScreenshot', screenshotParams);
    fs.writeFileSync(resolvedPath, Buffer.from(result.data, 'base64'));
    return resolvedPath;
  }

  /**
   * Reads canvas note state via React Fiber introspection without mutating store
   */
  async getCanvasState() {
    const response = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        let fiber = canvas ? canvas[Object.keys(canvas).find(k => k.startsWith('__reactFiber$'))] : null;
        let depth = 0, note = null;
        while (fiber && depth < 35) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState && hook.memoizedState.note) {
              note = hook.memoizedState.note;
              break;
            }
            hook = hook.next;
          }
          if (note) break;
          fiber = fiber.return;
          depth++;
        }
        if (!note) return JSON.stringify({ error: 'Note not found' });

        const cards = [];
        if (note.cardMap) {
          for (const [id, c] of note.cardMap.entries()) {
            cards.push({
              id: String(id),
              parent: c.parent ? String(c.parent) : null,
              color: typeof c.color === 'string' ? c.color : (c.color?.name || 'unknown'),
              hasImage: !!c.content?.image,
              childrenCount: c.children ? c.children.length : 0
            });
          }
        }

        const connectors = [];
        if (note.connectorMap) {
          for (const [id, conn] of note.connectorMap.entries()) {
            connectors.push({
              id: String(id),
              from: typeof conn.from === 'object' ? (conn.from?.id || 'obj') : String(conn.from),
              to: typeof conn.to === 'object' ? (conn.to?.id || 'obj') : String(conn.to)
            });
          }
        }

        return JSON.stringify({ cardCount: cards.length, cards, connectors });
      })()`,
      returnByValue: true
    });

    return JSON.parse(response.result.value);
  }

  /**
   * Retrieves screen coordinates of a given card
   */
  async getCardScreenCoords(cardId) {
    const coordResponse = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        let fiber = canvas ? canvas[Object.keys(canvas).find(k => k.startsWith('__reactFiber$'))] : null;
        let depth = 0, note = null, manager = null;
        while (fiber && depth < 35) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState && hook.memoizedState.note) {
              note = hook.memoizedState.note;
              manager = hook.memoizedState.manager;
              break;
            }
            hook = hook.next;
          }
          if (note) break;
          fiber = fiber.return;
          depth++;
        }
        const card = note?.cardMap?.get('${cardId}');
        if (!card || !manager) return null;
        const mtx = manager._renderer.transform.mtx;
        const canvasRect = canvas.getBoundingClientRect();
        const pt = mtx.transformPointXY(card._position.x, card._position.y);
        return {
          screenX: Math.round(canvasRect.left + pt.x),
          screenY: Math.round(canvasRect.top + pt.y)
        };
      })()`,
      returnByValue: true
    });
    return coordResponse.result.value;
  }

  /**
   * Creates a card with a specific color from toolbar palette
   * @param {string} color - One of 'white', 'blue', 'green', 'yellow', 'red', 'pink', 'lightBlue', etc.
   */
  async createColorCard(color = 'white') {
    const colorMap = {
      white: 'しろいろ',
      blue: 'あおいろ',
      lightBlue: 'うすあおいろ',
      darkBlue: '濃いあおいろ',
      green: 'みどりいろ',
      lightGreen: 'うすみどりいろ',
      yellow: 'きいろ',
      lightYellow: 'うすきいろ',
      red: 'あかいろ',
      pink: 'ピンクいろ',
      transparent: '透明',
      black: 'くろいろ'
    };
    const targetLabel = colorMap[color] || color;

    const beforeState = await this.getCanvasState();
    const existingIds = new Set(beforeState.cards.map(c => c.id));

    // 1. Click "テキスト" menu button on left toolbar via DOM
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('.menuButton, .uiButton')).find(e => (e.innerText || '').trim() === 'テキスト');
        if (btn) btn.click();
      })()`
    });
    await this.sleep(800);

    // 2. Click color palette cell via aria-label
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const cells = Array.from(document.querySelectorAll('.textCardDialogCell'));
        const cell = cells.find(e => (e.getAttribute('aria-label') || '').includes('${targetLabel}')) || cells[cells.length - 2];
        if (cell) cell.click();
      })()`
    });
    await this.sleep(1500);

    const afterState = await this.getCanvasState();
    const newCard = afterState.cards.find(c => !existingIds.has(c.id));
    if (!newCard) {
      throw new Error(`Failed to create card of color "${color}": no new card detected`);
    }
    return newCard.id;
  }

  /**
   * Creates a pure white background card via official toolbar palette
   */
  async createWhiteCard() {
    return this.createColorCard('white');
  }

  /**
   * Nests a card inside a parent card via official treeStateChanged command
   */
  async nestCard(cardId, parentId) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        let fiber = canvas ? canvas[Object.keys(canvas).find(k => k.startsWith('__reactFiber$'))] : null;
        let depth = 0, manager = null;
        while (fiber && depth < 35) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState && hook.memoizedState.manager) {
              manager = hook.memoizedState.manager;
              break;
            }
            hook = hook.next;
          }
          if (manager) break;
          fiber = fiber.return;
          depth++;
        }
        if (!manager?.context?.onEmitCardCommand) return { error: 'Manager dispatcher not found' };
        manager.context.onEmitCardCommand({
          type: 'treeStateChanged',
          cardId: '${cardId}',
          parentId: '${parentId}',
          grouped: false
        });
        return { success: true };
      })()`,
      returnByValue: true
    });
    await this.sleep(400);
    return result.result.value;
  }

  /**
   * Deletes a card via official cardDeleted command
   */
  async deleteCard(cardId) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        let fiber = canvas ? canvas[Object.keys(canvas).find(k => k.startsWith('__reactFiber$'))] : null;
        let depth = 0, manager = null;
        while (fiber && depth < 35) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState && hook.memoizedState.manager) {
              manager = hook.memoizedState.manager;
              break;
            }
            hook = hook.next;
          }
          if (manager) break;
          fiber = fiber.return;
          depth++;
        }
        if (!manager?.context?.onEmitCardCommand) return { error: 'Manager dispatcher not found' };
        manager.context.onEmitCardCommand({
          type: 'cardDeleted',
          cardId: '${cardId}'
        });
        return { success: true };
      })()`,
      returnByValue: true
    });
    await this.sleep(300);
    return result.result.value;
  }

  /**
   * Fits all canvas cards into current viewport via renderer justFitZoom
   */
  async zoomFit() {
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        let fiber = canvas ? canvas[Object.keys(canvas).find(k => k.startsWith('__reactFiber$'))] : null;
        let depth = 0, manager = null;
        while (fiber && depth < 35) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState && hook.memoizedState.manager) {
              manager = hook.memoizedState.manager;
              break;
            }
            hook = hook.next;
          }
          if (manager) break;
          fiber = fiber.return;
          depth++;
        }
        const r = manager?._renderer || manager?.renderer;
        if (r?.handleJustFitZoom) r.handleJustFitZoom();
        else if (r?.setJustFitZoom) r.setJustFitZoom();
      })()`
    });
    await this.sleep(500);
  }

  /**
   * Opens the card editor by double-clicking the card on Canvas (zero navigation lag)
   */
  async openCardEditorByDoubleClick(cardId) {
    const coords = await this.getCardScreenCoords(cardId);
    if (!coords) {
      throw new Error(`Could not find screen coordinates for card ${cardId}`);
    }

    // Double click at card center
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.screenX, y: coords.screenY, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.screenX, y: coords.screenY, button: 'left', clickCount: 1 });
    await this.sleep(60);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.screenX, y: coords.screenY, button: 'left', clickCount: 2 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.screenX, y: coords.screenY, button: 'left', clickCount: 2 });
    await this.sleep(1500);
  }

  /**
   * Configures text, font size, bold weight, and color within the card editor
   */
  async formatCardEditor({ text, fontSize = '30', colorRgb = null, isBold = true }) {
    // 1. Activate Text Mode by clicking "あ" button via DOM selector
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('.textButton') || document.querySelector('.textButtonIconJa')?.closest('.uiButton');
        if (btn) btn.click();
      })()`
    });
    await this.sleep(1000);

    // 2. Click text area to focus and select all to clear
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const t = document.querySelector('textarea.textInput');
        if (t) {
          t.focus();
          t.select();
          document.execCommand('delete');
          t.value = '';
          t.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`
    });
    await this.sleep(400);

    // 3. Insert new text
    await this.send('Input.insertText', { text });
    await this.sleep(600);

    // 4. Set Font Size if specified
    if (fontSize) {
      await this.send('Runtime.evaluate', {
        expression: `(() => {
          const sizeButton = document.querySelector('.textSizeIcon');
          if (sizeButton) sizeButton.click();
        })()`
      });
      await this.sleep(500);

      await this.send('Runtime.evaluate', {
        expression: `(() => {
          const cells = Array.from(document.querySelectorAll('.textSizeDialogCell'));
          const targetCell = cells.find(c => c.innerText.trim() === '${fontSize}');
          if (targetCell) targetCell.click();
        })()`
      });
      await this.sleep(500);
    }

    // 5. Set Bold state
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const boldIcon = document.querySelector('.textBoldIcon');
        const isSelected = boldIcon?.closest('.editorTextToolButton')?.classList.contains('selected') || false;
        if (boldIcon && isSelected !== ${isBold}) {
          boldIcon.click();
        }
      })()`
    });
    await this.sleep(400);

    // 6. Set Color if specified
    if (colorRgb) {
      await this.send('Runtime.evaluate', {
        expression: `(() => {
          const colorIcon = document.querySelector('.textColorIcon');
          if (colorIcon) colorIcon.click();
        })()`
      });
      await this.sleep(500);

      await this.send('Runtime.evaluate', {
        expression: `(() => {
          const pickers = Array.from(document.querySelectorAll('.editorDrawToolColorPicker'));
          const targetPicker = pickers.find(p => p.style.backgroundColor.includes('${colorRgb}'));
          if (targetPicker) targetPicker.click();
        })()`
      });
      await this.sleep(600);
    }
  }

  /**
   * Exits editor safely to return to canvas view
   */
  async returnToCanvas() {
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const backBtn = document.querySelector('.editorButton.uiButton') || document.querySelector('.backButtonIcon')?.closest('.uiButton');
        if (backBtn) backBtn.click();
      })()`
    });
    await this.sleep(1500);
  }

  /**
   * High-level helper: Opens card editor, formats text/style, and returns to canvas
   */
  async editCardText(cardId, { text, fontSize = '30', colorRgb = null, isBold = true }) {
    await this.openCardEditorByDoubleClick(cardId);
    await this.formatCardEditor({ text, fontSize, colorRgb, isBold });
    await this.returnToCanvas();
  }

  /**
   * Sets card text and styles deterministically via official cardEdited command
   * Supports inline **bold** and <red>accent</red> markup.
   */
  async setCardTextAndStyle(cardId, { text, fontSize = 30, forecolor = '#FF000000', isBold = false }) {
    const { cleanText, attributes, attributeRanges } = parseStyledText(text, fontSize, forecolor, isBold);
    const replacement = {
      'gadgets.title.h_alignment': 'left',
      'gadgets.title.v_alignment': 'middle',
      'gadgets.title.vertical': false,
      'gadgets.title.text': cleanText,
      'gadgets.title.attributes': attributes,
      'gadgets.title.attribute_ranges': attributeRanges,
      'gadgets.title.forecolor': forecolor,
      'gadgets.title.font_size': fontSize
    };

    const res = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        let fiber = canvas ? canvas[Object.keys(canvas).find(k => k.startsWith('__reactFiber$'))] : null;
        let depth = 0, manager = null;
        while (fiber && depth < 35) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState && hook.memoizedState.manager) {
              manager = hook.memoizedState.manager;
              break;
            }
            hook = hook.next;
          }
          if (manager) break;
          fiber = fiber.return;
          depth++;
        }
        if (!manager?.context?.onEmitCardCommand) return { error: 'Manager dispatcher not found' };
        manager.context.onEmitCardCommand({
          type: 'cardEdited',
          cardId: '${cardId}',
          replacement: ${JSON.stringify(replacement)}
        });
        return { success: true };
      })()`,
      returnByValue: true
    });

    await this.sleep(300);
    return res.result.value;
  }

  /**
   * Connects two cards using official manager event dispatcher without property injection
   */
  async connectCards(fromId, toId) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        let fiber = canvas ? canvas[Object.keys(canvas).find(k => k.startsWith('__reactFiber$'))] : null;
        let depth = 0, manager = null;
        while (fiber && depth < 35) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState && hook.memoizedState.manager) {
              manager = hook.memoizedState.manager;
              break;
            }
            hook = hook.next;
          }
          if (manager) break;
          fiber = fiber.return;
          depth++;
        }
        if (!manager || !manager.context || !manager.context.onEmitCardCommand) {
          return { error: 'Manager dispatcher not found' };
        }

        manager.context.onEmitCardCommand({
          type: 'connectorConnected',
          fromId: '${fromId}',
          toId: '${toId}',
          asDifferentGroup: false
        });
        return { success: true };
      })()`,
      returnByValue: true
    });

    await this.sleep(1000);
    return result.result.value;
  }

  /**
   * Updates card positions and layout sizes using official cardSizesChanged command
   * @param {Array<{cardId: string, position: {x: number, y: number}, layoutSize: {width: number, height: number}}>} layoutList
   */
  async layoutCards(layoutList) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        let fiber = canvas ? canvas[Object.keys(canvas).find(k => k.startsWith('__reactFiber$'))] : null;
        let depth = 0, manager = null;
        while (fiber && depth < 35) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState && hook.memoizedState.manager) {
              manager = hook.memoizedState.manager;
              break;
            }
            hook = hook.next;
          }
          if (manager) break;
          fiber = fiber.return;
          depth++;
        }
        if (!manager?.context?.onEmitCardCommand) return { error: 'Manager dispatcher not found' };

        manager.context.onEmitCardCommand({
          type: 'cardSizesChanged',
          changes: ${JSON.stringify(layoutList)}
        });
        return { success: true };
      })()`,
      returnByValue: true
    });

    await this.sleep(500);
    return result.result.value;
  }

  /**
   * Submits card chain to target submission box via drag & drop UI
   */
  async submitCardToBox(cardId, boxKeyword) {
    const coords = await this.getCardScreenCoords(cardId);
    if (!coords) {
      throw new Error(`Coordinates for card ${cardId} could not be determined`);
    }

    // Identify exact "提出" button on left toolbar
    const buttonCoords = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const el = all.find(e => e.getAttribute('aria-label') === '提出') ||
                   all.find(e => e.classList?.contains('uploadStatusButton') && (e.innerText || '').trim() === '提出');
        if (!el) return { x: 48, y: 537 };
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2)
        };
      })()`,
      returnByValue: true
    });
    const submitBtnX = buttonCoords.result.value?.x || 48;
    const submitBtnY = buttonCoords.result.value?.y || 537;

    // 1. Perform CDP drag from card center to submit button
    const steps = 25;
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.screenX, y: coords.screenY, button: 'left', clickCount: 1 });
    await this.sleep(150);

    for (let i = 1; i <= steps; i++) {
      const currentX = Math.round(coords.screenX + (submitBtnX - coords.screenX) * (i / steps));
      const currentY = Math.round(coords.screenY + (submitBtnY - coords.screenY) * (i / steps));
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: currentX, y: currentY, button: 'left' });
      await this.sleep(25);
    }

    await this.sleep(200);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: submitBtnX, y: submitBtnY, button: 'left', clickCount: 1 });
    console.log('[submitCardToBox] Drag & drop dispatched. Waiting for modal...');

    // 2. Wait for submission modal to appear (polling up to 10s)
    let modalAppeared = false;
    for (let i = 0; i < 20; i++) {
      const checkModal = await this.send('Runtime.evaluate', {
        expression: `(() => {
          const all = Array.from(document.querySelectorAll('*'));
          return all.some(e => (e.innerText || '').includes('提出先を選択してください') || (e.innerText || '').includes('締め切り済みの提出箱'));
        })()`,
        returnByValue: true
      });
      if (checkModal.result.value) {
        modalAppeared = true;
        break;
      }
      await this.sleep(500);
    }

    if (!modalAppeared) {
      console.warn('[submitCardToBox] Modal did not appear within 10s. Trying secondary check...');
    }

    await this.sleep(1000);

    // 3. Click "締め切り済みの提出箱" if visible
    for (let i = 0; i < 10; i++) {
      const expiredLoc = await this.send('Runtime.evaluate', {
        expression: `(() => {
          const all = Array.from(document.querySelectorAll('*'));
          const el = all.find(e => (e.innerText || '').trim() === '締め切り済みの提出箱' && e.offsetWidth > 0);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
        })()`,
        returnByValue: true
      });

      if (expiredLoc.result.value) {
        const { x, y } = expiredLoc.result.value;
        console.log(`[submitCardToBox] Clicking "締め切り済みの提出箱" at (${x}, ${y})...`);
        await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await this.sleep(2500);
        break;
      }
      await this.sleep(500);
    }

    // 4. Select target box with polling
    for (let i = 0; i < 16; i++) {
      const boxLoc = await this.send('Runtime.evaluate', {
        expression: `(() => {
          const all = Array.from(document.querySelectorAll('*'));
          const el = all.find(e => {
            const text = (e.innerText || '').trim();
            return (text === '${boxKeyword}' || text.startsWith('${boxKeyword}')) && e.offsetWidth > 0 && e.offsetHeight > 0 && e.offsetHeight < 100;
          });
          if (!el) return null;
          const target = el.closest('.roundListItem') || el.closest('.uiButton') || el;
          const rect = target.getBoundingClientRect();
          return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
        })()`,
        returnByValue: true
      });

      if (boxLoc.result.value) {
        const { x, y } = boxLoc.result.value;
        console.log(`[submitCardToBox] Clicking box "${boxKeyword}" at (${x}, ${y})...`);
        await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await this.sleep(2500);
        break;
      }
      await this.sleep(500);
    }

    // 5. Handle confirmation dialogs (up to 2 dialogs with polling)
    for (let attempt = 0; attempt < 3; attempt++) {
      let foundOk = false;
      for (let p = 0; p < 8; p++) {
        const confirmLoc = await this.send('Runtime.evaluate', {
          expression: `(() => {
            const all = Array.from(document.querySelectorAll('*'));
            const btn = all.find(e => (e.innerText || '').trim() === 'OK' && e.offsetWidth > 0 && e.offsetHeight > 0);
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
          })()`,
          returnByValue: true
        });

        if (confirmLoc.result.value) {
          const { x, y } = confirmLoc.result.value;
          console.log(`[submitCardToBox] Confirming dialog OK [attempt ${attempt + 1}] at (${x}, ${y})...`);
          await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
          await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
          await this.sleep(2500);
          foundOk = true;
          break;
        }
        await this.sleep(400);
      }
      if (!foundOk) break;
    }

    await this.sleep(2000);
  }

  /**
   * Builds a full DADS slide with child cards nested, positioned, and connected
   * @param {string} parentCardId - Target parent card UUID
   * @param {string} templateName - One of 12 DADS templates (cover, agenda, timeline, multiPillars, causeOutcome, quoteCallout, bigMetrics, verticalStack, comparison, quadrantMatrix, cycleFlow, summaryFlow)
   * @param {object} templateProps - Parameters for the template
   * @param {string[]} [existingChildIds=[]] - Pre-existing child card IDs to reuse if available
   */
  async buildDadsSlide(parentCardId, templateName, templateProps = {}, existingChildIds = []) {
    const templateFn = SLIDE_TEMPLATES[templateName];
    if (!templateFn) {
      throw new Error(`Unknown DADS template: "${templateName}". Available: ${Object.keys(SLIDE_TEMPLATES).join(', ')}`);
    }

    const { parent, childCards = [], connections = [] } = templateFn(templateProps);

    // 1. Format parent card text and style
    await this.setCardTextAndStyle(parentCardId, {
      text: parent.text,
      fontSize: parent.fontSize || 24,
      forecolor: parent.forecolor || '#FF000000',
      isBold: parent.isBold ?? false
    });

    // 2. Obtain parent card center position
    const parentPos = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const canvas = document.querySelector('canvas');
        let fiber = canvas ? canvas[Object.keys(canvas).find(k => k.startsWith('__reactFiber$'))] : null;
        let depth = 0, note = null;
        while (fiber && depth < 35) {
          let hook = fiber.memoizedState;
          while (hook) {
            if (hook.memoizedState && hook.memoizedState.note) {
              note = hook.memoizedState.note;
              break;
            }
            hook = hook.next;
          }
          if (note) break;
          fiber = fiber.return;
          depth++;
        }
        const card = note?.cardMap?.get('${parentCardId}');
        return card ? { x: card._position.x, y: card._position.y } : { x: 0, y: 0 };
      })()`,
      returnByValue: true
    });
    const { x: px, y: py } = parentPos.result.value || { x: 0, y: 0 };

    // 3. Resolve or create child cards
    const childIds = [...existingChildIds];
    while (childIds.length < childCards.length) {
      const def = childCards[childIds.length];
      const newId = await this.createColorCard(def.color || 'blue');
      await this.nestCard(newId, parentCardId);
      childIds.push(newId);
    }

    // 4. Position and size child cards inside parent card
    const layoutList = childCards.map((def, idx) => {
      const childId = childIds[idx];
      return {
        cardId: childId,
        position: { x: px + def.relX, y: py + def.relY },
        layoutSize: { width: def.width, height: def.height }
      };
    });
    if (layoutList.length > 0) {
      await this.layoutCards(layoutList);
    }

    // 5. Format text for each child card with mathematical lower bound constraint (AHA-099): S_child >= ceil(9/20 * S_parent)
    const parentFontSize = parent.fontSize || 24;
    const minChildFontSize = Math.ceil((parentFontSize * 9) / 20);

    for (let i = 0; i < childCards.length; i++) {
      const def = childCards[i];
      const childId = childIds[i];
      const effectiveFontSize = Math.max(def.fontSize || 15, minChildFontSize);
      await this.setCardTextAndStyle(childId, {
        text: def.label,
        fontSize: effectiveFontSize,
        forecolor: def.forecolor || '#FF000000',
        isBold: def.isBold ?? false
      });
    }

    // 6. Connect child cards via directed connectors
    for (const conn of connections) {
      const fromId = childIds[conn.fromIndex];
      const toId = childIds[conn.toIndex];
      if (fromId && toId) {
        await this.connectCards(fromId, toId);
      }
    }

    return { parentCardId, childIds, templateName };
  }

  /**
   * Backwards compatible helper: applies template to card
   */
  async applyTemplateToCard(cardId, templateName, templateProps = {}) {
    return this.buildDadsSlide(cardId, templateName, templateProps);
  }

  /**
   * Creates a new white card and formats it with a DADS slide template
   */
  async createSlideFromTemplate(templateName, templateProps = {}) {
    const newCardId = await this.createWhiteCard();
    const result = await this.buildDadsSlide(newCardId, templateName, templateProps);
    return result;
  }

  /**
   * Creates a new note, optionally navigating to a specific class first.
   * Optimized with dynamic waitFor and atomic in-page input execution (AHA-102).
   * Reduces latency by over 80% compared to static sleep polling.
   *
   * @param {object} options
   * @param {string} options.noteName - Name of the note to create
   * @param {string} [options.className] - Optional target class name
   * @returns {Promise<{ success: boolean, noteName: string, className?: string, title: string, url: string, elapsedMs: number }>}
   */
  async createNote({ noteName, className = null }) {
    if (!noteName) {
      throw new Error('noteName is required to create a note');
    }
    const startTime = Date.now();

    // 1. If currently inside a canvas, return to note list via back button and wait for list header
    const isCanvas = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const backBtn = document.querySelector('.desktopBackButton');
        return !!backBtn && !document.querySelector('.navHeaderNote');
      })()`,
      returnByValue: true
    });
    if (isCanvas.result.value) {
      await this.send('Runtime.evaluate', {
        expression: `document.querySelector('.desktopBackButton')?.click()`
      });
      await this.waitFor(`document.querySelector('.navHeaderNote')`, { timeoutMs: 4000 });
    }

    // 2. If className is provided, switch to that class and dynamically wait for title update
    if (className) {
      const switchResult = await this.send('Runtime.evaluate', {
        expression: `(() => {
          const items = Array.from(document.querySelectorAll('.courseListItem'));
          const target = items.find(e => (e.innerText || '').trim() === '${className}');
          if (target) {
            target.click();
            return { found: true };
          }
          return { found: false };
        })()`,
        returnByValue: true
      });
      if (switchResult.result.value?.found) {
        await this.waitFor(`document.title.includes('${className}')`, { timeoutMs: 4000 });
      }
    }

    // 3. Click "新しいノートを作る" button in the note header and wait for dialog input
    const clickCreateResult = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const header = document.querySelector('.navHeaderNote');
        const btn = header
          ? Array.from(header.querySelectorAll('.uiButton')).find(e => (e.innerText || '').includes('新しいノートを作る'))
          : Array.from(document.querySelectorAll('.navCreateButton')).find(e => (e.innerText || '').includes('新しいノートを作る'));
        if (btn) {
          btn.click();
          return { clicked: true };
        }
        return { clicked: false, error: '新しいノートを作る button not found' };
      })()`,
      returnByValue: true
    });
    if (!clickCreateResult.result.value?.clicked) {
      throw new Error(`Failed to click "新しいノートを作る": ${clickCreateResult.result.value?.error}`);
    }
    await this.waitFor(`document.querySelector('input.uiInputText')`, { timeoutMs: 3000 });

    // 4. In-Page Atomic Execution: set input value via prototype setter & click OK in a single round-trip
    const atomicSubmitResult = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('input.uiInputText');
        if (!input) return { error: 'input not found' };

        // React controlled component value setter
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(input, '${noteName}');
        } else {
          input.value = '${noteName}';
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        const btns = Array.from(document.querySelectorAll('.uiDialogButton'));
        const okBtn = btns.find(b => (b.innerText || '').trim() === 'OK');
        if (!okBtn) return { error: 'OK button not found' };
        okBtn.click();
        return { success: true };
      })()`,
      returnByValue: true
    });
    if (atomicSubmitResult.result.value?.error) {
      throw new Error(`Failed to submit note name dialog: ${atomicSubmitResult.result.value.error}`);
    }

    // 5. Dynamically wait for canvas to mount and title to reflect noteName
    await this.waitFor(`document.querySelector('canvas') && document.title.includes('${noteName}')`, { timeoutMs: 8000 });

    const titleRes = await this.send('Runtime.evaluate', { expression: 'document.title' });
    const urlRes = await this.send('Runtime.evaluate', { expression: 'location.href' });
    const elapsedMs = Date.now() - startTime;

    return {
      success: true,
      noteName,
      className: className || undefined,
      title: titleRes.result.value,
      url: urlRes.result.value,
      elapsedMs
    };
  }
}
