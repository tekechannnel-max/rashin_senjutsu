const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('playwright');
const { birthdayMiniFamilyForDay } = require('./birthday-mini-family');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTH = 1080;
const HEIGHT = 1350;
const QUALITY = 92;
const INSTAGRAM_ROOT = path.join(ROOT, 'images', 'social', 'instagram');
const OUT_DIR = path.join(INSTAGRAM_ROOT, '【インスタ】あるある・ランキング系');
const MINI_ROOT = path.join(INSTAGRAM_ROOT, 'birthday-mini');

const DATA_URL_CACHE = new Map();

const CLASSIFICATION_PRESETS = [
  {
    filename: 'idol-style-4class.jpg',
    kind: 'アイドル分類',
    title: 'アイドルになったら大体こんな感じ',
    topQuestion: 'あなたは何日生まれ？',
    theme: 'idol',
    accent: '#b83e5a',
    rows: [
      {
        no: '①',
        title: 'センター・カリスマ型',
        days: [1, 8, 10, 17, 19, 22, 26, 28],
        daysText: '1日・8日・10日・17日・19日・22日・26日・28日',
        copy: 'グループの顔、エース、リーダー候補。華・存在感・勝負強さで目立つタイプです。',
      },
      {
        no: '②',
        title: '愛されファンサ型',
        days: [2, 3, 6, 12, 15, 20, 21, 24, 30],
        daysText: '2日・3日・6日・12日・15日・20日・21日・24日・30日',
        copy: 'ファン対応が強い、可愛い、親しみやすいタイプです。握手会・配信・SNSで人気が出やすいです。',
      },
      {
        no: '③',
        title: '世界観・沼らせ型',
        days: [7, 9, 11, 16, 18, 25, 27, 29],
        daysText: '7日・9日・11日・16日・18日・25日・27日・29日',
        copy: 'ミステリアス、儚い、独特な雰囲気で刺さるタイプです。コアファンを深く沼らせます。',
      },
      {
        no: '④',
        title: '職人・クセ強パフォーマー型',
        days: [4, 5, 13, 14, 23, 31],
        daysText: '4日・5日・13日・14日・23日・31日',
        copy: 'ダンス・歌・バラエティ・キャラ立ちで勝負するタイプです。最初はクセ強、後から評価されやすいです。',
      },
    ],
  },
  {
    filename: 'love-style-4class.jpg',
    kind: '恋愛スタイル',
    title: '恋愛スタイル4分類',
    topQuestion: 'あなたは何日生まれ？',
    theme: 'love',
    accent: '#c54f78',
    rows: [
      {
        no: '①',
        title: '追いかける主導権型',
        days: [1, 8, 10, 17, 19, 22, 26, 28],
        daysText: '1日・8日・10日・17日・19日・22日・26日・28日',
        copy: '好きになったら自分から動く。恋愛でも主導権を握りやすいタイプです。',
      },
      {
        no: '②',
        title: '愛されたい・尽くしたい型',
        days: [2, 6, 11, 15, 20, 24, 29],
        daysText: '2日・6日・11日・15日・20日・24日・29日',
        copy: '愛情深く、相手との距離感や気持ちのつながりを大事にするタイプです。',
      },
      {
        no: '③',
        title: 'ときめき・自由恋愛型',
        days: [3, 5, 12, 14, 21, 23, 30],
        daysText: '3日・5日・12日・14日・21日・23日・30日',
        copy: '楽しさ、刺激、会話のテンポを重視します。束縛されると冷めやすいタイプです。',
      },
      {
        no: '④',
        title: '慎重・深愛・内面重視型',
        days: [4, 7, 9, 13, 16, 18, 25, 27, 31],
        daysText: '4日・7日・9日・13日・16日・18日・25日・27日・31日',
        copy: 'すぐには心を開かないけれど、本気になると深く長く愛するタイプです。',
      },
    ],
  },
];

