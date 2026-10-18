/**
 * デジタル庁デザインシステム（DADS: Digital Agency Design System）準拠
 * 全ビジュアル・ダイアグラム対応 スライド＆カードインカード テンプレートエンジン
 * 
 * 公式仕様: https://design.digital.go.jp/dads/
 * - アクセシビリティファースト (WCAG 2.1 AA 準拠, コントラスト比 4.5:1 以上)
 * - 純白背景原則 (しろいろ #FFFFFFFF)
 * - テキスト内アスキーアート矢印・枠線の完全排除 (ネイティブカード連結・カード内包へ全移行)
 * - カード全体の一括太字・赤字を排除し、文章内のインライン装飾 (**太字**, <red>赤字</red>) を採用
 * - 解説用カードサイズ・文字サイズの最適化（幅110〜200px, 17〜18pt）
 * - 150文字以内厳格順守 (validateCharCount)
 */

export const DADS_TOKENS = {
  colors: {
    bgWhite: '#FFFFFFFF',         // 純白 (基準背景)
    textBlack: '#FF000000',       // コントラスト比 21:1
    textGray900: '#FF1A1A1A',     // Solid Gray 900
    primaryBlue: '#FF003366',     // DADS Blue-900 (コントラスト比 9.5:1)
    accentRed: '#FFC00000',       // Red-800 / 強調・結論 (コントラスト比 5.8:1)
    successGreen: '#FF006633',    // Green-800 (コントラスト比 5.2:1)
    warningOrange: '#FFB34700',   // Orange-800 (コントラスト比 4.7:1)
  },
  
  // 子カードパレット色名 (ロイロノート公式ツールバー aria-label に完全対応)
  cardColors: {
    blue: 'あおいろ',
    lightBlue: 'うすあおいろ',
    darkBlue: '濃いあおいろ',
    green: 'みどりいろ',
    lightGreen: 'うすみどりいろ',
    yellow: 'きいろ',
    lightYellow: 'うすきいろ',
    red: 'あかいろ',
    pink: 'ピンクいろ',
    white: 'しろいろ'
  },

  typography: {
    fontFamily: "'Noto Sans JP', sans-serif",
    sizes: {
      display: 40,
      title: 30,
      headline: 24,
      body: 20,
      badge: 18,
      caption: 16,
    }
  },

  constraints: {
    maxCharactersPerCard: 150,
  }
};

/**
 * 150文字以内厳守バリデータ
 */
export function validateCharCount(text, templateName) {
  const cleanText = text.trim();
  // マークダウン装飾タグを除いた実質テキスト長で判定
  const textWithoutTags = cleanText.replace(/(\*\*|<red>|<\/red>)/g, '');
  if (textWithoutTags.length > DADS_TOKENS.constraints.maxCharactersPerCard) {
    console.warn(`[DADS 警告] "${templateName}" の文字数が150字を超過 (${textWithoutTags.length}字)。150字以内に自動調整します。`);
    return cleanText.slice(0, 147) + '...';
  }
  return cleanText;
}

/**
 * 子カード文字サイズ検証・保証関数
 */
export function validateChildFontSize(requestedSize, parentBodySize = DADS_TOKENS.typography.sizes.headline) {
  const minAllowedSize = Math.ceil((parentBodySize * 9) / 20);
  if (requestedSize < minAllowedSize) {
    return minAllowedSize;
  }
  return requestedSize;
}

/**
 * DADS 全ビジュアル対応 テンプレート集 (12種類)
 * 各テンプレートは親カード情報(parent)と、内包される子カード群(childCards)、および子カード間コネクタ(connections)を返す。
 */
