const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTH = 1080;
const HEIGHT = 1350;
const QUALITY = 90;
const INSTAGRAM_ROOT = path.join(ROOT, 'images', 'social', 'instagram');
const OUT_ROOT = path.join(INSTAGRAM_ROOT, 'generated-birthday');
const CARD_ROOT = path.join(ROOT, 'images', 'cards', 'lenormand');
const MINI_ROOT = path.join(INSTAGRAM_ROOT, 'birthday-mini');

const ASSETS = {
  lenormandBase: path.join(INSTAGRAM_ROOT, 'ルノルマンカードメッセージ.png'),
  rankingBase: path.join(INSTAGRAM_ROOT, 'インスタグラム用背景①.png'),
  aruaruBase: path.join(INSTAGRAM_ROOT, 'インスタグラム用背景②.png'),
  whatBase: path.join(INSTAGRAM_ROOT, 'インスタグラム用背景③.png'),
  difference: path.join(INSTAGRAM_ROOT, 'difference.jpg'),
  freePaid: path.join(INSTAGRAM_ROOT, 'free-paid-compare.jpg'),
};

const DATA_URL_CACHE = new Map();

const LENORMAND = [
  ['騎士', '知らせが入り、止まっていた流れが動き出す。'],
  ['クローバー', '小さな好機を拾うほど、運が広がる。'],
  ['船', 'いつもと違う選択が未来を開く。'],
  ['家', '土台を整えるほど安心が戻る。'],
  ['木', '焦らず育てることが成果につながる。'],
  ['雲', '迷いは整理の合図。急ぎすぎないで。'],
  ['蛇', '本音と建前を見分ける必要がある。'],
  ['棺', '終わらせることで新しい余白が生まれる。'],
  ['花束', '受け取る姿勢が良縁を呼ぶ。'],
  ['鎌', '先延ばしを切ると流れが軽くなる。'],
  ['鞭', '繰り返す問題は、向き合い方の見直しどき。'],
  ['鳥', '会話と相談が突破口になる。'],
  ['子ども', '新しい一歩は小さく始めてよい。'],
  ['狐', '損得より、違和感を見逃さないこと。'],
  ['熊', '自信と責任を持つほど運が強まる。'],
  ['星', '理想を具体化すると希望が形になる。'],
  ['コウノトリ', '環境や関係に前向きな変化が起きる。'],
  ['犬', '信頼できる人との連携が鍵になる。'],
  ['塔', '一人で整える時間が判断力を戻す。'],
  ['庭園', '人前に出るほどチャンスが増える。'],
  ['山', '障害はあるが、越え方を変えれば進める。'],
  ['道', '選択肢が増える。決める基準を明確に。'],
  ['ネズミ', '小さな不安を放置しないこと。'],
  ['ハート', '好きなものを大切にすると運が温まる。'],
  ['指輪', '約束や継続が信頼を強める。'],
  ['本', 'まだ見えていない情報がある。確認が大事。'],
  ['手紙', '言葉にすることで状況が進む。'],
  ['紳士', '能動的な判断が流れを作る。'],
  ['淑女', '受け止める力が関係を整える。'],
  ['百合', '落ち着いた対応が信頼につながる。'],
  ['太陽', '明るく見せるほど成果が出やすい。'],
  ['月', '感性と評判が味方になる。'],
  ['鍵', '答えが見え、突破口が見つかる。'],
  ['魚', '循環と豊かさ。お金や価値の流れに注目。'],
  ['錨', '続けてきたことが安定に変わる。'],
  ['十字架', '背負いすぎを手放すと軽くなる。'],
].map(([name, copy], index) => ({ no: index + 1, name, copy }));

const FAMILIES = {
  1: { label: '1系', title: '切り開く人', color: '#d94b47', aruaru: ['待つより先に動く', '頼られると急に強い', '本当は負けず嫌い'] },
  2: { label: '2系', title: '空気を読む人', color: '#b66fb5', aruaru: ['相手の温度差にすぐ気づく', '強く言う前に飲み込む', '安心できる人にだけ甘える'] },
  3: { label: '3系', title: '場を明るくする人', color: '#e5a331', aruaru: ['楽しい方向へ変換できる', '褒められると伸びる', '飽きると急に止まる'] },
  4: { label: '4系', title: '整えて積む人', color: '#4d8f72', aruaru: ['段取りが崩れると落ち着かない', '責任感で最後までやる', '雑な約束が苦手'] },
  5: { label: '5系', title: '変化を運ぶ人', color: '#4a9fd8', aruaru: ['同じ景色が続くと息が詰まる', '直感で動くと強い', '自由を奪われると無言で離れる'] },
  6: { label: '6系', title: '愛で守る人', color: '#cf7d8e', aruaru: ['大切な人には世話を焼く', '美意識で気分が変わる', '我慢しすぎて急に限界が来る'] },
  7: { label: '7系', title: '深く見抜く人', color: '#6b72b9', aruaru: ['一人時間で回復する', '浅い話より本質が好き', '納得しないと動けない'] },
  8: { label: '8系', title: '結果を出す人', color: '#b88737', aruaru: ['任されると燃える', '中途半端な評価が苦手', '本気になると現実を動かす'] },
  9: { label: '9系', title: '全体を見る人', color: '#5f9f9c', aruaru: ['相手の事情まで考える', '区切りをつけるのが上手い', '本音はかなり達観している'] },
};