const RANKING_PRESETS = [
  {
    filename: 'amae-jouzu-top5.jpg',
    title: '甘え上手ランキングtop5',
    kind: 'ランキング',
    theme: 'amae',
    accent: '#c54f78',
    rows: [
      {
        rank: 1,
        day: 2,
        type: '素直に頼れる甘え上手',
        note: '数秘2は、受け取る力・寄り添う力が強い数字です。「お願いしてもいい？」が自然に言えるタイプです。',
      },
      {
        rank: 2,
        day: 6,
        type: '愛され上手な甘えん坊',
        note: '数秘6は、愛情・可愛げ・家庭的な魅力の数字です。甘えることで相手の庇護欲をくすぐりやすいです。',
      },
      {
        rank: 3,
        day: 15,
        type: '色気で甘えるタイプ',
        note: '1＋5＝6なので、6の愛され力があります。さらに15日は恋愛感が強く、甘え方に少し色気が出やすいです。',
      },
      {
        rank: 4,
        day: 3,
        type: '明るく懐くタイプ',
        note: '数秘3は、無邪気さ・明るさ・表現力の数字です。重くならず、可愛く甘えられるタイプです。',
      },
      {
        rank: 5,
        day: 20,
        type: '控えめに頼るタイプ',
        note: '2の要素が強く、相手の空気を見ながら甘えます。ガツガツせず、そっと寄り添う甘え方が得意です。',
      },
    ],
  },
  {
    filename: 'buchigire-kowai-top5.jpg',
    title: 'ブチギレると怖い生まれ日TOP5はこちらです。',
    subtitle: '数秘術の象意ベースで、怒った時の圧・爆発力・言葉の鋭さ・執念深さで見ています。',
    kind: 'ランキング',
    theme: 'anger',
    accent: '#b83e5a',
    rows: [
      {
        rank: 1,
        day: 8,
        type: '圧で黙らせるタイプ',
        note: '数秘8は、力・支配・勝負の数字です。怒ると空気が一気に重くなり、「逆らったら終わる感」が出ます。',
      },
      {
        rank: 2,
        day: 1,
        type: '真っ向から叩き潰すタイプ',
        note: '数秘1は、プライドと突破力の数字です。舐められたり否定されたりすると、真正面から強い言葉で返します。',
      },
      {
        rank: 3,
        day: 16,
        type: '静かに核心を刺すタイプ',
        note: '1＋6＝7で、分析力が強い日です。感情的に怒鳴るより、相手の痛いところを冷静に突く怖さがあります。',
      },
      {
        rank: 4,
        day: 22,
        type: 'スケール大きめに怒るタイプ',
        note: '数秘22は、現実化と大物感のマスターナンバーです。普段は抑えていても、限界を超えると怒りの規模が大きいです。',
      },
      {
        rank: 5,
        day: 5,
        type: '瞬間爆発タイプ',
        note: '数秘5は、自由・刺激・衝動の数字です。怒ると急にスイッチが入り、予測不能な勢いで爆発しやすいです。',
      },
    ],
  },
  {
    filename: 'akisho-level-top5.jpg',
    title: '生まれ日の飽き性レベルTOP5はこちらです。',
    subtitle: '数秘術では、5＝自由・変化・刺激、3＝好奇心・楽しさ・軽やかさが強いほど飽きやすい傾向として見ます。',
    kind: 'ランキング',
    theme: 'akisho',
    accent: '#3f7fba',
    rows: [
      {
        rank: 1,
        day: 5,
        type: '★★★★★',
        note: '数秘5そのものなので、同じことの繰り返しがかなり苦手です。刺激がなくなると一気に興味が薄れます。',
      },
      {
        rank: 2,
        day: 14,
        type: '★★★★★',
        note: '1＋4＝5。自由に動きたい5の性質に、4の窮屈さへの反発が出やすいです。縛られると急に逃げたくなります。',
      },
      {
        rank: 3,
        day: 23,
        type: '★★★★☆',
        note: '2＋3＝5。人・情報・会話・流行に反応しやすく、興味の移り変わりが早いタイプです。',
      },
      {
        rank: 4,
        day: 3,
        type: '★★★★☆',
        note: '数秘3は楽しいこと優先です。つまらない、重い、単調だとすぐ別の面白いものを探します。',
      },
      {
        rank: 5,
        day: 30,
        type: '★★★★☆',
        note: '3＋0＝3。3の好奇心が強調されやすく、ノリが合わないものには長く集中しにくいタイプです。',
      },
    ],
  },
  {
    filename: 'majime-top5.jpg',
    title: '真面目な生まれ日TOP5はこちらです。',
    subtitle: '数秘術では、4＝堅実・努力・責任感、8＝成果・責任・管理能力、22＝大きな現実化として見ます。',
    kind: 'ランキング',
    theme: 'majime',
    accent: '#3f7d62',
    rows: [
      {
        rank: 1,
        day: 4,
        type: '王道の堅実タイプ',
        note: '数秘4そのものです。ルール、約束、積み重ねを大事にし、手を抜くのが苦手です。',
      },
      {
        rank: 2,
        day: 22,
        type: '責任感が重すぎるタイプ',
        note: '22はマスターナンバーで、理想を現実にする数字です。背負うものが大きくなるほど本気になります。',
      },
      {
        rank: 3,
        day: 13,
        type: 'コツコツ努力型',
        note: '1＋3＝4。見た目は柔らかくても、中身はかなり堅実です。地味な努力を続けられます。',
      },
      {
        rank: 4,
        day: 31,
        type: 'ちゃんと仕上げるタイプ',
        note: '3＋1＝4。ノリの良さもありますが、最後は責任を持って形にします。雑に終わらせるのが苦手です。',
      },
      {
        rank: 5,
        day: 8,
        type: '結果に責任を持つタイプ',
        note: '数秘8は成果・管理・責任の数字です。遊び半分より「やるなら勝つ」「結果を出す」に寄りやすいです。',
      },
    ],
  },
  {
    filename: 'uwaki-rate-top5.jpg',
    title: '浮気率高め',
    kind: 'ランキング',
    theme: 'uwaki',
    accent: '#b04f86',
    rows: [
      {
        rank: 1,
        day: 5,
        type: '刺激に弱い自由人タイプ',
        note: '数秘5は自由・変化・刺激の数字です。マンネリに弱く、新鮮な相手に心が動きやすいです。',
      },
      {
        rank: 2,
        day: 14,
        type: '束縛NGな逃げ足タイプ',
        note: '1＋4＝5。縛られるほど外に意識が向きやすいです。「自由でいたい」が強く出ます。',
      },
      {
        rank: 3,
        day: 23,
        type: 'ノリで距離が近くなるタイプ',
        note: '2＋3＝5。会話・雰囲気・その場の楽しさに流されやすく、気づくと距離が近くなりがちです。',
      },
      {
        rank: 4,
        day: 3,
        type: 'ときめき優先タイプ',
        note: '数秘3は楽しさ・会話・華やかさの数字です。褒められたり、楽しい相手が現れると揺れやすいです。',
      },
      {
        rank: 5,
        day: 15,
        type: '恋愛体質タイプ',
        note: '1＋5＝6で愛情欲求が強めです。寂しさや甘えたい気持ちが強い時に、他の人へ心が向きやすいです。',
      },
    ],
  },
  {
    filename: 'nenimotsu-wasureru-top5.jpg',
    title: '根に持つほうTOP5',
    pairedTitle: 'すぐ忘れるほうTOP5',
    kind: '2セット',
    theme: 'memory',
    accent: '#6f5aa8',
    paired: true,
    groups: [
      {
        title: '根に持つほうTOP5',
        rows: [
          { rank: 1, day: 16, note: '1＋6＝7。感情的に騒がず、冷静に全部覚えているタイプです。許したように見えて、内心では記録しています。' },
          { rank: 2, day: 29, note: '2系＋11の感受性。傷ついた言葉や態度をかなり長く覚えやすいです。' },
          { rank: 3, day: 8, note: 'プライドと勝負意識が強めです。舐められた記憶は簡単に流しません。' },
          { rank: 4, day: 4, note: '筋が通らないこと、約束を破られたことを忘れにくいです。信頼を失うと戻りにくいタイプです。' },
          { rank: 5, day: 18, note: '1＋8＝9。情が深いぶん、裏切られた時の記憶も深く残りやすいです。' },
        ],
      },
      {
        title: 'すぐ忘れるほうTOP5',
        rows: [
          { rank: 1, day: 5, note: '数秘5は変化と自由の数字です。怒っても次の刺激が来ると意識がそちらへ向きます。' },
          { rank: 2, day: 3, note: '数秘3は軽やかさと楽しさの数字です。重い感情を長く持つのが苦手です。' },
          { rank: 3, day: 23, note: '2＋3＝5。人間関係の切り替えが早く、「まあいっか」になりやすいです。' },
          { rank: 4, day: 30, note: '3＋0＝3。気分転換が得意で、嫌なことより楽しいことを優先します。' },
          { rank: 5, day: 14, note: '1＋4＝5。少し不満は残っても、最終的には自由に動いて忘れていくタイプです。' },
        ],
      },
    ],
  },
  {
    filename: 'chuunibyou-top5.jpg',
    title: '厨二病をこじらせやすい生まれ日TOP5はこちらです。',
    subtitle: '数秘術ベースで、世界観・孤独感・使命感・闇属性・“選ばれし者”感を見ています。',
    kind: 'ランキング',
    theme: 'chuni',
    accent: '#5f579c',
    rows: [
      {
        rank: 1,
        day: 11,
        type: '選ばれし者タイプ',
        note: '11はマスターナンバーで、直感・霊感・特別感が強い数字です。「自分だけ何かを感じ取っている」感が出やすいです。',
      },
      {
        rank: 2,
        day: 16,
        type: '闇落ち覚醒タイプ',
        note: '1＋6＝7。7の孤独・探求に、16の“崩壊と再生”っぽさが乗ります。過去に何かあった系の設定が似合います。',
      },
      {
        rank: 3,
        day: 7,
        type: '孤高の探求者タイプ',
        note: '数秘7は神秘・分析・孤独・専門性の数字です。群れずに自分だけの思想や世界観を深めがちです。',
      },
      {
        rank: 4,
        day: 22,
        type: '世界を変える使命タイプ',
        note: '22は大きな理想を現実にするマスターナンバーです。「自分には果たすべき使命がある」感が強くなりやすいです。',
      },
      {
        rank: 5,
        day: 29,
        type: '感情暴走ヒロイン/主人公タイプ',
        note: '2＋9＝11。感受性と直感が強く、運命・前世・魂のつながりみたいな言葉に反応しやすいです。',
      },
    ],
  },
];