export const SLIDE_TEMPLATES = {
  /**
   * 1. 表紙 / カバー (Hero Cover) - タイトルバッジ＋作成者バッジ
   */
  cover: ({ title = 'プレゼンテーションタイトル', subtitle = 'サブタイトル・テーマ概要', author = '発表者', date = '2026年' }) => {
    const parentText = `■ ${title}\n― ${subtitle} ―\n\n\n\n\n[概要] プレゼンテーションの概要。DADS原則準拠。`;
    return {
      templateType: 'cover',
      parent: {
        text: validateCharCount(parentText, 'cover'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: '主要テーマ', color: 'blue', relX: -120, relY: 5, width: 200, height: 95, fontSize: 18 },
        { label: `${author}\n${date}`, color: 'lightBlue', relX: 120, relY: 5, width: 200, height: 95, fontSize: 18 }
      ],
      connections: []
    };
  },

  /**
   * 2. アジェンダ・ステップフロー (Step Flow) - 4ステップ解説カード (基準面積比 1.40倍: 128x120px)
   */
  agenda: ({ title = '目次と進行ステップ', subtitle = '4段階の構成プロセス', steps = ['01 導入', '02 現状分析', '03 提案施策', '04 まとめ'], summary = '全体の進行ステップを段階的に辿り、論点を整理する。' }) => {
    const parentText = `【${title}】\n副題: ${subtitle}\n\n\n\n\n\n[解説] ${summary}`;
    return {
      templateType: 'agenda',
      parent: {
        text: validateCharCount(parentText, 'agenda'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: steps[0], color: 'blue', relX: -195, relY: -10, width: 128, height: 120, fontSize: 19, isBold: true },
        { label: steps[1], color: 'green', relX: -65, relY: -10, width: 128, height: 120, fontSize: 19, isBold: true },
        { label: steps[2], color: 'yellow', relX: 65, relY: -10, width: 128, height: 120, fontSize: 19, isBold: true },
        { label: steps[3], color: 'red', relX: 195, relY: -10, width: 128, height: 120, fontSize: 19, isBold: true }
      ],
      connections: [
        { fromIndex: 0, toIndex: 1 },
        { fromIndex: 1, toIndex: 2 },
        { fromIndex: 2, toIndex: 3 }
      ]
    };
  },

  /**
   * 3. タイムライン・段階区分 (Timeline Flow) - 4段階解説カード (基準面積比 1.40倍: 128x120px)
   */
  timeline: ({ title = 'タイムラインと経緯', subtitle = '主要な4つのフェーズ', periods = ['フェーズ1', 'フェーズ2', 'フェーズ3', 'フェーズ4'], summary = '各段階の変遷と重要なマイルストーンを整理。' }) => {
    const parentText = `【${title}】\n副題: ${subtitle}\n\n\n\n\n\n[解説] ${summary}`;
    return {
      templateType: 'timeline',
      parent: {
        text: validateCharCount(parentText, 'timeline'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: periods[0], color: 'blue', relX: -195, relY: -10, width: 128, height: 120, fontSize: 19, isBold: true },
        { label: periods[1], color: 'green', relX: -65, relY: -10, width: 128, height: 120, fontSize: 19, isBold: true },
        { label: periods[2], color: 'yellow', relX: 65, relY: -10, width: 128, height: 120, fontSize: 19, isBold: true },
        { label: periods[3], color: 'pink', relX: 195, relY: -10, width: 128, height: 120, fontSize: 19, isBold: true }
      ],
      connections: [
        { fromIndex: 0, toIndex: 1 },
        { fromIndex: 1, toIndex: 2 },
        { fromIndex: 2, toIndex: 3 }
      ]
    };
  },

  /**
   * 4. 制度の3本柱 (Three Pillars / Multi-Pillars) - 3本柱解説カード (基準面積比 1.40倍: 170x125px)
   */
  multiPillars: ({ title = '基本方針の3本柱', subtitle = '主要な3つの柱と構成要素', pillars = [
    { name: '方針A', detail: '基本方針の詳細' },
    { name: '方針B', detail: '重要事項の詳細' },
    { name: '方針C', detail: '運用方法の詳細' }
  ], summary = '3つの柱を明確にし、施策の全体像と役割を整理。' }) => {
    const parentText = `【${title}】\n副題: ${subtitle}\n\n\n\n\n\n[統括] ${summary}`;
    return {
      templateType: 'multiPillars',
      parent: {
        text: validateCharCount(parentText, 'multiPillars'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: `${pillars[0].name}\n(${pillars[0].detail})`, color: 'blue', relX: -180, relY: -10, width: 170, height: 125, fontSize: 21, isBold: true },
        { label: `${pillars[1].name}\n(${pillars[1].detail})`, color: 'green', relX: 0, relY: -10, width: 170, height: 125, fontSize: 21, isBold: true },
        { label: `${pillars[2].name}\n(${pillars[2].detail})`, color: 'yellow', relX: 180, relY: -10, width: 170, height: 125, fontSize: 21, isBold: true }
      ],
      connections: []
    };
  },

  /**
   * 5. 因果チェーン・課題解決 (Cause-Action-Outcome Flow) - 非対称適応型 (結果カードを最大強調)
   */
  causeOutcome: ({ crisisTitle = '課題解決のプロセス', subtitle = '課題の特定から成果への展開', crisis = '課題: 現状のボトルネック', action = '施策: 改善策の実行', outcome = '成果: 期待される効果', summary = '課題の根本原因に対策を講じ、目的の成果を達成する。' }) => {
    const parentText = `【${crisisTitle}】\n副題: ${subtitle}\n\n\n\n\n\n[解説] ${summary}`;
    return {
      templateType: 'causeOutcome',
      parent: {
        text: validateCharCount(parentText, 'causeOutcome'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      // 危機(起点) -> 行動(展開) -> 結果(結末) に応じてカード寸法とフォントサイズを動的に拡大適応
      childCards: [
        { label: crisis, color: 'red', relX: -185, relY: -10, width: 162, height: 122, fontSize: 20, isBold: true },
        { label: action, color: 'yellow', relX: -3, relY: -10, width: 168, height: 124, fontSize: 20, isBold: true },
        { label: outcome, color: 'green', relX: 185, relY: -10, width: 185, height: 130, fontSize: 22, isBold: true }
      ],
      connections: [
        { fromIndex: 0, toIndex: 1 },
        { fromIndex: 1, toIndex: 2 }
      ]
    };
  },

  /**
   * 6. 重要メッセージ・引用コールアウト (Quote Callout) - 発言者＋宣言連結
   */
  quoteCallout: ({ title = '重要メッセージ・引用', speaker = '提唱者 / 出典', quote = '重要なメッセージや\n核となる理念', summary = '基本理念を明確にし、行動規範としての共通理解を促す。' }) => {
    const parentText = `【${title}】\n副題: コアバリューと理念の共有\n\n\n\n\n[意義] ${summary}`;
    return {
      templateType: 'quoteCallout',
      parent: {
        text: validateCharCount(parentText, 'quoteCallout'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: `発言者\n${speaker}`, color: 'blue', relX: -130, relY: 5, width: 170, height: 90, fontSize: 17 },
        { label: `『${quote}』`, color: 'lightGreen', relX: 110, relY: 5, width: 220, height: 90, fontSize: 17 }
      ],
      connections: [
        { fromIndex: 0, toIndex: 1 }
      ]
    };
  },

  /**
   * 7. メトリクス・重要数値バッジ (Metrics / Big Number) - 強調バッジ＋施策
   */
  bigMetrics: ({ title = '主要指標と達成目標', metric = '98.5%', metricLabel = '達成率・改善率', policy = '施策名\n重点アクション', summary = '目標指標を明確に定め、重点施策を集中展開する。' }) => {
    const parentText = `【${title}】\n副題: 重要KPIの可視化とアクション\n\n\n\n\n[解説] ${summary}`;
    return {
      templateType: 'bigMetrics',
      parent: {
        text: validateCharCount(parentText, 'bigMetrics'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: `◆ ${metric} ◆\n(${metricLabel})`, color: 'red', relX: -125, relY: 5, width: 190, height: 95, fontSize: 18 },
        { label: `重点施策\n${policy}`, color: 'blue', relX: 125, relY: 5, width: 190, height: 95, fontSize: 18 }
      ],
      connections: []
    };
  },

  /**
   * 8. 垂直論理スタック (Vertical Stack Flow) - 長文・論理縦積み 3層
   */
  verticalStack: ({ title = '階層構造と論理スタック', levels = [
    { layer: '上層：目的・戦略', leader: 'ビジョン' },
    { layer: '中層：施策・方針', leader: 'プロセス' },
    { layer: '下層：基盤・運用', leader: 'システム' }
  ], summary = '目的から基盤までを多層構造で整理し、論理的な一貫性を担保する。' }) => {
    const parentText = `【${title}】\n副題: 階層的な構造化と役割分担\n\n\n\n\n[統括] ${summary}`;
    return {
      templateType: 'verticalStack',
      parent: {
        text: validateCharCount(parentText, 'verticalStack'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: `${levels[0].layer} (${levels[0].leader})`, color: 'blue', relX: 0, relY: -75, width: 320, height: 65, fontSize: 16 },
        { label: `${levels[1].layer} (${levels[1].leader})`, color: 'green', relX: 0, relY: 5, width: 320, height: 65, fontSize: 16 },
        { label: `${levels[2].layer} (${levels[2].leader})`, color: 'yellow', relX: 0, relY: 85, width: 320, height: 65, fontSize: 16 }
      ],
      connections: [
        { fromIndex: 0, toIndex: 1 },
        { fromIndex: 1, toIndex: 2 }
      ]
    };
  },

  /**
   * 9. 2項目対比マトリクス (2-Column Comparison) - 左右並列ギャラリー
   */
  comparison: ({ title = '2つのアプローチの対比', modelA = 'アプローチA\n・特徴1\n・メリット1', modelB = 'アプローチB\n・特徴2\n・メリット2', summary = '双方の特性やトレードオフを比較検討し、最適な選択を導く。' }) => {
    const parentText = `【${title}】\n副題: 2つのモデルの特性比較と選択基準\n\n\n\n\n[評価] ${summary}`;
    return {
      templateType: 'comparison',
      parent: {
        text: validateCharCount(parentText, 'comparison'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: modelA, color: 'blue', relX: -135, relY: 5, width: 220, height: 105, fontSize: 17 },
        { label: modelB, color: 'orange', relX: 135, relY: 5, width: 220, height: 105, fontSize: 17 }
      ],
      connections: []
    };
  },

  /**
   * 10. 2x2 マトリクス・4象限 (2x2 Quadrant Matrix) - 4象限グリッド
   */
  quadrantMatrix: ({ title = 'マトリクス分析 (2x2)', q1 = '高重要×高緊急\n(最優先施策)', q2 = '高重要×低緊急\n(計画的推進)', q3 = '低重要×高緊急\n(効率的対応)', q4 = '低重要×低緊急\n(見直し・削減)', summary = '2軸の評価軸により対象を構造的に分類・可視化する。' }) => {
    const parentText = `【${title}】\n副題: 2軸による分類と優先順位付け\n\n\n\n\n[分析] ${summary}`;
    return {
      templateType: 'quadrantMatrix',
      parent: {
        text: validateCharCount(parentText, 'quadrantMatrix'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: q1, color: 'red', relX: -125, relY: -45, width: 190, height: 80, fontSize: 16 },
        { label: q2, color: 'green', relX: 125, relY: -45, width: 190, height: 80, fontSize: 16 },
        { label: q3, color: 'blue', relX: -125, relY: 55, width: 190, height: 80, fontSize: 16 },
        { label: q4, color: 'yellow', relX: 125, relY: 55, width: 190, height: 80, fontSize: 16 }
      ],
      connections: []
    };
  },

  /**
   * 11. 循環サイクル (Cycle / Continuous Loop) - 循環ループ 4要素
   */
  cycleFlow: ({ title = '改善サイクル (PDCA)', phases = ['Plan (計画)', 'Do (実行)', 'Check (評価)', 'Action (改善)'], summary = '継続的な検証と改善のサイクルを回し、品質向上を図る。' }) => {
    const parentText = `【${title}】\n副題: 継続的改善プロセスの推進\n\n\n\n\n[総括] ${summary}`;
    return {
      templateType: 'cycleFlow',
      parent: {
        text: validateCharCount(parentText, 'cycleFlow'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      childCards: [
        { label: phases[0], color: 'blue', relX: -180, relY: 5, width: 110, height: 80, fontSize: 17 },
        { label: phases[1], color: 'green', relX: -60, relY: 5, width: 110, height: 80, fontSize: 17 },
        { label: phases[2], color: 'yellow', relX: 60, relY: 5, width: 110, height: 80, fontSize: 17 },
        { label: phases[3], color: 'red', relX: 180, relY: 5, width: 110, height: 80, fontSize: 17 }
      ],
      connections: [
        { fromIndex: 0, toIndex: 1 },
        { fromIndex: 1, toIndex: 2 },
        { fromIndex: 2, toIndex: 3 },
        { fromIndex: 3, toIndex: 0 }
      ]
    };
  },

  /**
   * 12. 総括・結論強調フロー (Executive Summary Flow) - エグゼクティブ主役型 (結論カードを最大強調)
   */
  summaryFlow: ({ title = '全体の総括と提言', subtitle = '考察と今後の展望', steps = ['現状分析', '課題抽出', '解決策提言'], conclusion = '施策の着実な推進により目的を達成する。', closing = '継続的な取り組みが持続的成果をもたらす。' }) => {
    const parentText = `【${title}】\n副題: ${subtitle}\n\n\n\n\n\n[結論] ${conclusion} ※${closing}`;
    return {
      templateType: 'summaryFlow',
      parent: {
        text: validateCharCount(parentText, 'summaryFlow'),
        fontSize: DADS_TOKENS.typography.sizes.headline,
        forecolor: DADS_TOKENS.colors.textBlack,
        isBold: false,
        cardColor: 'white'
      },
      // 前提2枚はコンパクトに整え、最終結論カード(赤)を横幅205px・フォント23ptで主役化
      childCards: [
        { label: steps[0], color: 'blue', relX: -186, relY: -10, width: 155, height: 118, fontSize: 19, isBold: true },
        { label: steps[1], color: 'yellow', relX: -20, relY: -10, width: 155, height: 118, fontSize: 19, isBold: true },
        { label: steps[2], color: 'red', relX: 172, relY: -10, width: 205, height: 134, fontSize: 23, isBold: true }
      ],
      connections: [
        { fromIndex: 0, toIndex: 1 },
        { fromIndex: 1, toIndex: 2 }
      ]
    };
  }
};