const RANKING_PRESETS = {
  flowTop3: {
    filename: 'flow-top3.jpg',
    topic: '今月、流れに乗れる生まれ日TOP3',
    mentions: '惜しかった生まれ日: 5日・18日・27日',
    ranks: [
      { rank: 1, day: 14, type: '変化を選ぶほど追い風', note: '迷っていた予定を一つ決めると、次の話が早く進みます。' },
      { rank: 2, day: 22, type: '現実を整える力が強い', note: '後回しの整理や連絡が、評価と安心に直結します。' },
      { rank: 3, day: 3, type: '言葉にすると運が広がる', note: '軽い発信や相談から、思わぬ流れが生まれます。' },
    ],
  },
  weirdTop5: {
    filename: 'weird-top5.jpg',
    topic: '変人に見られやすい生まれ日TOP5',
    mentions: '独特さは弱点ではなく、使いどころで魅力になります。',
    ranks: [
      { rank: 1, day: 11, type: '宇宙受信型', note: '直感・感性が鋭く、発想が人とズレやすいです。本人は普通でも周囲からは独特に見えます。' },
      { rank: 2, day: 7, type: 'マイワールド研究者型', note: 'こだわりが深く、一人で考え込む力が強いタイプです。理解されなくても自分の世界を守ります。' },
      { rank: 3, day: 22, type: '規格外クリエイター型', note: '発想のスケールが大きく、普通では終わらないタイプです。変わった夢を現実にしようとします。' },
      { rank: 4, day: 5, type: '予測不能な自由人型', note: '飽きっぽく、急に動きます。常識より「面白そう」を優先しやすい変人タイプです。' },
      { rank: 5, day: 29, type: '感情直感ミックス型', note: '感受性と直感が強く、考え方が複雑です。気分やひらめきの振れ幅が人より大きめです。' },
    ],
  },
  loveAtFirstSightTop5: {
    filename: 'love-at-first-sight-top5.jpg',
    topic: '一目惚れしやすい生まれ日TOP5',
    mentions: 'ときめきが早い人ほど、好きになる理由はあとから分かることもあります。',
    ranks: [
      { rank: 1, day: 5, type: '刺激で恋に落ちるタイプ', note: 'ノリ・雰囲気・勢いに弱いです。「面白そう」「楽しそう」で一気に好きになりやすいです。' },
      { rank: 2, day: 3, type: 'ときめき優先タイプ', note: '明るい空気や会話のテンポに弱いです。楽しい相手にすぐ心を持っていかれやすいです。' },
      { rank: 3, day: 11, type: '運命感じすぎタイプ', note: '直感が強く、「この人、何かある」と感じると一気に惹かれます。雰囲気や目に弱いです。' },
      { rank: 4, day: 15, type: '恋愛体質タイプ', note: '愛されたい・愛したい気持ちが強めです。見た目、声、優しさで急に恋愛スイッチが入ります。' },
      { rank: 5, day: 29, type: '感情吸収タイプ', note: '感受性が強く、相手の空気感に飲まれやすいです。切なげな人やミステリアスな人に弱いです。' },
    ],
  },
  moneyLuckTop5: {
    filename: 'money-luck-top5.jpg',
    theme: 'money',
    topic: '金運が強い生まれ日TOP5',
    mentions: '金運は、稼ぐ力・守る力・人との縁で育ち方が変わります。',
    ranks: [
      { rank: 1, day: 8, type: '王道の金運タイプ', note: '数秘8は、成功・権力・ビジネス・お金を象徴します。稼ぐ力、勝負運、結果を出す力が強いです。' },
      { rank: 2, day: 22, type: '大きなお金を動かすタイプ', note: '数秘22は、現実化・大きな事業・スケールの大きさを持つマスターナンバーです。小銭より大きな成果に縁があります。' },
      { rank: 3, day: 17, type: '才能で稼ぐタイプ', note: '1＋7＝8なので金運数8の影響があります。独自の知性や専門性を活かして収入につなげやすいです。' },
      { rank: 4, day: 26, type: '人脈で金運を呼ぶタイプ', note: '2＋6＝8で、こちらも8系の金運です。人とのつながり、信頼、サポート役からお金を引き寄せやすいです。' },
      { rank: 5, day: 4, type: '堅実に財を築くタイプ', note: '数秘4は、安定・継続・管理の数字です。一発逆転より、貯める・増やす・守る金運に強いです。' },
    ],
  },
  horrorResistanceTop5: {
    filename: 'horror-resistance-top5.jpg',
    theme: 'horror',
    topic: 'ホラー耐性のある生まれ日TOP5',
    mentions: '怖がらない理由は、鈍感さではなく見方のクセかもしれません。',
    ranks: [
      { rank: 1, day: 7, type: '冷静すぎる観察者タイプ', note: '怖がるより先に「この演出うまいな」「伏線かな」と分析します。血を見ながら普通にご飯食べられるタイプです。' },
      { rank: 2, day: 8, type: '肝が据わったボスタイプ', note: '圧・恐怖・グロに動じにくいです。ビビるより「で？」となりやすい強心臓タイプです。' },
      { rank: 3, day: 5, type: '刺激を求めるスリル中毒タイプ', note: '怖いものを怖がりながらも楽しめます。「うわ無理！」と言いつつ最後まで見ます。' },
      { rank: 4, day: 16, type: '闇に強い考察タイプ', note: '1＋6＝7なので、7の分析力があります。ホラーの怖さより、背景・心理・真相が気になるタイプです。' },
      { rank: 5, day: 22, type: '規格外メンタルタイプ', note: '普通の人が怖がる場面でも、どこか俯瞰しています。スケールの大きい恐怖や世界観ホラーに強いです。' },
    ],
  },
};

const MONTHLY_PARTS = [
  { key: '01-10', label: '1〜10日生まれ', days: range(1, 10) },
  { key: '11-20', label: '11〜20日生まれ', days: range(11, 20) },
  { key: '21-31', label: '21〜31日生まれ', days: range(21, 31) },
];

const LANES = ['仕事運', '金運', '恋愛運', '総合運'];

