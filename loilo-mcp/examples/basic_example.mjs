import { LoiloClient } from '../src/loilo_client.mjs';

async function main() {
  const client = new LoiloClient();
  await client.connect();
  console.log('[Python Intro] Connected to LoiLoNote CDP');

  // Slide 1: multiPillars (基本構造・3大特徴)
  console.log('1. Creating Slide 1 (multiPillars)...');
  const slide1 = await client.createSlideFromTemplate('multiPillars', {
    title: '01 Pythonの基本構文',
    pillars: [
      { name: '簡潔な記法', detail: '可読性を最優先' },
      { name: 'インデント', detail: 'ブロックを表現' },
      { name: '動的型付け', detail: '柔軟な開発' }
    ],
    summary: '初学者にも直観的で学びやすい構文設計。インデントによるブロック構造が最大の特徴。'
  });
  console.log('   Slide 1 created:', slide1.cardId);

  // Slide 2: timeline (制御フロー・4ステップ)
  console.log('2. Creating Slide 2 (timeline)...');
  const slide2 = await client.createSlideFromTemplate('timeline', {
    title: '02 処理の流れと制御構文',
    subtitle: '順次実行から条件判断・反復処理へ',
    periods: ['変数・代入', '条件分岐 if', '反復 for/while', 'リスト・辞書'],
    summary: '順次・分岐・反復の3大基本制御を組み合わせ、柔軟なアルゴリズムを組み立てる。'
  });
  console.log('   Slide 2 created:', slide2.cardId);

  // Slide 3: summaryFlow (関数・モジュール・総括)
  console.log('3. Creating Slide 3 (summaryFlow)...');
  const slide3 = await client.createSlideFromTemplate('summaryFlow', {
    title: '03 関数定義とモジュール活用',
    steps: ['def 関数化', '引数と返り値', 'モジュール'],
    conclusion: '処理の部品化とライブラリ活用がPythonの真骨頂。',
    closing: 'AI・データ分析・Web開発まで世界標準の言語エコシステム。'
  });
  console.log('   Slide 3 created:', slide3.cardId);

  // 4. 水平レイアウト配置
  console.log('4. Arranging slides horizontally...');
  const cardWidth = 520;
  const cardHeight = 350;
  const spacing = 140;
  
  await client.layoutCards([
    {
      cardId: slide1.cardId,
      position: { x: -(cardWidth + spacing), y: 0 },
      layoutSize: { width: cardWidth, height: cardHeight }
    },
    {
      cardId: slide2.cardId,
      position: { x: 0, y: 0 },
      layoutSize: { width: cardWidth, height: cardHeight }
    },
    {
      cardId: slide3.cardId,
      position: { x: (cardWidth + spacing), y: 0 },
      layoutSize: { width: cardWidth, height: cardHeight }
    }
  ]);

  // 5. カード間コネクタ連結 (Slide 1 -> Slide 2 -> Slide 3)
  console.log('5. Connecting cards with directed connectors...');
  await client.connectCards(slide1.cardId, slide2.cardId);
  await client.connectCards(slide2.cardId, slide3.cardId);

  // 6. Viewport Zoom Fit
  console.log('6. Fitting zoom...');
  await client.zoomFit();

  // 7. スクリーンショット撮影
  const screenshotPath = await client.takeScreenshot('./screenshot.webp');
  console.log(`[Success] Cards created and connected! Screenshot: ${screenshotPath}`);

  // キャンバス状態の確認
  const finalState = await client.getCanvasState();
  console.log('Final Canvas State:', JSON.stringify(finalState, null, 2));

  client.close();
}

main().catch(err => {
  console.error('[Error]', err);
  process.exit(1);
});