function familyOf(day) {
  return birthdayMiniFamilyForDay(day);
}

function uniqueFamilies(days) {
  return Array.from(new Set(days.map(familyOf))).sort((a, b) => a - b);
}

function miniPath(family) {
  return path.join(MINI_ROOT, `birthday-family-${family}-chibi.png`);
}

function fileUrl(filePath) {
  if (DATA_URL_CACHE.has(filePath)) return DATA_URL_CACHE.get(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const encoded = fsSync.readFileSync(filePath).toString('base64');
  const dataUrl = `data:${mime};base64,${encoded}`;
  DATA_URL_CACHE.set(filePath, dataUrl);
  return dataUrl;
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ensureAssets() {
  const required = Array.from({ length: 9 }, (_, index) => miniPath(index + 1));
  const missing = required.filter((file) => !fsSync.existsSync(file));
  if (missing.length) throw new Error(`Missing assets:\n${missing.join('\n')}`);
}

function brand() {
  return '<div class="brand"><div class="mark">R</div><div>羅針占術</div></div>';
}

function baseHtml(body, extraCss = '') {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    body { font-family: "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif; color: #12384f; }
    .stage { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #f5fbff; }
    .topic-bg { position:absolute; inset:0; overflow:hidden; }
    .topic-bg i, .topic-bg b, .topic-bg span { position:absolute; display:block; }
    .wash { position:absolute; inset:0; background:
      radial-gradient(circle at 74% 15%, rgba(255,255,255,.62), transparent 180px),
      linear-gradient(90deg, rgba(255,255,255,.93), rgba(255,255,255,.78) 58%, rgba(255,255,255,.14)); }
    .brand { position:absolute; left:56px; top:52px; display:inline-flex; align-items:center; gap:16px; padding:14px 20px; border-radius:12px; background:rgba(255,255,255,.88); box-shadow:0 10px 30px rgba(20,45,60,.16); font-weight:900; font-size:27px; }
    .mark { display:grid; place-items:center; width:44px; height:44px; border-radius:8px; background:#12384f; color:#fff; font-weight:900; }
    .pill { display:inline-flex; align-items:center; justify-content:center; padding:8px 16px; border-radius:999px; background:rgba(18,56,79,.92); color:#fff; font-size:24px; font-weight:900; }
    .url { position:absolute; right:54px; bottom:34px; color:rgba(255,255,255,.96); text-shadow:0 3px 14px rgba(0,0,0,.55); font-weight:900; font-size:22px; }
    .theme-idol { background:
      radial-gradient(circle at 72% 12%, rgba(255,240,167,.90), transparent 140px),
      radial-gradient(circle at 88% 70%, rgba(86,174,198,.52), transparent 280px),
      linear-gradient(145deg, #12192f 0%, #22446b 48%, #9b4d75 100%); }
    .theme-love { background:
      radial-gradient(circle at 76% 18%, rgba(255,225,236,.95), transparent 190px),
      radial-gradient(circle at 92% 76%, rgba(242,164,191,.72), transparent 290px),
      linear-gradient(145deg, #fff1f7 0%, #b9d7ee 52%, #d95386 100%); }
    .theme-amae { background:
      radial-gradient(circle at 76% 18%, rgba(255,246,210,.96), transparent 170px),
      radial-gradient(circle at 86% 74%, rgba(255,187,200,.76), transparent 300px),
      linear-gradient(145deg, #fff7df 0%, #cdebf0 50%, #f1a2b7 100%); }
    .theme-anger { background:
      radial-gradient(circle at 78% 16%, rgba(255,209,115,.58), transparent 150px),
      radial-gradient(circle at 84% 68%, rgba(171,28,52,.72), transparent 300px),
      linear-gradient(145deg, #141820 0%, #3b2636 42%, #9f1f36 100%); }
    .theme-akisho { background:
      radial-gradient(circle at 76% 15%, rgba(255,244,162,.86), transparent 170px),
      radial-gradient(circle at 88% 72%, rgba(89,189,214,.70), transparent 290px),
      linear-gradient(145deg, #e9fbff 0%, #94d6e8 46%, #f4cf62 100%); }
    .theme-majime { background:
      radial-gradient(circle at 78% 14%, rgba(230,255,226,.92), transparent 170px),
      radial-gradient(circle at 86% 72%, rgba(73,151,105,.62), transparent 300px),
      linear-gradient(145deg, #f5fff8 0%, #acd5c2 48%, #4b826a 100%); }
    .theme-uwaki { background:
      radial-gradient(circle at 76% 18%, rgba(255,222,236,.92), transparent 180px),
      radial-gradient(circle at 86% 72%, rgba(183,90,142,.58), transparent 300px),
      linear-gradient(145deg, #fff0f7 0%, #d4c9f0 48%, #b04f86 100%); }
    .theme-memory { background:
      radial-gradient(circle at 74% 14%, rgba(231,227,255,.92), transparent 180px),
      radial-gradient(circle at 84% 72%, rgba(119,98,174,.64), transparent 300px),
      linear-gradient(145deg, #f6f2ff 0%, #c8d2ec 48%, #6f5aa8 100%); }
    .theme-chuni { background:
      radial-gradient(circle at 77% 16%, rgba(188,202,255,.82), transparent 170px),
      radial-gradient(circle at 84% 70%, rgba(61,48,119,.76), transparent 300px),
      linear-gradient(145deg, #10172e 0%, #2f285d 48%, #6d5ab1 100%); }
    .beam { width:220px; height:1380px; top:-80px; transform-origin:50% 0; background:linear-gradient(180deg, rgba(255,255,255,.44), rgba(255,255,255,0)); filter:blur(4px); clip-path:polygon(48% 0, 58% 0, 100% 100%, 0 100%); }
    .beam-1 { right:280px; transform:rotate(-21deg); }
    .beam-2 { right:58px; transform:rotate(16deg); opacity:.72; }
    .stage-disc { right:34px; bottom:88px; width:380px; height:88px; border-radius:50%; background:rgba(255,255,255,.24); border:4px solid rgba(255,244,169,.36); box-shadow:0 0 38px rgba(255,244,169,.26); }
    .star { width:18px; height:18px; background:#ffe98a; clip-path:polygon(50% 0, 62% 34%, 98% 35%, 69% 56%, 79% 91%, 50% 70%, 21% 91%, 31% 56%, 2% 35%, 38% 34%); box-shadow:0 0 16px rgba(255,232,126,.74); }
    .star-1 { right:106px; top:160px; transform:scale(1.9) rotate(8deg); }
    .star-2 { right:348px; top:330px; transform:scale(1.35) rotate(-12deg); }
    .star-3 { right:168px; bottom:220px; transform:scale(1.55) rotate(18deg); }
    .heart { width:54px; height:54px; transform:rotate(-45deg); background:rgba(211,66,110,.34); border-radius:10px; box-shadow:0 16px 30px rgba(116,34,62,.12); }
    .heart::before, .heart::after { content:""; position:absolute; width:54px; height:54px; border-radius:50%; background:inherit; }
    .heart::before { left:0; top:-27px; }
    .heart::after { left:27px; top:0; }
    .heart-1 { right:110px; top:140px; transform:rotate(-45deg) scale(1.6); }
    .heart-2 { right:304px; top:360px; transform:rotate(-31deg) scale(.98); opacity:.68; }
    .heart-3 { right:86px; bottom:210px; transform:rotate(-58deg) scale(1.15); opacity:.75; }
    .bubble { border-radius:50%; background:rgba(255,255,255,.42); border:2px solid rgba(255,255,255,.55); box-shadow:0 14px 38px rgba(116,84,98,.12); }
    .bubble-1 { right:82px; top:130px; width:154px; height:154px; }
    .bubble-2 { right:292px; top:354px; width:88px; height:88px; }
    .bubble-3 { right:62px; bottom:190px; width:210px; height:210px; opacity:.72; }
    .ribbon { width:330px; height:84px; right:40px; bottom:330px; border-radius:999px; background:rgba(255,167,187,.33); transform:rotate(-18deg); box-shadow:0 18px 36px rgba(180,85,112,.14); }
    .bolt { width:110px; height:330px; background:linear-gradient(180deg, #ffd36a, #e8374e); clip-path:polygon(54% 0, 100% 0, 64% 43%, 92% 43%, 24% 100%, 42% 55%, 10% 55%); filter:drop-shadow(0 0 18px rgba(255,76,68,.58)); }
    .bolt-1 { right:124px; top:104px; transform:rotate(18deg) scale(1.1); }
    .bolt-2 { right:330px; top:420px; transform:rotate(-17deg) scale(.66); opacity:.66; }
    .slash { width:420px; height:18px; right:-40px; background:rgba(255,255,255,.20); transform:rotate(-28deg); border-radius:999px; }
    .slash-1 { top:260px; }
    .slash-2 { top:605px; opacity:.56; }
    .slash-3 { bottom:210px; opacity:.42; }
    .spark { width:28px; height:28px; background:#fff6a8; clip-path:polygon(50% 0, 61% 37%, 100% 50%, 61% 63%, 50% 100%, 39% 63%, 0 50%, 39% 37%); filter:drop-shadow(0 0 18px rgba(255,245,145,.75)); }
    .spark-1 { right:112px; top:142px; transform:scale(2.1) rotate(12deg); }
    .spark-2 { right:318px; top:392px; transform:scale(1.2) rotate(-18deg); opacity:.72; }
    .note-shape { width:210px; height:150px; right:75px; bottom:210px; border-radius:18px; background:rgba(255,255,255,.28); box-shadow:0 18px 36px rgba(32,70,84,.14); transform:rotate(-10deg); }
    .note-shape::before { content:""; position:absolute; left:22px; top:30px; width:150px; height:12px; border-radius:999px; background:rgba(18,56,79,.18); box-shadow:0 34px 0 rgba(18,56,79,.14), 0 68px 0 rgba(18,56,79,.10); }
    .moon { right:98px; top:132px; width:130px; height:130px; border-radius:50%; background:rgba(245,241,170,.82); box-shadow:0 0 38px rgba(245,241,170,.54); }
    .moon::after { content:""; position:absolute; left:34px; top:-2px; width:126px; height:126px; border-radius:50%; background:rgba(47,40,93,.82); }
    ${extraCss}
  </style>
</head>
<body>${body}</body>
</html>`;
}

function topicBackground(theme) {
  const decor = {
    idol: `
      <i class="beam beam-1"></i><i class="beam beam-2"></i><i class="stage-disc"></i>
      <i class="star star-1"></i><i class="star star-2"></i><i class="star star-3"></i>`,
    love: `
      <i class="heart heart-1"></i><i class="heart heart-2"></i><i class="heart heart-3"></i>
      <i class="bubble bubble-2"></i>`,
    amae: `
      <i class="bubble bubble-1"></i><i class="bubble bubble-2"></i><i class="bubble bubble-3"></i>
      <i class="heart heart-2"></i><i class="ribbon"></i>`,
    anger: `
      <i class="bolt bolt-1"></i><i class="bolt bolt-2"></i>
      <i class="slash slash-1"></i><i class="slash slash-2"></i><i class="slash slash-3"></i>`,
    akisho: `
      <i class="spark spark-1"></i><i class="spark spark-2"></i>
      <i class="bubble bubble-1"></i><i class="ribbon"></i>`,
    majime: `
      <i class="note-shape"></i><i class="spark spark-2"></i>
      <i class="bubble bubble-2"></i>`,
    uwaki: `
      <i class="heart heart-1"></i><i class="heart heart-3"></i>
      <i class="slash slash-1"></i><i class="spark spark-2"></i>`,
    memory: `
      <i class="note-shape"></i><i class="bubble bubble-1"></i>
      <i class="spark spark-1"></i>`,
    chuni: `
      <i class="moon"></i><i class="spark spark-1"></i><i class="spark spark-2"></i>
      <i class="slash slash-1"></i><i class="slash slash-2"></i>`,
  };
  return `<div class="topic-bg theme-${theme}">${decor[theme] || ''}</div><div class="wash"></div>`;
}

function miniCluster(days) {
  return uniqueFamilies(days).map((family) => `
    <span class="mini-item">
      <img src="${fileUrl(miniPath(family))}" alt="">
      <b>${family}系</b>
    </span>
  `).join('');
}

function classificationHtml(preset) {
  const rows = preset.rows.map((row) => `
    <article class="class-card">
      <div class="class-text">
        <div class="class-head"><span>${esc(row.no)}</span><strong>${esc(row.title)}</strong></div>
        <p class="days">${esc(row.daysText)}</p>
        <p class="copy">${esc(row.copy)}</p>
      </div>
      <div class="mini-cluster">${miniCluster(row.days)}</div>
    </article>
  `).join('');

  return baseHtml(`
    <div class="stage">
      ${topicBackground(preset.theme)}
      ${brand()}
      <main class="classification">
        <div class="class-top">
          <div class="pill">${esc(preset.kind)}</div>
          <div class="top-question">${esc(preset.topQuestion)}</div>
        </div>
        <h1>${esc(preset.title)}</h1>
        <section>${rows}</section>
      </main>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .classification { position:absolute; left:58px; top:150px; width:964px; }
    .class-top { display:flex; align-items:center; gap:18px; }
    .top-question { display:inline-flex; align-items:center; min-height:44px; padding:8px 18px; border-radius:999px; background:rgba(255,255,255,.90); color:#12384f; box-shadow:0 10px 24px rgba(16,45,64,.13); font-size:28px; line-height:1; font-weight:1000; }
    .classification h1 { margin:18px 0 22px; width:960px; font-size:52px; line-height:1.08; letter-spacing:0; color:#12384f; }
    .classification section { display:grid; gap:16px; }
    .class-card { display:grid; grid-template-columns: 1fr 250px; gap:18px; min-height:236px; padding:20px 22px; border-radius:16px; background:rgba(255,255,255,.92); box-shadow:0 14px 34px rgba(16,45,64,.15); border:1px solid rgba(18,56,79,.10); }
    .class-head { display:flex; align-items:center; gap:12px; color:${preset.accent}; line-height:1.08; }
    .class-head span { display:grid; place-items:center; min-width:48px; height:48px; border-radius:10px; background:#12384f; color:#fff; font-size:27px; font-weight:1000; }
    .class-head strong { font-size:34px; font-weight:1000; }
    .days { margin:12px 0 8px; color:#12384f; font-size:24px; line-height:1.22; font-weight:1000; }
    .copy { margin:0; color:#284b5d; font-size:24px; line-height:1.36; font-weight:850; }
    .mini-cluster { display:grid; grid-template-columns:repeat(3, 1fr); align-content:center; justify-items:center; gap:8px 7px; }
    .mini-item { position:relative; display:grid; place-items:center; width:72px; height:90px; }
    .mini-item img { max-width:76px; max-height:88px; object-fit:contain; filter:drop-shadow(0 7px 9px rgba(18,56,79,.18)); }
    .mini-item b { position:absolute; left:0; top:0; min-width:35px; height:24px; padding:2px 6px; border-radius:999px; background:rgba(18,56,79,.94); color:#fff; font-size:14px; line-height:20px; text-align:center; }
  `);
}

function rankingHtml(preset) {
  if (preset.paired) return pairedRankingHtml(preset);
  const rows = preset.rows.map((row) => {
    const family = familyOf(row.day);
    return `
      <article class="rank-card">
        <div class="rank-no">${row.rank}位</div>
        <img src="${fileUrl(miniPath(family))}" alt="">
        <div class="rank-text">
          <h2>${row.day}日生まれ</h2>
          <strong>${esc(row.type)}</strong>
          <p>${esc(row.note)}</p>
        </div>
      </article>
    `;
  }).join('');

  return baseHtml(`
    <div class="stage">
      ${topicBackground(preset.theme)}
      ${brand()}
      <main class="ranking">
        <div class="pill">${esc(preset.kind)}</div>
        <h1>${esc(preset.title)}</h1>
        ${preset.subtitle ? `<p class="subtitle">${esc(preset.subtitle)}</p>` : ''}
        <section>${rows}</section>
      </main>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .ranking { position:absolute; left:58px; top:145px; width:950px; }
    .ranking h1 { margin:18px 0 ${preset.subtitle ? '10px' : '22px'}; width:960px; font-size:${preset.subtitle ? '43px' : '55px'}; line-height:1.08; letter-spacing:0; color:#12384f; }
    .subtitle { margin:0 0 16px; width:880px; color:#294b5d; font-size:22px; line-height:1.35; font-weight:900; }
    .ranking section { display:grid; gap:12px; }
    .rank-card { display:grid; grid-template-columns:72px 112px 1fr; align-items:center; min-height:${preset.subtitle ? '151px' : '164px'}; padding:11px 16px; border-radius:15px; background:rgba(255,255,255,.92); box-shadow:0 14px 34px rgba(16,45,64,.15); border:1px solid rgba(18,56,79,.10); }
    .rank-no { font-size:31px; font-weight:1000; color:#f0bd56; text-shadow:0 2px 0 #12384f; }
    .rank-card img { width:104px; height:126px; object-fit:contain; filter:drop-shadow(0 8px 12px rgba(18,56,79,.20)); }
    .rank-text h2 { margin:0 0 1px; color:${preset.accent}; font-size:30px; line-height:1.02; }
    .rank-text strong { display:block; color:#12384f; font-size:23px; line-height:1.13; }
    .rank-text p { margin:5px 0 0; color:#1f4355; font-size:${preset.subtitle ? '18px' : '19px'}; line-height:1.26; font-weight:800; }
  `);
}

function pairedRankingHtml(preset) {
  const groups = preset.groups.map((group) => {
    const rows = group.rows.map((row) => {
      const family = familyOf(row.day);
      return `
        <article class="pair-row">
          <div class="pair-rank">${row.rank}位</div>
          <img src="${fileUrl(miniPath(family))}" alt="">
          <div>
            <h3>${row.day}日生まれ</h3>
            <p>${esc(row.note)}</p>
          </div>
        </article>
      `;
    }).join('');
    return `
      <section class="pair-panel">
        <h2>${esc(group.title)}</h2>
        ${rows}
      </section>
    `;
  }).join('');

  return baseHtml(`
    <div class="stage">
      ${topicBackground(preset.theme)}
      ${brand()}
      <main class="paired">
        <div class="pill">${esc(preset.kind)}</div>
        <h1><span>${esc(preset.title)}</span><small>${esc(preset.pairedTitle)}</small></h1>
        <div class="pair-grid">${groups}</div>
      </main>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .paired { position:absolute; left:54px; top:135px; width:970px; }
    .paired h1 { margin:12px 0 12px; display:grid; gap:2px; color:#12384f; letter-spacing:0; }
    .paired h1 span { font-size:43px; line-height:1.03; font-weight:1000; }
    .paired h1 small { font-size:34px; line-height:1.03; font-weight:1000; color:${preset.accent}; }
    .pair-grid { display:grid; gap:9px; }
    .pair-panel { padding:11px 16px 9px; border-radius:16px; background:rgba(255,255,255,.92); box-shadow:0 14px 34px rgba(16,45,64,.15); border:1px solid rgba(18,56,79,.10); }
    .pair-panel h2 { margin:0 0 5px; color:${preset.accent}; font-size:27px; line-height:1.02; font-weight:1000; }
    .pair-row { display:grid; grid-template-columns:56px 60px 1fr; align-items:center; min-height:69px; border-top:1px solid rgba(18,56,79,.10); padding:3px 0; }
    .pair-row:first-of-type { border-top:0; }
    .pair-rank { color:#f0bd56; text-shadow:0 2px 0 #12384f; font-size:23px; font-weight:1000; }
    .pair-row img { width:54px; height:62px; object-fit:contain; filter:drop-shadow(0 6px 9px rgba(18,56,79,.18)); }
    .pair-row h3 { margin:0 0 1px; color:#12384f; font-size:21px; line-height:1.02; font-weight:1000; }
    .pair-row p { margin:0; color:#24495a; font-size:14px; line-height:1.18; font-weight:850; }
  `);
}

async function writeShot(page, html, outPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outPath, type: 'jpeg', quality: QUALITY });
  return outPath;
}

function parseTargetFiles(argv) {
  const fileArg = argv.find((arg) => arg.startsWith('--files='));
  if (!fileArg) return null;
  const files = fileArg
    .slice('--files='.length)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return files.length ? new Set(files) : null;
}

async function main() {
  ensureAssets();
  const targetFiles = parseTargetFiles(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const outputs = [];
  try {
    for (const preset of CLASSIFICATION_PRESETS) {
      if (targetFiles && !targetFiles.has(preset.filename)) continue;
      outputs.push(await writeShot(page, classificationHtml(preset), path.join(OUT_DIR, preset.filename)));
    }
    for (const preset of RANKING_PRESETS) {
      if (targetFiles && !targetFiles.has(preset.filename)) continue;
      outputs.push(await writeShot(page, rankingHtml(preset), path.join(OUT_DIR, preset.filename)));
    }
  } finally {
    await browser.close();
  }
  console.log(`Generated ${outputs.length} images:`);
  for (const output of outputs) console.log(`- ${output}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