const MONTHLY_READING_OVERRIDES = {
  '2026-06': {
    1: {
      cards: [33, 31, 18, 22],
      messages: {
        仕事運: '鍵。止まっていた案件は、突破口が見えると進みます。',
        金運: '太陽。明るく伝えるほど、お金につながる話が増えます。',
        恋愛運: '犬。信頼できる人ほど、言葉より行動で見てください。',
        総合運: '道。迷ったら、楽な道より納得できる道を選ぶ月です。',
      },
    },
    2: {
      cards: [24, 12, 4, 2],
      messages: {
        仕事運: 'ハート。気持ちよく続けられる仕事ほど、成果につながります。',
        金運: '鳥。相談や確認を増やすと、無駄な出費を防げます。',
        恋愛運: '家。安心できる距離感を作ることが、関係を育てます。',
        総合運: 'クローバー。小さな偶然を拾うほど、流れが軽くなります。',
      },
    },
    3: {
      cards: [1, 20, 9, 3],
      messages: {
        仕事運: '騎士。早めの連絡と発信が、チャンスを連れてきます。',
        金運: '庭園。人の集まる場所や紹介から、得るものが増えます。',
        恋愛運: '花束。素直に喜ぶ姿が、相手の心を開きます。',
        総合運: '船。いつもの場所を少し離れると、新しい流れに乗れます。',
      },
    },
    4: {
      cards: [35, 4, 26, 5],
      messages: {
        仕事運: '錨。続けてきた作業が、信頼や評価に変わります。',
        金運: '家。固定費と生活費を整えると、安心感が戻ります。',
        恋愛運: '本。相手を決めつけず、まだ知らない面を見てください。',
        総合運: '木。急がず育てる姿勢が、6月の運を安定させます。',
      },
    },
    5: {
      cards: [17, 10, 27, 34],
      messages: {
        仕事運: 'コウノトリ。環境を少し変えると、動きやすくなります。',
        金運: '鎌。使っていない契約や出費は、思い切って切る時です。',
        恋愛運: '手紙。軽い一言や返信が、関係を動かすきっかけになります。',
        総合運: '魚。お金・情報・人脈の流れを止めないことが大切です。',
      },
    },
    6: {
      cards: [9, 25, 24, 30],
      messages: {
        仕事運: '花束。丁寧な対応や気配りが、評価につながります。',
        金運: '指輪。続けている支払いは、内容を見直すと安心です。',
        恋愛運: 'ハート。好きな気持ちは、遠回しより素直に出す方が吉。',
        総合運: '百合。落ち着いた判断が、あなたの魅力を強めます。',
      },
    },
    7: {
      cards: [26, 19, 32, 16],
      messages: {
        仕事運: '本。調べるほど、見落としていた答えが見つかります。',
        金運: '塔。一人で落ち着いて見直すと、無駄を減らせます。',
        恋愛運: '月。雰囲気や言葉の温度に、相手の本音が出ます。',
        総合運: '星。理想を下げず、まず一つだけ具体化してください。',
      },
    },
    8: {
      cards: [15, 34, 31, 33],
      messages: {
        仕事運: '熊。責任ある立場を引き受けるほど、存在感が増します。',
        金運: '魚。お金の流れは強め。入る分、出口の管理も大事です。',
        恋愛運: '太陽。明るく堂々と接すると、魅力が伝わりやすい月です。',
        総合運: '鍵。答えは見えています。あとは一歩動くだけです。',
      },
    },
    9: {
      cards: [30, 36, 20, 8],
      messages: {
        仕事運: '百合。焦らず丁寧に進めるほど、周りから信頼されます。',
        金運: '十字架。背負いすぎた支払い・責任は、軽くする工夫を。',
        恋愛運: '庭園。二人きりより、人のいる場で自然に近づけます。',
        総合運: '棺。終わらせるものを決めると、次の流れが入ります。',
      },
    },
    10: {
      cards: [11, 6, 1, 10],
      messages: {
        仕事運: '鞭。同じ問題が出るなら、やり方を変えるサインです。',
        金運: '雲。不安な買い物や契約は、今月は即決しないでください。',
        恋愛運: '騎士。連絡を待つより、自分から軽く動く方が進みます。',
        総合運: '鎌。迷いを切るほど、6月後半の流れがすっきりします。',
      },
    },
    11: {
      cards: [2, 27, 25, 31],
      messages: {
        仕事運: 'クローバー。小さな依頼や偶然の話に、今月の突破口があります。',
        金運: '手紙。支払い内容や連絡を確認すると、無駄を防げます。',
        恋愛運: '指輪。約束を守る姿勢が、相手の安心につながります。',
        総合運: '太陽。明るく見せるほど、周りからの応援が増える月です。',
      },
    },
    12: {
      cards: [12, 1, 20, 9],
      messages: {
        仕事運: '鳥。相談を一人で抱えないこと。話すほど整理されます。',
        金運: '騎士。早めの連絡や手続きが、お金の流れを止めません。',
        恋愛運: '庭園。人のいる場所で、自然に距離が縮まりやすい月です。',
        総合運: '花束。受け取る姿勢を見せると、良い話が入りやすい月です。',
      },
    },
    13: {
      cards: [4, 35, 11, 33],
      messages: {
        仕事運: '家。足元を整えるほど、仕事の判断がぶれなくなります。',
        金運: '錨。続けている貯蓄や管理は、このまま積み上げて正解です。',
        恋愛運: '鞭。同じ不満を繰り返すなら、伝え方を変えてください。',
        総合運: '鍵。一つの突破口から、停滞していた流れが開きます。',
      },
    },
    14: {
      cards: [17, 3, 14, 22],
      messages: {
        仕事運: 'コウノトリ。席替えや手順変更など、小さな変化が効きます。',
        金運: '船。いつもと違う場所や方法に、お金のヒントがあります。',
        恋愛運: '狐。違和感を無理に飲み込まないで。見極めが大事です。',
        総合運: '道。選択肢が増える月。自由より、後悔しない方を選んで。',
      },
    },
    15: {
      cards: [24, 30, 6, 5],
      messages: {
        仕事運: 'ハート。好きだと思える作業ほど、集中力が戻ります。',
        金運: '百合。焦った出費より、落ち着いた買い方が得になります。',
        恋愛運: '雲。不安な時ほど、相手を決めつけないことが大切です。',
        総合運: '木。すぐ結果を出そうとせず、育てる感覚で進める月です。',
      },
    },
    16: {
      cards: [26, 19, 7, 16],
      messages: {
        仕事運: '本。まだ見えていない情報があります。確認してから動いて。',
        金運: '塔。一人で落ち着いて見直すと、削れる出費が見つかります。',
        恋愛運: '蛇。甘い言葉より、言葉と行動が合っているか見てください。',
        総合運: '星。理想は捨てなくて大丈夫。小さく形にする月です。',
      },
    },
    17: {
      cards: [15, 34, 10, 1],
      messages: {
        仕事運: '熊。大事な役目を引き受けるほど、あなたの存在感が強まります。',
        金運: '魚。入る流れはあります。使い道を決めると残りやすいです。',
        恋愛運: '鎌。曖昧な関係は、距離感をはっきりさせる時です。',
        総合運: '騎士。待つより動くこと。先に出した一手が流れを作ります。',
      },
    },
    18: {
      cards: [18, 32, 36, 8],
      messages: {
        仕事運: '犬。信頼できる人との連携が、今月の支えになります。',
        金運: '月。評判や見せ方がお金に影響します。丁寧に整えて。',
        恋愛運: '十字架。背負いすぎる恋は、少し軽くしていい時です。',
        総合運: '棺。終わったものを追わないほど、新しい余白ができます。',
      },
    },
    19: {
      cards: [31, 33, 27, 22],
      messages: {
        仕事運: '太陽。堂々と出すほど評価されます。遠慮しすぎないで。',
        金運: '鍵。収入を増やす突破口は、得意なことを見せる場所にあります。',
        恋愛運: '手紙。短い連絡でも、あなたから送ると空気が変わります。',
        総合運: '道。今月は選べる月。迷ったら、未来が広がる方を選んで。',
      },
    },
    20: {
      cards: [12, 4, 2, 25],
      messages: {
        仕事運: '鳥。打ち合わせや相談の中に、進め方の答えがあります。',
        金運: '家。生活まわりを整えるほど、無駄な出費が減ります。',
        恋愛運: 'クローバー。軽い誘いや偶然の会話が、距離を縮めます。',
        総合運: '指輪。続けると決めたことが、6月後半の安心につながります。',
      },
    },
    21: {
      cards: [20, 1, 31, 9],
      messages: {
        仕事運: '庭園。見せる・伝える仕事ほど、良い反応をもらいやすい月です。',
        金運: '騎士。早めの連絡や申請が、お金の流れをスムーズにします。',
        恋愛運: '太陽。明るく接するほど、相手も素直に反応しやすくなります。',
        総合運: '花束。遠慮せず受け取る姿勢が、6月後半の運を開きます。',
      },
    },
    22: {
      cards: [35, 26, 4, 33],
      messages: {
        仕事運: '錨。地道に続けたことが、信頼として形になります。',
        金運: '本。契約や明細は、見落としがないか確認してください。',
        恋愛運: '家。安心できる会話が、二人の距離を落ち着かせます。',
        総合運: '鍵。突破口は見えています。先延ばしにしないで。',
      },
    },
    23: {
      cards: [13, 2, 27, 17],
      messages: {
        仕事運: '子ども。新しい作業は、小さく試すほど成功しやすいです。',
        金運: 'クローバー。小さな得や割引を拾うと、気分も軽くなります。',
        恋愛運: '手紙。短い連絡でも、素直に送ると流れが動きます。',
        総合運: 'コウノトリ。変化を怖がらないこと。環境を少し動かす月です。',
      },
    },
    24: {
      cards: [24, 18, 25, 5],
      messages: {
        仕事運: 'ハート。心から納得できる仕事ほど、集中して進められます。',
        金運: '犬。信頼できる人の助言が、無駄遣いを防ぐヒントになります。',
        恋愛運: '指輪。約束や継続の話が、関係を一段深めます。',
        総合運: '木。焦らず育てる姿勢が、6月後半の安定につながります。',
      },
    },
    25: {
      cards: [10, 34, 22, 3],
      messages: {
        仕事運: '鎌。やめる作業を決めると、本当に必要な仕事に集中できます。',
        金運: '魚。お金の流れはあります。入った分の使い道を決めて。',
        恋愛運: '道。関係をどう進めたいか、自分の基準をはっきりさせて。',
        総合運: '船。少し遠くの選択肢に、今月の追い風があります。',
      },
    },
    26: {
      cards: [6, 19, 32, 16],
      messages: {
        仕事運: '雲。迷いがある仕事は、急がず情報を整理してください。',
        金運: '塔。少し距離を置いて整理すると、安心できる判断につながります。',
        恋愛運: '月。雰囲気や言葉の温度に、相手の本音が出やすい月です。',
        総合運: '星。理想を具体的な予定に落とすと、希望が現実に近づきます。',
      },
    },
    27: {
      cards: [8, 36, 12, 30],
      messages: {
        仕事運: '棺。終わった役割や古い方法は、手放した方が進みます。',
        金運: '十字架。背負いすぎた支払いは、軽くする方法を探して。',
        恋愛運: '鳥。話し合いを避けないこと。言葉にすると誤解がほどけます。',
        総合運: '百合。落ち着いた対応が、あなたの信頼を守る月です。',
      },
    },
    28: {
      cards: [15, 31, 11, 34],
      messages: {
        仕事運: '熊。任されたことを引き受けるほど、評価が強くなります。',
        金運: '太陽。明るい提案や発信が、お金につながる話を広げます。',
        恋愛運: '鞭。同じ不満を繰り返すなら、言い方を変えてください。',
        総合運: '魚。流れは強め。受け取る準備を整えることが大事です。',
      },
    },
    29: {
      cards: [18, 7, 14, 33],
      messages: {
        仕事運: '犬。信頼できる人と組むことで、負担が軽くなります。',
        金運: '蛇。うまい話ほど、条件を細かく見てから判断して。',
        恋愛運: '狐。違和感を無視しないで。優しさと警戒心の両方が必要です。',
        総合運: '鍵。答えに気づきやすい月。大事なサインは近くにあります。',
      },
    },
    30: {
      cards: [30, 4, 20, 2],
      messages: {
        仕事運: '百合。落ち着いて進めるほど、周囲から信頼されます。',
        金運: '家。生活の土台を整えると、出費の流れも安定します。',
        恋愛運: '庭園。人の集まる場所で、自然な出会いや進展があります。',
        総合運: 'クローバー。小さな幸運を見逃さないことが、次の流れになります。',
      },
    },
    31: {
      cards: [33, 35, 26, 6],
      messages: {
        仕事運: '鍵。今月の仕事は、突破口を一つ見つけると迷いが消えます。',
        金運: '錨。続けている管理や積立は、焦らず守ってください。',
        恋愛運: '本。まだ知らない相手の一面があります。急いで決めないで。',
        総合運: '雲。迷いは悪いものではありません。整理すれば道が見えます。',
      },
    },
  },
};

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function parseArgs(argv) {
  const args = { kind: 'all', month: currentMonth(), rankingPreset: 'flowTop3', rankingTopic: '', days: [] };
  for (const arg of argv) {
    if (arg.startsWith('--kind=')) args.kind = arg.slice('--kind='.length);
    else if (arg.startsWith('--month=')) args.month = arg.slice('--month='.length);
    else if (arg.startsWith('--ranking-preset=')) args.rankingPreset = arg.slice('--ranking-preset='.length);
    else if (arg.startsWith('--ranking-topic=')) args.rankingTopic = arg.slice('--ranking-topic='.length);
    else if (arg.startsWith('--days=')) args.days = parseDays(arg.slice('--days='.length));
  }
  const kinds = ['all', 'monthly', 'monthly-01-10', 'monthly-11-20', 'monthly-21-31', 'monthly-selected', 'ranking', 'aruaru', 'comparison'];
  if (!kinds.includes(args.kind)) throw new Error(`Invalid --kind. Use one of: ${kinds.join(', ')}`);
  if (!/^\d{4}-\d{2}$/.test(args.month)) throw new Error('Invalid --month. Use YYYY-MM.');
  if (!RANKING_PRESETS[args.rankingPreset]) throw new Error(`Invalid --ranking-preset. Use one of: ${Object.keys(RANKING_PRESETS).join(', ')}`);
  if (args.kind === 'monthly-selected' && args.days.length === 0) throw new Error('monthly-selected requires --days=1,2,3');
  return args;
}

