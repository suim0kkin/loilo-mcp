import { LoiloClient } from '../src/loilo_client.mjs';

async function main() {
  const client = new LoiloClient();
  await client.connect();
  console.log('[LoiLo MCP] Connected to LoiLoNote CDP session on port 9222');

  // スライド定義 (DADS準拠・150字以内・カードインカード)
  const slides = [
    {
      title: 'Slide 1: multiPillars (構造と3本柱)',
      template: 'multiPillars',
      props: {
        title: '01 いじめの構造と防止の3本柱',
        subtitle: '個人の問題ではなく集団の力学として捉える',
        pillars: [
          { name: '【構造の理解】\n4層構造の把握', detail: '被害・加害・観衆・傍観' },
          { name: '【早期の察知】\n日常の微細な兆候', detail: '出欠・表情・孤立の検知' },
          { name: '【組織的対応】\n一人で抱えない体制', detail: '迅速な情報共有とチーム支援' }
        ],
        summary: 'いじめは傍観者を含む集団現象。**早期察知**と<red>組織的連携</red>により深刻化を未然に防ぐ。'
      }
    },
    {
      title: 'Slide 2: agenda (4段階アクション)',
      template: 'agenda',
      props: {
        title: '02 いじめ根絶の4段階アクション',
        subtitle: '兆候の察知から再発防止までの確実なプロセス',
        steps: [
          '① 兆候察知\n変化を見逃さない\n(出欠・交友・言動)',
          '② 安全確保\n被害生徒の保護\n(安心・秘密の厳守)',
          '③ 迅速介入\n組織で事実確認\n(指導と環境改善)',
          '④ 継続ケア\n関係性の再構築\n(再発防止と見守り)'
        ],
        summary: '違和感の察知から**安全確保・事実確認**、そして<red>継続的ケア</red>まで確実につなぐ。'
      }
    },
    {
      title: 'Slide 3: summaryFlow (文化醸成と総括)',
      template: 'summaryFlow',
      props: {
        title: '03 誰も孤立させない集団づくり',
        subtitle: '傍観者を脱し「心理的安全性」を育む文化へ',
        steps: [
          '【傍観者の脱却】\n見て見ぬふりを止め\n小さなSOSを届ける',
          '【対話と相互承認】\n違いを認め合い\n弱音を吐ける場を作る',
          '【いじめゼロへ】\n誰一人孤立させない\n安全な居場所の確立'
        ],
        conclusion: '傍観者をゼロにし、互いを承認する**心理的安全性**の確立が最善の抑止力となる。',
        closing: '「見逃さない・許さない・孤立させない」学校・社会全体で<red>いじめゼロ</red>を実現する。'
      }
    }
  ];

  // 1. 既存のカードが存在する場合はクリーンアップ
  console.log('1. Checking existing canvas cards...');
  const state = await client.getCanvasState();
  const parentCards = state.cards.filter(c => !c.parent);
  if (parentCards.length > 0) {
    console.log(`   Cleaning up ${parentCards.length} existing cards...`);
    for (const pc of parentCards) {
      await client.deleteCard(pc.id);
    }
    await client.sleep(500);
  }

  // 2. 親カード3枚を作成 (Parent-First Layout: AHA-104)
  console.log('2. Creating 3 parent cards...');
  const parentCardIds = [];
  for (let i = 0; i < slides.length; i++) {
    const cardId = await client.createWhiteCard();
    parentCardIds.push(cardId);
    console.log(`   Created Parent ${i + 1}: ${cardId}`);
  }

  // 3. 親カードを水平にレイアウト配置 (600x410, spacing: 120)
  console.log('3. Laying out parent cards horizontally...');
  const cardWidth = 600;
  const cardHeight = 410;
  const spacing = 120;
  const totalCards = slides.length;
  const startX = -Math.floor((totalCards - 1) / 2) * (cardWidth + spacing);

  const parentLayout = parentCardIds.map((cardId, idx) => ({
    cardId,
    position: { x: startX + idx * (cardWidth + spacing), y: 0 },
    layoutSize: { width: cardWidth, height: cardHeight }
  }));
  await client.layoutCards(parentLayout);

  // 4. 各スライドの内部を構築 (カードインカード + インライン強調)
  console.log('4. Building nested slide contents...');
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const parentId = parentCardIds[i];
    console.log(`   Building ${slide.title} (Parent: ${parentId})...`);
    await client.buildDadsSlide(parentId, slide.template, slide.props);
  }

  // 5. 親カード間を有向矢印コネクタで連結 (Slide 1 -> Slide 2 -> Slide 3)
  console.log('5. Connecting parent slides with directed connectors...');
  for (let i = 0; i < parentCardIds.length - 1; i++) {
    await client.connectCards(parentCardIds[i], parentCardIds[i + 1]);
    console.log(`   Connected Slide ${i + 1} -> Slide ${i + 2}`);
  }

  // 6. ズームフィット
  console.log('6. Fitting zoom...');
  await client.zoomFit();
  await client.sleep(1200);

  // 7. スクリーンショット撮影 (WebP高効率保存)
  const screenshotPath = './anti_bullying_3cards.webp';
  await client.takeScreenshot(screenshotPath);
  console.log(`[Success] 3 Cards created and connected! Screenshot saved to: ${screenshotPath}`);

  // 8. 最終キャンバス状態の検証
  const finalState = await client.getCanvasState();
  console.log('Canvas State Summary:');
  console.log(`- Total Cards: ${finalState.cardCount}`);
  console.log(`- Parent Cards: ${finalState.cards.filter(c => !c.parent).length}`);
  console.log(`- Child Cards: ${finalState.cards.filter(c => !!c.parent).length}`);
  console.log(`- Connectors: ${finalState.connectors?.length || 0}`);

  client.close();
}

main().catch(err => {
  console.error('[Error in anti-bullying cards creation]', err);
  process.exit(1);
});