function parseDays(value) {
  const days = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31);
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function familyOf(day) {
  let n = day;
  while (n > 9) n = String(n).split('').reduce((sum, digit) => sum + Number(digit), 0);
  return n;
}

function cardPath(no) {
  return path.join(CARD_ROOT, `${String(no).padStart(2, '0')}.jpg`);
}

function miniPath(family) {
  return path.join(MINI_ROOT, `birthday-family-${family}-chibi.png`);
}

function fileUrl(filePath) {
  if (DATA_URL_CACHE.has(filePath)) return DATA_URL_CACHE.get(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
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
  const required = [
    ...Object.values(ASSETS),
    ...range(1, 36).map(cardPath),
    ...range(1, 9).map(miniPath),
  ];
  const missing = required.filter((file) => !fsSync.existsSync(file));
  if (missing.length) throw new Error(`Missing assets:\n${missing.join('\n')}`);
}

function drawFourCards() {
  const pool = range(1, 36);
  const picks = [];
  while (picks.length < 4) {
    const index = crypto.randomInt(pool.length);
    picks.push(pool.splice(index, 1)[0]);
  }
  return picks;
}

function monthlyOverride(month, day) {
  return MONTHLY_READING_OVERRIDES[month]?.[day] || null;
}

function monthlyMessage(card, lane, family) {
  const familyName = FAMILIES[family].title;
  if (lane === '仕事運') return `${card.name}。${familyName}らしく、今月は「${card.copy}」を仕事の判断軸に。`;
  if (lane === '金運') return `${card.name}。出入りを整えるほど、${card.copy}`;
  if (lane === '恋愛運') return `${card.name}。素直な反応が鍵。${card.copy}`;
  return `${card.name}。全体運は、${card.copy}`;
}

function baseHtml(body, extraCss = '') {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    body { font-family: "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif; color: #0f2c3c; }
    .stage { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #f5fbff; }
    .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,.5)); }
    .brand { position: absolute; left: 56px; top: 52px; display: inline-flex; align-items: center; gap: 16px; padding: 14px 20px; border-radius: 12px; background: rgba(255,255,255,.86); box-shadow: 0 10px 30px rgba(20,45,60,.16); font-weight: 900; font-size: 27px; }
    .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: #12384f; color: #fff; font-weight: 900; }
    .pill { display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; border-radius: 999px; background: rgba(19,56,79,.92); color: #fff; font-size: 24px; font-weight: 900; }
    .gold { color: #f0cd78; }
    .red { color: #b83e5a; }
    .small { font-size: 24px; line-height: 1.45; }
    .url { position: absolute; right: 54px; bottom: 34px; color: rgba(255,255,255,.96); text-shadow: 0 3px 14px rgba(0,0,0,.55); font-weight: 900; font-size: 22px; }
    ${extraCss}
  </style>
</head>
<body>${body}</body>
</html>`;
}

function brand() {
  return `<div class="brand"><div class="mark">R</div><div>羅針占術</div></div>`;
}

function monthlyCoverHtml(part, month) {
  return baseHtml(`
    <div class="stage">
      <img class="bg" src="${fileUrl(ASSETS.lenormandBase)}">
      <div class="cover-shade"></div>
      ${brand()}
      <div class="cover-pill">${esc(month)} 月運</div>
      <main class="monthly-cover-panel">
        <h1>${esc(part.label)}<br>今月の占い</h1>
        <p>ルノルマンカード4枚で<br>仕事・金運・恋愛・総合運を読む</p>
      </main>
      <div class="monthly-range">${esc(part.label)}</div>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .cover-shade { position:absolute; inset:0; background: linear-gradient(180deg, rgba(7,22,36,.10) 0%, rgba(7,22,36,.18) 43%, rgba(7,22,36,.72) 100%); }
    .cover-pill { position:absolute; left: 58px; top: 180px; display:inline-flex; align-items:center; justify-content:center; padding: 10px 18px; border-radius:999px; background: rgba(18,56,79,.94); color:#fff; font-size: 26px; font-weight: 900; box-shadow: 0 10px 24px rgba(0,0,0,.20); }
    .monthly-cover-panel { position: absolute; left: 58px; bottom: 165px; width: 820px; padding: 30px 34px 32px; border-radius: 20px; background: rgba(9,31,49,.90); box-shadow: 0 18px 45px rgba(0,0,0,.30); border: 1px solid rgba(255,255,255,.16); }
    .monthly-cover-panel h1 { margin: 0 0 18px; font-size: 72px; line-height: 1.05; letter-spacing: 0; color: #fff; text-shadow: 0 5px 18px rgba(0,0,0,.42); }
    .monthly-cover-panel p { margin: 0; color: #eef8ff; font-size: 32px; line-height: 1.42; font-weight: 900; text-shadow: 0 3px 14px rgba(0,0,0,.32); }
    .monthly-range { position: absolute; left: 58px; bottom: 76px; padding: 14px 22px; border-radius: 14px; background: rgba(255,255,255,.92); color: #12384f; font-size: 32px; font-weight: 900; box-shadow: 0 10px 24px rgba(0,0,0,.18); }
  `);
}

function monthlyDayHtml({ day, month, cards }) {
  const family = familyOf(day);
  const familyData = FAMILIES[family];
  const override = monthlyOverride(month, day);
  const cardRows = cards.map((cardNo, index) => {
    const card = LENORMAND[cardNo - 1];
    const lane = LANES[index];
    const message = override?.messages?.[lane] || monthlyMessage(card, lane, family);
    return `
      <article class="card-row">
        <img src="${fileUrl(cardPath(cardNo))}" alt="">
        <div>
          <div class="lane">${esc(lane)}<span>${String(cardNo).padStart(2, '0')} ${esc(card.name)}</span></div>
          <p>${esc(message)}</p>
        </div>
      </article>`;
  }).join('');
  return baseHtml(`
    <div class="stage">
      <img class="bg" src="${fileUrl(ASSETS.lenormandBase)}">
      <div class="monthly-glass"></div>
      ${brand()}
      <img class="mini" src="${fileUrl(miniPath(family))}" alt="">
      <main class="monthly-panel">
        <div class="pill">${esc(month)} / ${esc(familyData.label)}</div>
        <h1>${day}日生まれの<br>今月占い</h1>
        <div class="family-copy">${esc(familyData.title)}タイプ</div>
        <section class="rows">${cardRows}</section>
      </main>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .monthly-glass { position:absolute; inset: 0; background: linear-gradient(90deg, rgba(8,28,44,.84), rgba(8,28,44,.62) 54%, rgba(8,28,44,.24)); }
    .monthly-panel { position: absolute; left: 58px; top: 160px; width: 680px; color: #fff; }
    .monthly-panel h1 { margin: 20px 0 10px; font-size: 64px; line-height: 1.08; letter-spacing: 0; color: #fff; text-shadow: 0 5px 22px rgba(0,0,0,.45); }
    .family-copy { display:inline-flex; margin: 4px 0 20px; padding: 8px 18px; border-radius: 12px; background: rgba(255,255,255,.88); color: ${familyData.color}; font-size: 27px; font-weight: 900; }
    .rows { display:grid; gap: 14px; }
    .card-row { display:grid; grid-template-columns: 92px 1fr; gap: 16px; min-height: 132px; padding: 14px; border-radius: 16px; background: rgba(255,255,255,.92); color: #15384b; box-shadow: 0 12px 28px rgba(0,0,0,.20); }
    .card-row img { width: 92px; height: 122px; object-fit: cover; border-radius: 8px; box-shadow: 0 5px 14px rgba(0,0,0,.2); }
    .lane { display:flex; align-items: baseline; gap: 12px; font-size: 26px; font-weight: 900; color: #b83e5a; }
    .lane span { color: #12384f; font-size: 21px; }
    .card-row p { margin: 7px 0 0; font-size: 23px; line-height: 1.38; font-weight: 800; }
    .mini { position: absolute; right: 12px; bottom: 90px; width: 390px; max-height: 680px; object-fit: contain; filter: drop-shadow(0 18px 24px rgba(0,0,0,.38)); }
  `);
}

function rankingDecor(theme) {
  if (theme === 'money') {
    return `
      <div class="ranking-bgfx money-bgfx" aria-hidden="true">
        ${Array.from({ length: 18 }, (_, index) => `<i class="coin coin-${index + 1}">&#165;</i>`).join('')}
        ${Array.from({ length: 12 }, (_, index) => `<b class="spark spark-${index + 1}"></b>`).join('')}
      </div>`;
  }
  if (theme === 'horror') {
    return `
      <div class="ranking-bgfx horror-bgfx" aria-hidden="true">
        <i class="moon"></i>
        <i class="fog fog-1"></i>
        <i class="fog fog-2"></i>
        <i class="fog fog-3"></i>
        <i class="shadow shadow-1"></i>
        <i class="shadow shadow-2"></i>
        <i class="shadow shadow-3"></i>
      </div>`;
  }
  return '';
}

function rankingHtml({ month, preset, topic }) {
  const ranks = preset.ranks;
  const isTop5 = ranks.length > 3;
  const theme = preset.theme || 'default';
  const rows = ranks.map((item) => {
    const family = familyOf(item.day);
    return `
      <article class="rank-card rank-${item.rank}">
        <div class="rank-no">${item.rank}位</div>
        <img src="${fileUrl(miniPath(family))}" alt="">
        <div class="rank-text">
          <h2>${item.day}日生まれ</h2>
          <strong>${esc(item.type)}</strong>
          <p>${esc(item.note)}</p>
        </div>
      </article>`;
  }).join('');
  return baseHtml(`
    <div class="stage ranking-stage ranking-theme-${theme}">
      <img class="bg" src="${fileUrl(ASSETS.rankingBase)}">
      ${rankingDecor(theme)}
      <div class="ranking-wash"></div>
      ${brand()}
      <main class="ranking ${isTop5 ? 'ranking-top5' : ''}">
        <div class="pill">誕生日数ランキング</div>
        <h1>${esc(topic || preset.topic)}</h1>
        <section>${rows}</section>
        <div class="mentions">${esc(preset.mentions)}</div>
      </main>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .ranking-wash { position:absolute; inset:0; background: linear-gradient(90deg, rgba(255,255,255,.96), rgba(255,255,255,.80) 58%, rgba(255,255,255,.16)); }
    .ranking-bgfx { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
    .ranking-theme-money { background:
      radial-gradient(circle at 78% 16%, rgba(255,238,144,.98) 0 0, transparent 170px),
      radial-gradient(circle at 92% 74%, rgba(209,139,28,.85) 0 0, transparent 260px),
      linear-gradient(135deg, #fff3b8 0%, #d99d2f 48%, #7a4610 100%);
    }
    .ranking-theme-money .bg { opacity:.18; filter:saturate(1.35) contrast(1.08); mix-blend-mode:screen; }
    .ranking-theme-money .ranking-wash { background: linear-gradient(90deg, rgba(255,252,232,.95), rgba(255,239,174,.78) 56%, rgba(184,115,17,.22)); }
    .coin { position:absolute; display:grid; place-items:center; width:94px; height:94px; border-radius:50%; background:
      radial-gradient(circle at 32% 26%, #fff7be 0 14%, transparent 15%),
      radial-gradient(circle, #ffe277 0 48%, #d09320 49% 70%, #8e5412 71% 100%);
      color:#8d5310; font-size:42px; font-weight:1000; border:6px solid rgba(255,247,179,.78); box-shadow:0 16px 30px rgba(98,54,4,.30), inset 0 -8px 0 rgba(120,71,7,.20);
      opacity:.9;
    }
    .coin-1 { right:58px; top:74px; transform:rotate(-16deg) scale(1.18); }
    .coin-2 { right:198px; top:142px; transform:rotate(11deg) scale(.82); }
    .coin-3 { right:18px; top:248px; transform:rotate(23deg) scale(.74); }
    .coin-4 { right:128px; top:358px; transform:rotate(-8deg) scale(1.02); }
    .coin-5 { right:18px; top:484px; transform:rotate(16deg) scale(.88); }
    .coin-6 { right:192px; top:606px; transform:rotate(-22deg) scale(.78); }
    .coin-7 { right:50px; top:730px; transform:rotate(9deg) scale(1.2); }
    .coin-8 { right:188px; top:880px; transform:rotate(30deg) scale(.95); }
    .coin-9 { right:24px; bottom:116px; transform:rotate(-12deg) scale(.82); }
    .coin-10 { right:150px; bottom:42px; transform:rotate(17deg) scale(1.08); }
    .coin-11 { left:30px; top:1032px; transform:rotate(-18deg) scale(.64); }
    .coin-12 { left:220px; top:42px; transform:rotate(14deg) scale(.54); opacity:.55; }
    .coin-13 { left:20px; top:80px; transform:rotate(6deg) scale(.46); opacity:.48; }
    .coin-14 { right:312px; top:34px; transform:rotate(-28deg) scale(.58); opacity:.52; }
    .coin-15 { right:286px; top:1160px; transform:rotate(24deg) scale(.7); opacity:.66; }
    .coin-16 { right:18px; top:1050px; transform:rotate(-20deg) scale(.58); opacity:.55; }
    .coin-17 { left:74px; top:1180px; transform:rotate(12deg) scale(.52); opacity:.46; }
    .coin-18 { right:350px; top:472px; transform:rotate(5deg) scale(.5); opacity:.42; }
    .spark { position:absolute; width:26px; height:26px; background:#fff6b1; transform:rotate(45deg); box-shadow:0 0 22px #fff2a0; opacity:.82; }
    .spark-1 { right:118px; top:210px; } .spark-2 { right:288px; top:260px; } .spark-3 { right:84px; top:622px; }
    .spark-4 { right:286px; top:744px; } .spark-5 { right:92px; top:1028px; } .spark-6 { right:402px; top:116px; }
    .spark-7 { left:170px; top:118px; transform:rotate(45deg) scale(.55); opacity:.5; } .spark-8 { left:70px; top:1090px; transform:rotate(45deg) scale(.7); }
    .spark-9 { right:236px; bottom:128px; transform:rotate(45deg) scale(.62); } .spark-10 { right:26px; top:380px; transform:rotate(45deg) scale(.58); }
    .spark-11 { right:352px; top:992px; transform:rotate(45deg) scale(.56); } .spark-12 { right:394px; top:640px; transform:rotate(45deg) scale(.48); }
    .ranking-theme-money .rank-no { color:#ffd866; text-shadow:0 2px 0 #5b3307, 0 0 12px rgba(255,208,62,.45); }
    .ranking-theme-money .mentions { background:rgba(103,62,7,.92); }
    .ranking-theme-horror { background:
      radial-gradient(circle at 78% 18%, rgba(210,220,222,.72) 0 0, transparent 118px),
      radial-gradient(circle at 70% 66%, rgba(91,63,122,.46) 0 0, transparent 380px),
      linear-gradient(150deg, #111525 0%, #1f263d 43%, #3d2142 100%);
    }
    .ranking-theme-horror .bg { opacity:.12; filter:grayscale(.45) contrast(1.18) brightness(.56); mix-blend-mode:screen; }
    .ranking-theme-horror .ranking-wash { background:
      radial-gradient(circle at 82% 16%, rgba(255,255,255,.10), transparent 150px),
      linear-gradient(90deg, rgba(246,249,252,.94), rgba(221,226,236,.78) 55%, rgba(20,17,32,.36));
    }
    .moon { position:absolute; right:108px; top:76px; width:150px; height:150px; border-radius:50%; background:radial-gradient(circle at 38% 34%, #f7f5dc, #bfc6cc 72%); box-shadow:0 0 58px rgba(232,232,214,.42); opacity:.82; }
    .moon::after { content:""; position:absolute; right:26px; top:24px; width:120px; height:120px; border-radius:50%; background:#20253b; opacity:.55; }
    .fog { position:absolute; left:520px; width:680px; height:82px; border-radius:999px; background:rgba(229,235,239,.18); filter:blur(16px); }
    .fog-1 { top:272px; transform:rotate(-7deg); }
    .fog-2 { top:610px; transform:rotate(6deg); opacity:.72; }
    .fog-3 { bottom:126px; transform:rotate(-4deg); opacity:.58; }
    .shadow { position:absolute; bottom:0; background:linear-gradient(180deg, rgba(12,10,20,.8), rgba(5,5,10,.96)); filter:drop-shadow(0 0 18px rgba(0,0,0,.45)); opacity:.88; }
    .shadow-1 { right:92px; width:42px; height:520px; clip-path:polygon(44% 0, 56% 0, 70% 100%, 22% 100%); }
    .shadow-2 { right:238px; width:56px; height:430px; clip-path:polygon(45% 0, 58% 0, 82% 100%, 18% 100%); opacity:.7; }
    .shadow-3 { right:0; width:230px; height:265px; clip-path:polygon(0 80%, 18% 44%, 36% 72%, 54% 38%, 75% 74%, 100% 26%, 100% 100%, 0 100%); opacity:.8; }
    .ranking-theme-horror .rank-no { color:#d8d7e8; text-shadow:0 2px 0 #2a1532, 0 0 14px rgba(90,65,130,.45); }
    .ranking-theme-horror .mentions { background:rgba(38,29,56,.94); }
    .ranking { position:absolute; left: 58px; top: 152px; width: 860px; }
    .ranking h1 { width: 760px; margin: 20px 0 26px; font-size: 58px; line-height: 1.12; letter-spacing: 0; color:#12384f; }
    .ranking section { display:grid; gap: 17px; }
    .rank-card { display:grid; grid-template-columns: 86px 130px 1fr; align-items:center; min-height: 190px; padding: 16px 22px; border-radius: 18px; background: rgba(255,255,255,.92); box-shadow: 0 14px 34px rgba(16,45,64,.16); border: 1px solid rgba(18,56,79,.10); }
    .rank-no { font-size: 36px; font-weight: 1000; color: #f0bd56; text-shadow: 0 2px 0 #12384f; }
    .rank-card img { width: 122px; height: 162px; object-fit: contain; filter: drop-shadow(0 8px 12px rgba(18,56,79,.20)); }
    .rank-text h2 { margin: 0 0 4px; color: #b83e5a; font-size: 40px; line-height: 1.05; }
    .rank-text strong { display:block; color:#12384f; font-size: 29px; line-height:1.25; }
    .rank-text p { margin: 8px 0 0; color:#1f4355; font-size: 24px; line-height: 1.35; font-weight: 800; }
    .mentions { margin-top: 22px; display:inline-block; padding: 10px 18px; border-radius: 12px; background: rgba(18,56,79,.92); color: #fff; font-size: 26px; font-weight: 900; }
    .ranking-top5 { top: 140px; width: 930px; }
    .ranking-top5 h1 { width: 860px; margin: 18px 0 20px; font-size: 52px; }
    .ranking-top5 section { gap: 11px; }
    .ranking-top5 .rank-card { grid-template-columns: 72px 118px 1fr; min-height: 146px; padding: 10px 16px; border-radius: 15px; }
    .ranking-top5 .rank-no { font-size: 31px; }
    .ranking-top5 .rank-card img { width: 110px; height: 132px; }
    .ranking-top5 .rank-text h2 { font-size: 31px; margin-bottom: 2px; }
    .ranking-top5 .rank-text strong { font-size: 24px; line-height: 1.16; }
    .ranking-top5 .rank-text p { margin-top: 5px; font-size: 19px; line-height: 1.26; }
    .ranking-top5 .mentions { margin-top: 16px; max-width: 860px; font-size: 22px; line-height: 1.28; }
  `);
}

function aruaruCoverHtml() {
  return baseHtml(`
    <div class="stage">
      <img class="bg" src="${fileUrl(ASSETS.aruaruBase)}">
      <div class="aruaru-wash"></div>
      ${brand()}
      <main class="aruaru-cover">
        <div class="pill">誕生日数あるある</div>
        <h1>1〜9系の<br>基本ステータス</h1>
        <p>当たり外れより、あなたの扱い方を知るための保存版。</p>
      </main>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .aruaru-wash { position:absolute; inset:0; background: linear-gradient(90deg, rgba(255,255,255,.94), rgba(255,255,255,.75), rgba(255,255,255,.08)); }
    .aruaru-cover { position:absolute; left: 58px; top: 186px; width: 690px; }
    .aruaru-cover h1 { margin: 26px 0 20px; font-size: 78px; line-height:1.06; letter-spacing:0; color:#12384f; }
    .aruaru-cover p { width: 580px; margin: 0; font-size: 34px; line-height:1.42; font-weight:900; color:#294b5d; }
  `);
}

function aruaruFamilyHtml(family) {
  const data = FAMILIES[family];
  const points = data.aruaru.map((item) => `<li>${esc(item)}</li>`).join('');
  return baseHtml(`
    <div class="stage">
      <img class="bg" src="${fileUrl(ASSETS.aruaruBase)}">
      <div class="aruaru-family-wash"></div>
      ${brand()}
      <img class="aruaru-mini" src="${fileUrl(miniPath(family))}" alt="">
      <main class="aruaru-panel">
        <div class="pill">${esc(data.label)} / 誕生日数</div>
        <h1>${esc(data.title)}</h1>
        <ul>${points}</ul>
        <p class="bottom-copy">保存して、身近な人の扱い方にも使ってください。</p>
      </main>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .aruaru-family-wash { position:absolute; inset:0; background: linear-gradient(90deg, rgba(255,255,255,.96), rgba(255,255,255,.82) 55%, rgba(255,255,255,.24)); }
    .aruaru-panel { position:absolute; left: 58px; top: 170px; width: 650px; }
    .aruaru-panel h1 { margin: 22px 0 28px; font-size: 76px; line-height:1.02; color:${data.color}; letter-spacing:0; text-shadow: 0 2px 0 rgba(255,255,255,.8); }
    .aruaru-panel ul { margin:0; padding:0; list-style:none; display:grid; gap: 18px; }
    .aruaru-panel li { position:relative; padding: 20px 22px 20px 58px; border-radius: 16px; background: rgba(255,255,255,.94); color:#12384f; font-size: 31px; font-weight: 900; line-height:1.28; box-shadow: 0 12px 28px rgba(20,45,60,.14); }
    .aruaru-panel li::before { content:""; position:absolute; left:22px; top:29px; width:18px; height:18px; border-radius:50%; background:${data.color}; box-shadow: 0 0 0 5px rgba(18,56,79,.07); }
    .bottom-copy { margin-top: 26px; color:#294b5d; font-size: 26px; line-height:1.36; font-weight:900; }
    .aruaru-mini { position:absolute; right: 38px; bottom: 98px; width: 370px; max-height: 660px; object-fit: contain; filter: drop-shadow(0 18px 25px rgba(18,56,79,.26)); }
  `);
}

function whatRashinShowsHtml() {
  const items = [
    ['本質', '生まれ持った傾向と、無理しやすい癖'],
    ['本音', '言葉にしづらい不安・望み・違和感'],
    ['現実', '今どこで詰まっていて、何が動いているか'],
    ['次の一手', '今日から変えられる具体的な行動'],
  ];
  const rows = items.map(([title, copy]) => `
    <article>
      <strong>${esc(title)}</strong>
      <p>${esc(copy)}</p>
    </article>
  `).join('');
  return baseHtml(`
    <div class="stage">
      <img class="bg" src="${fileUrl(ASSETS.whatBase)}">
      <div class="what-overlay"></div>
      ${brand()}
      <main class="what-panel">
        <div class="pill">鑑定で見えること</div>
        <h1>羅針占術で<br>何が見える？</h1>
        <section>${rows}</section>
      </main>
      <div class="what-bottom">当てるだけで終わらせず、次に動ける形へ。</div>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .what-overlay { position:absolute; inset:0; background: linear-gradient(90deg, rgba(5,18,34,.88), rgba(5,18,34,.70) 58%, rgba(5,18,34,.18)); }
    .what-panel { position:absolute; left: 58px; top: 154px; width: 705px; color:#fff; }
    .what-panel h1 { margin: 22px 0 26px; color:#fff; font-size: 72px; line-height:1.06; letter-spacing:0; text-shadow: 0 5px 20px rgba(0,0,0,.5); }
    .what-panel section { display:grid; gap: 16px; }
    .what-panel article { padding: 18px 22px; border-radius: 16px; background: rgba(255,255,255,.92); color:#12384f; box-shadow: 0 12px 30px rgba(0,0,0,.22); }
    .what-panel strong { display:block; color:#b83e5a; font-size: 34px; line-height:1.05; }
    .what-panel p { margin: 7px 0 0; font-size: 26px; line-height:1.34; font-weight:900; }
    .what-bottom { position:absolute; left: 62px; bottom: 104px; padding: 13px 20px; border-radius: 12px; color:#fff; background: rgba(18,56,79,.86); font-size: 29px; line-height:1.25; font-weight:900; box-shadow: 0 10px 24px rgba(0,0,0,.24); }
  `);
}

function miniPreviewHtml() {
  const minis = range(1, 9).map((family) => `
    <article>
      <img src="${fileUrl(miniPath(family))}" alt="">
      <strong>${esc(FAMILIES[family].label)}</strong>
    </article>
  `).join('');
  return baseHtml(`
    <div class="stage preview-stage">
      ${brand()}
      <h1>誕生日数ミニキャラ 1〜9系</h1>
      <section>${minis}</section>
    </div>
  `, `
    .preview-stage { background:
      linear-gradient(45deg, #dbe9f2 25%, transparent 25%),
      linear-gradient(-45deg, #dbe9f2 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #dbe9f2 75%),
      linear-gradient(-45deg, transparent 75%, #dbe9f2 75%);
      background-size: 58px 58px;
      background-position: 0 0, 0 29px, 29px -29px, -29px 0;
      background-color: #f6fbff;
    }
    .preview-stage h1 { position:absolute; left:58px; top:150px; margin:0; color:#12384f; font-size:56px; line-height:1.1; letter-spacing:0; }
    .preview-stage section { position:absolute; left:48px; right:48px; top:270px; display:grid; grid-template-columns: repeat(3, 1fr); gap:18px; }
    .preview-stage article { height: 300px; border-radius:16px; background: rgba(255,255,255,.78); display:grid; place-items:center; position:relative; box-shadow: 0 12px 28px rgba(20,45,60,.13); overflow:hidden; }
    .preview-stage img { max-width: 92%; max-height: 252px; object-fit: contain; filter: drop-shadow(0 10px 14px rgba(20,45,60,.18)); }
    .preview-stage strong { position:absolute; left:16px; top:12px; display:grid; place-items:center; min-width:54px; height:38px; padding:0 12px; border-radius:999px; background:#12384f; color:#fff; font-size:20px; }
  `);
}

async function writeShot(page, html, outPath, format = 'jpeg') {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: outPath,
    type: format,
    quality: format === 'jpeg' ? QUALITY : undefined,
  });
  return outPath;
}

async function copyComparisonAssets(outDir) {
  await fs.mkdir(outDir, { recursive: true });
  await fs.copyFile(ASSETS.difference, path.join(outDir, '01-difference.jpg'));
  await fs.copyFile(ASSETS.freePaid, path.join(outDir, '03-free-paid-compare.jpg'));
}

async function generateMonthly(page, month) {
  const monthDir = path.join(OUT_ROOT, month, 'monthly');
  const manifest = { month, generatedAt: new Date().toISOString(), parts: [] };
  for (const part of MONTHLY_PARTS) {
    const outDir = path.join(monthDir, part.key);
    await writeShot(page, monthlyCoverHtml(part, month), path.join(outDir, '00-cover.jpg'));
    const slides = [];
    for (const day of part.days) {
      const override = monthlyOverride(month, day);
      const picks = override?.cards || drawFourCards();
      const fileName = `${String(day).padStart(2, '0')}-birth-${String(day).padStart(2, '0')}.jpg`;
      await writeShot(page, monthlyDayHtml({ day, month, cards: picks }), path.join(outDir, fileName));
      slides.push({
        day,
        family: familyOf(day),
        file: path.relative(ROOT, path.join(outDir, fileName)).replaceAll('\\', '/'),
        cards: picks.map((no, index) => ({
          lane: LANES[index],
          no,
          name: LENORMAND[no - 1].name,
          message: override?.messages?.[LANES[index]] || monthlyMessage(LENORMAND[no - 1], LANES[index], familyOf(day)),
        })),
      });
    }
    manifest.parts.push({ key: part.key, label: part.label, slides });
  }
  await fs.writeFile(path.join(monthDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return monthDir;
}

async function generateMonthlyPart(page, month, part) {
  const outDir = path.join(OUT_ROOT, month, 'monthly', part.key);
  await writeShot(page, monthlyCoverHtml(part, month), path.join(outDir, '00-cover.jpg'));
  const manifest = { month, generatedAt: new Date().toISOString(), part: { key: part.key, label: part.label, slides: [] } };
  for (const day of part.days) {
    const override = monthlyOverride(month, day);
    const picks = override?.cards || drawFourCards();
    const fileName = `${String(day).padStart(2, '0')}-birth-${String(day).padStart(2, '0')}.jpg`;
    const outPath = path.join(outDir, fileName);
    await writeShot(page, monthlyDayHtml({ day, month, cards: picks }), outPath);
    manifest.part.slides.push({
      day,
      family: familyOf(day),
      file: path.relative(ROOT, outPath).replaceAll('\\', '/'),
      cards: picks.map((no, index) => ({
        lane: LANES[index],
        no,
        name: LENORMAND[no - 1].name,
        message: override?.messages?.[LANES[index]] || monthlyMessage(LENORMAND[no - 1], LANES[index], familyOf(day)),
      })),
    });
  }
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return outDir;
}

function monthlyPartForDay(day) {
  return MONTHLY_PARTS.find((part) => part.days.includes(day));
}

function monthlySlideRecord(month, day, outPath, picks) {
  const override = monthlyOverride(month, day);
  return {
    day,
    family: familyOf(day),
    file: path.relative(ROOT, outPath).replaceAll('\\', '/'),
    cards: picks.map((no, index) => ({
      lane: LANES[index],
      no,
      name: LENORMAND[no - 1].name,
      message: override?.messages?.[LANES[index]] || monthlyMessage(LENORMAND[no - 1], LANES[index], familyOf(day)),
    })),
  };
}

async function readJsonIfExists(filePath, fallback) {
  if (!fsSync.existsSync(filePath)) return fallback;
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function upsertSlide(slides, record) {
  const index = slides.findIndex((slide) => slide.day === record.day);
  if (index >= 0) slides[index] = record;
  else slides.push(record);
  slides.sort((a, b) => a.day - b.day);
}

async function updateMonthlyManifests(month, recordsByPart) {
  const monthDir = path.join(OUT_ROOT, month, 'monthly');
  const fullManifestPath = path.join(monthDir, 'manifest.json');
  const fullManifest = await readJsonIfExists(fullManifestPath, { month, generatedAt: new Date().toISOString(), parts: [] });
  fullManifest.generatedAt = new Date().toISOString();

  for (const [partKey, records] of recordsByPart.entries()) {
    const part = MONTHLY_PARTS.find((item) => item.key === partKey);
    const outDir = path.join(monthDir, part.key);
    const partManifestPath = path.join(outDir, 'manifest.json');
    const partManifest = await readJsonIfExists(partManifestPath, {
      month,
      generatedAt: new Date().toISOString(),
      part: { key: part.key, label: part.label, slides: [] },
    });
    partManifest.generatedAt = new Date().toISOString();
    partManifest.part.key = part.key;
    partManifest.part.label = part.label;

    let fullPart = fullManifest.parts.find((item) => item.key === part.key);
    if (!fullPart) {
      fullPart = { key: part.key, label: part.label, slides: [] };
      fullManifest.parts.push(fullPart);
    }
    fullPart.label = part.label;

    for (const record of records) {
      upsertSlide(partManifest.part.slides, record);
      upsertSlide(fullPart.slides, record);
    }

    await fs.writeFile(partManifestPath, JSON.stringify(partManifest, null, 2), 'utf8');
  }

  fullManifest.parts.sort((a, b) => MONTHLY_PARTS.findIndex((part) => part.key === a.key) - MONTHLY_PARTS.findIndex((part) => part.key === b.key));
  await fs.writeFile(fullManifestPath, JSON.stringify(fullManifest, null, 2), 'utf8');
}

async function generateMonthlySelected(page, month, days) {
  const recordsByPart = new Map();
  const outputFiles = [];
  for (const day of days) {
    const part = monthlyPartForDay(day);
    const outDir = path.join(OUT_ROOT, month, 'monthly', part.key);
    const override = monthlyOverride(month, day);
    const picks = override?.cards || drawFourCards();
    const fileName = `${String(day).padStart(2, '0')}-birth-${String(day).padStart(2, '0')}.jpg`;
    const outPath = path.join(outDir, fileName);
    await writeShot(page, monthlyDayHtml({ day, month, cards: picks }), outPath);
    const record = monthlySlideRecord(month, day, outPath, picks);
    if (!recordsByPart.has(part.key)) recordsByPart.set(part.key, []);
    recordsByPart.get(part.key).push(record);
    outputFiles.push(outPath);
  }
  await updateMonthlyManifests(month, recordsByPart);
  return outputFiles.join('\n');
}

async function generateRanking(page, month, rankingPreset, topic) {
  const outDir = path.join(OUT_ROOT, month, 'ranking');
  const preset = RANKING_PRESETS[rankingPreset];
  return writeShot(page, rankingHtml({ month, preset, topic }), path.join(outDir, preset.filename));
}

async function generateAruaru(page) {
  const outDir = path.join(OUT_ROOT, 'evergreen', 'aruaru');
  await writeShot(page, aruaruCoverHtml(), path.join(outDir, '00-cover.jpg'));
  for (const family of range(1, 9)) {
    await writeShot(page, aruaruFamilyHtml(family), path.join(outDir, `${String(family).padStart(2, '0')}-family-${family}.jpg`));
  }
  return outDir;
}

async function generateComparison(page) {
  const outDir = path.join(OUT_ROOT, 'evergreen', 'comparison');
  await copyComparisonAssets(outDir);
  await writeShot(page, whatRashinShowsHtml(), path.join(outDir, '02-what-rashin-shows.jpg'));
  return outDir;
}

async function generatePreview(page) {
  const outDir = path.join(OUT_ROOT, 'preview');
  return writeShot(page, miniPreviewHtml(), path.join(outDir, 'birthday-mini-preview.jpg'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureAssets();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const outputs = [];
  try {
    if (args.kind === 'all' || args.kind === 'monthly') outputs.push(await generateMonthly(page, args.month));
    if (args.kind === 'monthly-01-10') outputs.push(await generateMonthlyPart(page, args.month, MONTHLY_PARTS[0]));
    if (args.kind === 'monthly-11-20') outputs.push(await generateMonthlyPart(page, args.month, MONTHLY_PARTS[1]));
    if (args.kind === 'monthly-21-31') outputs.push(await generateMonthlyPart(page, args.month, MONTHLY_PARTS[2]));
    if (args.kind === 'monthly-selected') outputs.push(await generateMonthlySelected(page, args.month, args.days));
    if (args.kind === 'all' || args.kind === 'ranking') outputs.push(await generateRanking(page, args.month, args.rankingPreset, args.rankingTopic));
    if (args.kind === 'all' || args.kind === 'aruaru') outputs.push(await generateAruaru(page));
    if (args.kind === 'all' || args.kind === 'comparison') outputs.push(await generateComparison(page));
    outputs.push(await generatePreview(page));
  } finally {
    await browser.close();
  }
  console.log(`Generated ${outputs.length} output groups:`);
  for (const output of outputs) console.log(`- ${output}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
