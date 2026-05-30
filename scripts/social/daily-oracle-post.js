const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const readline = require('readline/promises');
const threadsClient = require('./threads-client');
const blueskyClient = require('./bluesky-client');
const instagramClient = require('./instagram-client');
const postLedger = require('./post-ledger');
const { LENORMAND_EMPATHY_POSTS } = require('./content/lenormand-empathy-posts');
const { ORACLE_CARD_COPY } = require('./content/oracle-card-copy');
const { DIFFERENCE_POSTS } = require('./content/difference-posts');
const { FREE_PAID_COMPARE_POSTS } = require('./content/free-paid-compare-posts');
const { THREAD_QUESTION_POSTS } = require('./content/thread-question-posts');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_JS = path.join(ROOT, 'app.js');
const OUT_DIR = path.join(ROOT, 'data', 'social-posts');
const STATE_FILE = path.join(OUT_DIR, 'daily-oracle-state.json');
const DEFAULT_PUBLIC_ORIGIN = 'https://rashin-senjutsu.onrender.com';
const DEFAULT_HASHTAG = '#羅針占術';
const DEFAULT_THREADS_HASHTAG = '#占い師のつぶやき';
const DEFAULT_BLUESKY_HASHTAGS = '#羅針占術 #今日の占い #今日の運勢 #占い師';
const DEFAULT_SOCIAL_PLATFORMS = 'threads,bluesky,instagram';
const INSTAGRAM_HASHTAG_LIMIT = 5;
const DEFAULT_INSTAGRAM_HASHTAGS_BY_KIND = Object.freeze({
  oracle: ['#羅針占術', '#今日の占い', '#オラクルカード', '#占い好きな人と繋がりたい', '#AI占い'],
  empathy: ['#羅針占術', '#ルノルマンカード', '#今日の占い', '#カード占い', '#AI占い'],
  question: ['#羅針占術', '#悩み相談', '#占い好きな人と繋がりたい', '#今日の占い', '#AI占い'],
  difference: ['#羅針占術', '#AI占い', '#無料占い', '#占い師のつぶやき', '#悩み相談'],
  free_paid_compare: ['#羅針占術', '#無料占い', '#占い師のつぶやき', '#ルノルマンカード', '#AI占い'],
  midday: ['#羅針占術', '#AI占い', '#無料占い', '#悩み相談', '#占い好きな人と繋がりたい'],
  concept: ['#羅針占術', '#AI占い', '#無料占い', '#占い師のつぶやき', '#悩み相談'],
});
const THREADS_CHARACTER_LIMIT = 500;
const INSTAGRAM_CHARACTER_LIMIT = instagramClient.INSTAGRAM_CHARACTER_LIMIT;
const X_CHARACTER_LIMIT = 280;
const BLUESKY_CHARACTER_LIMIT = 300;
const X_ORACLE_HASHTAGS = [
  '#おはようVtuber',
  '#羅針占術',
  '#今日の占い',
  '#今日の一枚',
  '#オラクルカード',
];
const DEFAULT_SOCIAL_CAMPAIGN = '202605_prerelease';
const PRERELEASE_START_DATE = '2026-05-16';
const PRERELEASE_END_DATE = '2026-05-29';
const FIX_PERIOD_END_DATE = '2026-06-05';
const FULL_RELEASE_DATE = '2026-06-06';
const RELEASE_DATE = PRERELEASE_START_DATE;
const CARD_CYCLE_START_DATE = '2026-05-12';
const SOCIAL_EXPANSION_START_DATE = process.env.SOCIAL_EXPANSION_START_DATE || '2026-05-27';
const CONTENT_CYCLE_START_DATE = process.env.SOCIAL_CONTENT_CYCLE_START_DATE || SOCIAL_EXPANSION_START_DATE;
const ORACLE_CARD_CYCLE_LENGTH = 33;
const SOCIAL_PAID_CTA_MODES = new Set(['off', 'soft', 'active']);
const SOCIAL_RELEASE_MODES = new Set(['auto', 'prelaunch', 'prerelease', 'fix', 'release', 'launch', 'postrelease']);
const SOCIAL_POST_KINDS = ['oracle', 'empathy', 'question', 'difference', 'free_paid_compare'];
const LEGACY_SOCIAL_POST_KINDS = ['midday', 'concept'];
const DRAFT_POST_KINDS = [...SOCIAL_POST_KINDS, ...LEGACY_SOCIAL_POST_KINDS];
const THREADS_MATCHED_PLATFORM_KINDS = new Set(['oracle', 'empathy', 'difference', 'free_paid_compare']);
const RESULT_SUFFIX_BY_KIND = {
  oracle: 'Oracle',
  empathy: 'Empathy',
  question: 'Question',
  difference: 'Difference',
  free_paid_compare: 'FreePaidCompare',
  midday: 'Midday',
  concept: 'Concept',
};
const EMPATHY_WEEKDAYS = [1, 3, 5];
const QUESTION_WEEKDAYS = [2, 4];
const DIFFERENCE_WEEKDAYS = [2];
const FREE_PAID_COMPARE_WEEKDAYS = [6];
const CARD_OVERRIDES_BY_DATE = {
  '2026-05-12': 8,
  '2026-05-13': 8,
};

const SOCIAL_CONCEPT_IMAGES = {
  wide: {
    file: 'ルノルマンカード表紙デザイン2.png',
    blueskyFile: 'lenormand-card-cover-social.jpg',
    altText: '夜の都市と魔法陣を背景に、青い衣装の人物とカードが描かれたルノルマンカード表紙デザイン。',
  },
  vertical: {
    file: 'app-promo-vertical.png',
    blueskyFile: 'app-promo-vertical-social.jpg',
    altText: '星空と占星術モチーフを背景に、銀髪のキャラクターと金色の「羅針占術」の文字が入った縦長告知画像。',
  },
  icon: {
    file: 'オラクルカード表紙デザイン2.png',
    blueskyFile: 'oracle-card-cover-social.jpg',
    altText: '星空を背景に、青い衣装の人物が描かれたオラクルカード表紙デザイン。',
  },
};

const SOCIAL_CONTENT_IMAGES = {
  difference: {
    file: 'difference.jpg',
    blueskyFile: 'difference.jpg',
    altText: '羅針占術とほかのAI占いの違いを比較する縦長画像。自由記載、命・卜・相の総合占術、履歴から変化を見る特徴を表で示している。',
  },
  free_paid_compare: {
    file: 'free-paid-compare.jpg',
    blueskyFile: 'free-paid-compare.jpg',
    altText: '羅針占術の無料鑑定と深掘り鑑定の比較画像。無料は0円、有料は最安1000円で、カード枚数や追加質問、履歴解析の違いを表で示している。',
  },
};

const NG_WORDS = [
  '絶対当たる',
  '100%当たる',
  '必ず当たる',
  '運命の人',
  '復縁できます',
  '必ず戻ってくる',
  '課金しないと',
  '買わないと悪くなる',
  'このままだと不幸',
  '手遅れ',
  '病気が治る',
  '投資で勝てる',
  '法律的に大丈夫',
  '今すぐ購入しないと',
];

const POST_CALENDAR = [
  { date: '2026-05-12', morningTheme: '焦りを分ける', eveningTheme: '先行版: 羅針占術とは', paidCta: 'none' },
  { date: '2026-05-13', morningTheme: '境界線を整える', eveningTheme: '無料鑑定で見えるもの', paidCta: 'free' },
  { date: '2026-05-14', morningTheme: '迷いを書き出す', eveningTheme: '読みっぱなしにしない占い', paidCta: 'none' },
  { date: '2026-05-15', morningTheme: '答えを急がない', eveningTheme: 'プレリリース前日案内', paidCta: 'soft_paid' },
  { date: '2026-05-16', morningTheme: '今日の一手を決める', eveningTheme: '羅針占術とは', paidCta: 'none' },
  { date: '2026-05-17', morningTheme: '小さく動く', eveningTheme: '今日のオラクルの使い方', paidCta: 'none' },
  { date: '2026-05-18', morningTheme: '週初めの整理', eveningTheme: '無料鑑定で見えるもの', paidCta: 'free' },
  { date: '2026-05-19', morningTheme: '焦りを分ける', eveningTheme: '二択にしない迷いの整理', paidCta: 'none' },
  { date: '2026-05-20', morningTheme: '本音を確認する', eveningTheme: '鑑定結果を記録する価値', paidCta: 'free' },
  { date: '2026-05-21', morningTheme: '注意点を見る', eveningTheme: '深掘り鑑定の違い', paidCta: 'soft_paid' },
  { date: '2026-05-22', morningTheme: '週末前の一手', eveningTheme: 'BOOTH購入後の流れ', paidCta: 'soft_paid' },
  { date: '2026-05-23', morningTheme: '1週間の振り返り', eveningTheme: '迷いを3行で整理する', paidCta: 'free' },
  { date: '2026-05-24', morningTheme: '休む選択', eveningTheme: '当てるより整理する占い', paidCta: 'none' },
  { date: '2026-05-25', morningTheme: '今週の軸', eveningTheme: '仕事・転職の使い方', paidCta: 'free' },
  { date: '2026-05-26', morningTheme: '距離感を整える', eveningTheme: '恋愛で断定しない理由', paidCta: 'none' },
  { date: '2026-05-27', morningTheme: 'お金の守り方', eveningTheme: '専門判断の代替にしない', paidCta: 'none' },
  { date: '2026-05-28', morningTheme: '選択肢を増やす', eveningTheme: '深掘り鑑定の利用例', paidCta: 'soft_paid' },
  { date: '2026-05-29', morningTheme: '2週間の振り返り', eveningTheme: '今日のオラクルから深掘りまでの流れ', paidCta: 'active_if_booth_ready' },
];

const PRE_RELEASE_ORACLE_PROMOS = {
  '2026-05-12': {
    intro: [
      '5/16公開前の、先行オラクルです。',
      'これはまだアプリで試せるものではなく、公開前の見本です。',
    ],
    pitch: [
      '気になった方は保存して、5/16に見返してください。',
      '公開後は、自分の1枚と無料鑑定で迷いを整理できます。',
    ],
    closing: '気になる方はフォローして、5/16の公開を待っていてください。',
  },
  '2026-05-13': {
    intro: [
      '5/16公開まで、あと3日。',
      '羅針占術で見られる「今日の1枚」を先に紹介します。',
    ],
    pitch: [
      '公開後は、この1枚を自分で受け取り、',
      '無料鑑定で本質・本音・いまの現実まで整理できます。',
    ],
    closing: '気になる方は保存して、公開日に見返してください。',
  },
  '2026-05-14': {
    intro: [
      '5/16公開まで、あと2日。',
      '先行オラクルとして、公開後の空気を少しだけ届けます。',
    ],
    pitch: [
      '羅針占術は、結果を怖がるためではなく、',
      '迷いを見える形にして次の一手を決めるための占いです。',
    ],
    closing: '気になる方はフォローして、5/16を待っていてください。',
  },
  '2026-05-15': {
    intro: [
      '明日、羅針占術をプレリリースします。',
      '公開前最後の、先行オラクルです。',
    ],
    pitch: [
      '明日からは、今日のオラクルと無料鑑定で、',
      '本質・本音・いまの現実・次の一手を整理できます。',
    ],
    closing: '明日の公開を見逃さないよう、フォローして待っていてください。',
  },
};

const CALENDAR_CONCEPT_POSTS = {
  '先行版: 羅針占術とは': '自作のAI占いアプリ「羅針占術」を、5/16にプレリリースします。\n\n未来を断定する占いではありません。\n本質・本音・いまの現実を整理して、次の一手を見つけるための占いです。\n\n公開前の4日間は、先行オラクル、無料鑑定で見えること、結果を記録する価値を順に投稿します。',
  '羅針占術とは': '本日、自作のAI占いアプリ「羅針占術」をプレリリースしました。\n\n羅針占術は、「未来を当てる」よりも、「今の迷いを整理する」ことを大切にしています。\n\n本質。本音。いまの現実。\n\nこの3つを重ねて、次に進む方角を見つける占いです。',
  '今日のオラクルの使い方': '今日のオラクルは、読んで終わりではなく、今日の行動をひとつ決めるために使うのがおすすめです。\n\n連絡する。休む。調べる。書き出す。\n\n小さくても、次の一手が決まると迷いは少し軽くなります。',
  '無料鑑定で見えるもの': '5/16公開後、羅針占術の無料鑑定では、今の迷いを4つに分けて見ます。\n\n本質。\n本音。\nいまの現実。\n次の一手。\n\n「何となく不安」なまま動くのではなく、まず何に迷っているのかを見える形にするための入口です。',
  '二択にしない迷いの整理': '迷っているときは、選択肢が2つしかないように見えることがあります。\n\nやるか、やめるか。進むか、止まるか。\n\nでも本当は、「少し試す」「期限を決める」「情報を集める」という一手もあります。',
  '鑑定結果を記録する価値': '占いの結果は、その日の気分で読み捨てるだけではなく、あとから見返すことで意味が変わることがあります。\n\nあのとき何に迷っていたか。何を選んだか。今はどう感じるか。\n\n羅針占術では、鑑定を記録として残すことも大切にしています。',
  '読みっぱなしにしない占い': '占いは、読んだ瞬間だけで終わらせなくてもいい。\n\nその日なにに迷っていたか。\nどんなカードが出たか。\nそのあと何を選んだか。\n\n残しておくと、同じ悩みに見えても、少しずつ変わっていることがあります。\n\n羅針占術は、読みっぱなしにしない占いとして5/16に公開します。',
  '深掘り鑑定の違い': '無料鑑定は、今の迷いの輪郭を見るための入口です。\n\n深掘り鑑定は、その輪郭をもう少し細かく見て、止まりやすい点、見落としやすい注意点、次に確認したいことまで整理する鑑定です。',
  'BOOTH購入後の流れ': '深掘り鑑定の購入情報は、SNS上では扱いません。\n\n必要な方だけ、アプリ内で案内を確認し、BOOTH購入後に注文番号を入力して始める流れです。\n\nまずは無料鑑定で、今の迷いを整理してみてください。',
  '迷いを3行で整理する': '今週の自分に、ひとつだけ聞いてみてください。\n\n何に迷っていたか。\n何を後回しにしていたか。\n少しでも動けたことは何か。\n\n占いは、自分を責めるためではなく、流れを見直すために使ってください。',
  '当てるより整理する占い': '「悪いカードが出たから、悪い未来になる」とは読みません。\n\n注意点が見えたなら、それは怖がるためではなく、整えるためのヒントです。\n\n羅針占術は、不安を増やすより、行動を見直すきっかけにする占いです。',
  '仕事・転職の使い方': '仕事で迷うときは、「今すぐ決めること」と「まず確認すること」を分けてみてください。\n\n転職するかどうか。続けるかどうか。誰に相談するか。何を調べるか。\n\n次に確認することが決まれば、前に進めます。',
  '恋愛で断定しない理由': '恋愛占いで大切にしたいのは、相手の気持ちを決めつけることではありません。\n\n自分はどう感じているのか。どんな関係を望んでいるのか。どこで不安になっているのか。\n\n相手を見る前に、自分の本音を見てもいいと思います。',
  '専門判断の代替にしない': 'お金、健康、法律の不安が強いときほど、占いだけで判断しないことが大切です。\n\n羅針占術は、生活や気持ちを見直すきっかけにはなっても、専門判断の代わりにはなりません。',
  '深掘り鑑定の利用例': '深掘り鑑定は、強い結果を出すためのものではありません。\n\n無料鑑定で見えた流れをもとに、追加カードと追加質問で、次に確認したいことを具体化する鑑定です。\n\n必要な方だけご利用ください。',
  '今日のオラクルから深掘りまでの流れ': '今日のオラクルは入口。無料鑑定は整理。必要な方には深掘り鑑定。\n\n30日間、今日の一手を見続けると、自分が何に迷いやすいかも少し見えてきます。\n\n迷いを、次の一手に変えるために使ってください。',
  'プレリリース前日案内': '明日、自作のAI占いアプリ「羅針占術」をプレリリースします。\n\n入口は無料の今日のオラクルと、無料鑑定です。\n\nまずは、今の迷いを整理するところから。\n未来を決めつけず、本質・本音・いまの現実から次の一手を見つける占いです。',
};

const CONCEPT_POSTS = [
  '羅針占術は、カードだけで答えを決める占いではありません。姓名判断・四柱推命・動物タイプ診断で土台を見て、カードで「いまの現実」と「次の一手」を読みます。',
  '迷っているときほど、正解探しより「自分が何を大事にしたいか」を見失いやすい。羅針占術は、その軸を取り戻すための占いとして作っています。',
  '無料鑑定では、本質・本音・現実・次の一手までを読みます。深掘り鑑定では、同じ相談を追加カードと履歴の流れまで含めて細かく見ます。',
  '羅針占術で大事にしているのは、「当たった」で終わらせないこと。読み終わったあとに、今日何を確認するか、どう動くかまで残る鑑定を目指しています。',
  'カードは未来を固定するものではなく、今の状態を映す鏡として使っています。見えた流れをもとに、選び方を整えるための占いです。',
  '悩みが深いときほど、気持ちだけでも、理屈だけでも決めにくい。羅針占術では、生まれ・名前・行動傾向・カードを重ねて判断材料を増やします。',
  '「進むか、止まるか、様子を見るか」。羅針占術では、曖昧な不安をそのままにせず、次に取れる一手まで言葉にします。',
  '占いを、依存ではなく自己理解の道具にする。羅針占術は、そんな距離感で使えるWeb占いとして育てています。',
  '迷いが強いときほど、「正解」を探したくなります。でも必要なのは、誰かに決めてもらうことではなく、自分の状況を見える形にすることかもしれません。',
  '恋愛で迷うとき、相手の気持ちだけを見ようとすると、自分の本音が見えにくくなります。まずは、自分が望む距離感を整理するところから始めても大丈夫です。',
  '仕事の迷いは、「辞めるか、続けるか」だけで考えると苦しくなります。疲れ、不満、希望、確認したいことを分けるだけでも、次の一手は見えやすくなります。',
  '同じ悩みが続いているように見えても、前より早く気づけた、前より言葉にできた、前より無理をしなくなった、という変化があるかもしれません。',
  '悪いカードが出たから悪い未来になる、とは読みません。注意点が見えたなら、それは怖がるためではなく、整えるためのヒントです。',
  '深掘り鑑定は、すべての人に必要なものではありません。無料鑑定で十分なときもあります。もう少し細かく見たいときの選択肢として用意しています。',
  '羅針占術は、未来を断定するための占いではありません。迷っていることを整理して、次にできる小さな行動を見つけるための羅針盤として使ってください。',
];

const NIGHT_CONCEPT_POSTS = [
  '占い結果を渡して終わり、ではありません。\n羅針占術は、姓名判断・四柱推命・動物タイプ診断で土台を見て、ルノルマンカードで現実を解析し、数秘オラクルで打開点を探します。\n答えより、次に動ける一手を。',
  'AI占いにほしいのは、派手な断言より「今どう動くか」。\n羅針占術は、命・卜・相の総合占術として、恋愛・仕事・人間関係の迷いを次の一手まで落とし込みます。',
  'カードだけで未来を決めつけない。\n羅針占術は、名前・生まれ持つ傾向・動物タイプに加えて、ルノルマンで現実を読み、数秘オラクルで打開点を探すAI占いです。',
  '「当たった」で終わる占いではなく、「だから何をするか」まで見る占い。\n羅針占術は、本質・本音・現実・次の一手を分けて、悩みを動かせる形にします。',
  '恋愛で苦しい時ほど、相手の気持ちだけを追うと迷いやすい。\n羅針占術は、自分の本音・相手との距離・今できる一手を分けて整理します。',
  '仕事や転職で迷う時、必要なのは根性論ではなく判断材料。\n羅針占術は、性質・流れ・今の不安を整理して、次に確認することを見える形にします。',
  '人間関係の悩みは、正解探しより「どこで苦しくなっているか」を見る方が早い。\n羅針占術は、相手より先に自分の軸を整えるためのAI占いです。',
  '羅針占術は、怖がらせるための占いではありません。\n曖昧な不安を、本質・本音・現実・次の一手に分けて、今日できることまで小さくします。',
  '未来を断定されるより、今の状況を整理したい人へ。\n羅針占術は、姓名判断・四柱推命・カードを組み合わせて、迷いの輪郭を言葉にします。',
  '占いに依存するためではなく、自分で選び直すために。\n羅針占術は、命・卜・相を重ねて土台と流れを読み、最後に一手を決めます。',
  '「進む」「止まる」「様子を見る」。\n羅針占術は、その選択を感情だけで決めないために、性質・状況・カードの流れを重ねて整理します。',
  '相手の反応が気になる時ほど、自分の本音が置き去りになります。\n羅針占術は、相手を見る前に、自分が何を望んでいるかを整理します。',
  '悩みが大きい時は、答えより分解が先です。\n羅針占術は、恋愛・仕事・人間関係の不安を小さく分けて、次にできる行動まで落とします。',
  '羅針占術が見るのは、運命の一言ではなく「迷いの地図」です。\n自分の性質、今の流れ、カードの示す注意点を重ねて、進み方を探します。',
  '普通のAI占いで物足りない人へ。\n羅針占術は、命・卜・相を重ねて、悩みを一問一答ではなく流れとして読みます。',
  '「たぶん大丈夫」ではなく、何が不安なのかを見たい。\n羅針占術は、気持ち・現実・次の確認点を分けて、判断しやすい形にします。',
  'カードは答えを押しつけるものではなく、今の状態を映す鏡です。\n羅針占術は、ルノルマンで現実を見て、数秘オラクルで次の突破口を探します。',
  '恋愛も仕事も、人間関係も、悩みの根はひとつとは限りません。\n羅針占術は、複数の占術で見る角度を増やし、迷いの芯を探します。',
  '占いで「当てる」より大事なのは、終わったあと少し動けること。\n羅針占術は、結果を行動に変えるところまで意識したAI占いです。',
  '今の迷いを、相手・運勢・自分のせいにする前に。\n羅針占術は、状況を分けて見て、次に試せる一手を探します。',
  '強い言葉で不安を煽る占いはしません。\n羅針占術は、迷いを落ち着いて整理し、自分で選ぶための材料を増やします。',
  '名前、生まれ持つ流れ、行動傾向、カード。\n羅針占術は、ひとつの占いだけで決めず、複数の視点から今の悩みを見ます。',
  '答えがほしい時ほど、まず問いを整える。\n羅針占術は、何に迷っているのか、何を確認すべきか、次に何をするかを一緒に整理します。',
  '「相手はどう思っている？」の前に、「自分は何を望んでいる？」。\n羅針占術は、恋愛の不安を自分の軸から見直すためにも使えます。',
  '羅針占術は、占いを“結論”ではなく“整理の道具”として使います。\n見えにくい本音と現実を分けて、次の一手を考えるためのAI占いです。',
];

const MIDDAY_TOPIC_POSTS = [
  {
    title: '昼の羅針｜迷いの整理',
    body: '迷っているときは、答えを急ぐほど気持ちが散らばることがあります。羅針占術は、今の状態を少し引いて眺めるための占いです。',
  },
  {
    title: '昼の羅針｜気持ちと現実',
    body: '気持ちだけでも、現実だけでも、迷いは整理しきれないことがあります。羅針占術では、見えていることと感じていることを分けて読みます。',
  },
  {
    title: '昼の羅針｜止まりやすい点',
    body: '同じところで考えが止まるときは、まだ見えていない引っかかりがあるのかもしれません。羅針占術は、その引っかかりを言葉にする入口です。',
  },
  {
    title: '昼の羅針｜今の流れ',
    body: '大きな結論を出す前に、今どんな流れの中にいるのかを見るだけでも、迷いは少し軽くなります。羅針占術は、現状を整理するために使えます。',
  },
  {
    title: '昼の羅針｜本音の輪郭',
    body: '本音は、はっきりした言葉になる前に、違和感や迷いとして出てくることがあります。羅針占術は、その輪郭を静かに見直す占いです。',
  },
  {
    title: '昼の羅針｜選び直す前に',
    body: '何かを選び直したいときほど、先に自分の状態を見ることが大切です。羅針占術は、急がず整えるための判断材料を増やします。',
  },
  {
    title: '昼の羅針｜整理の入口',
    body: '占いは、結論を押しつけるものではなく、考える場所を作るものでもあります。羅針占術は、迷いを少し扱いやすい形に整えます。',
  },
];

const MIDDAY_FOCUS_LINES = [
  '今日の焦点：答えより、迷いの輪郭を見る。',
  '今日の焦点：気持ちと現実を少し分けて眺める。',
  '今日の焦点：いま引っかかっている一点を言葉にする。',
  '今日の焦点：結論を急がず、流れの変化を見る。',
  '今日の焦点：不安を責めず、今の状態として受け止める。',
  '今日の焦点：大きく決める前に、今見えている材料を整える。',
  '今日の焦点：迷いを無理に消さず、扱いやすい形にする。',
  '今日の焦点：外側の答えより、自分の感じ方を確認する。',
  '今日の焦点：急な判断より、落ち着いて見直す余白を作る。',
  '今日の焦点：正解探しより、今の問いを整える。',
  '今日の焦点：止まっている理由を、情報として眺める。',
  '今日の焦点：まだ決めない時間も、整理の一部にする。',
  '今日の焦点：同じ迷いの中にある、小さな変化を見る。',
  '今日の焦点：見えていることだけで、いったん流れを読む。',
  '今日の焦点：欲しい答えより、今の土台を見直す。',
  '今日の焦点：言葉にする前の違和感を、小さく拾う。',
  '今日の焦点：不安を消すより、扱える大きさに分ける。',
  '今日の焦点：結論の前に、次に聞くべき問いを整える。',
  '今日の焦点：続ける理由と離れる理由を同じ重さで見る。',
  '今日の焦点：気持ちの強さと現実の進み方を混ぜない。',
  '今日の焦点：今できる一手を、相手任せにしない形で探す。',
  '今日の焦点：焦りの中にある本音を、静かに取り出す。',
  '今日の焦点：自分を納得させるための証拠を探しすぎない。',
  '今日の焦点：選ばなかった道も、今の判断材料として見る。',
  '今日の焦点：変えられることと待つしかないことを分ける。',
  '今日の焦点：強い言葉より、あとで見返せる整理を残す。',
  '今日の焦点：一度で決めず、次の確認点まで進める。',
  '今日の焦点：過去の理由と今の可能性を切り分ける。',
  '今日の焦点：不安の声と本音の声を同じものにしない。',
  '今日の焦点：動く前に、守りたいものをひとつ決める。',
  '今日の焦点：答えではなく、次に見る方向を受け取る。',
];

const ORACLE_SOFT_ACTIONS = {
  1: '自分の意志で、一歩を選ぶ。',
  2: '支えながら、自分の軸も保つ。',
  3: '純粋な楽しさを優先する。',
  4: '焦らず、土台を積み重ねる。',
  5: '未知の体験を少し受け入れる。',
  6: '与えることと受け取ることを整える。',
  7: '感性を磨き、まず一歩動く。',
  8: '何のための力かを決めて動く。',
  9: '経験を知恵にして、執着を手放す。',
  10: '可能性を制限せず、新局面へ進む。',
  11: '直感とひらめきを手がかりにする。',
  12: '違いを調整し、自分も後回しにしない。',
  13: '冷静に判断し、責任ある形を選ぶ。',
  14: '極端を避け、変化を統合する。',
  15: '貢献の動機を澄ませる。',
  16: '表面ではなく、本質を観察する。',
  17: '希望を保ち、惜しまず与える。',
  18: '見えない答えを、急がず探求する。',
  19: '信念を曲げず、謙虚に進む。',
  20: '過去を清算し、人や意見をつなぐ。',
  21: '最後まで仕上げ、次へ手放す。',
  22: '影響力を前向きに使い、着実に築く。',
  23: '流れに適応し、自分の軸を保つ。',
  24: '品位と誠実さで、空気を整える。',
  25: '自分のペースで、道を見極める。',
  26: '責任を持って、新しい道を切り開く。',
  27: '節目を受け取り、次の扉へ備える。',
  28: '共鳴する人と場を選ぶ。',
  29: '理想を描き、現実の一歩へつなげる。',
  30: '想像力を信じ、表現を形にする。',
  31: '長期視点で、現実的に構築する。',
  32: '信頼できる仲間と共創する。',
  33: '自分を満たし、高い視点で導く。',
};

const ORACLE_SOCIAL_READINGS = {
  1: '始まりの道筋は、外から与えられる正解ではなく、自分の意志で選ぶ一歩から見えてきます。今日は「自分が一番したいこと」に立ち返ることが道しるべになります。',
  2: '支える役割に徹するほど、物事は静かに好転します。ただ、相手を尊重することと自分の軸を失うことは別です。',
  3: '難しく考えすぎない純粋さが、表現と創造を戻します。義務感より「面白い」を選ぶほど、行動が軽くなります。',
  4: '焦らず努力を積み重ねることが、揺るがない基盤になります。地道な継続こそ、このカードの安定を強めます。',
  5: '未知の選択を恐れず、新しい体験の中に成長を見つける流れです。変化を受け入れるほど、眠っていた可能性が動きます。',
  6: '思いやる行動は安心と愛を深めます。ただし無条件の自己犠牲ではなく、与えることと受け取ることのバランスが必要です。',
  7: '感性や技術を磨くことで、内面から生まれる価値が形になります。深く考えて止まるより、まず一歩が突破のヒントです。',
  8: '覚悟を決めて行動することで、現実は味方になり始めます。力は支配ではなく、何を達成するために使うかが鍵です。',
  9: '経験から得た知恵を使い、物事を広い視点で受け止める日です。執着を手放すほど、次のサイクルが始まります。',
  10: '新しい力の流れが始まっています。過去に縛られず、自分の可能性を制限しないことが転換の入口になります。',
  11: '直感やひらめきが、重要な手がかりを見せます。頭だけで整えようとせず、感覚を信頼するほど力が開きます。',
  12: '対立や違いを調整し、全体のバランスを整える流れです。受け入れるほど、自分を後回しにしすぎないことも大切になります。',
  13: '冷静な判断と責任ある行動が、周囲に安定をもたらします。古い土台を見直し、新しい秩序へ変容させる時です。',
  14: '変化を受け入れ、自分に合う形へ更新する日です。極端に振れず、中庸と調整を選ぶほど流れが整います。',
  15: '誰かの役に立つ行動が、大きな意味を生みます。承認欲求ではなく、純粋な動機で貢献するほど返るものが大きくなります。',
  16: '表面ではなく内側を観察するほど、本質が見えてきます。崩れることを恐れない姿勢が、再生の出発点になります。',
  17: '惜しまず与える姿勢が、豊かな流れを呼び込みます。暗い時期でも希望を保つ力が、現実を少し動かします。',
  18: 'まだ見えていない答えを求めて、学びと探求を続ける日です。不安や幻想に呑まれず、内側と外側を対話させてください。',
  19: '困難があっても信念を曲げず進むことで、道は開かれます。意志の勝利は、謙虚さを保つほど周囲も温めます。',
  20: '人や意見をつなげることで、新しい可能性が生まれます。過去を清算し、大きな目的へ統合する覚悟が求められます。',
  21: 'ひとつの流れを最後まで丁寧に仕上げる日です。終わりは次の始まりであり、手放すほど真の完成へ近づきます。',
  22: '存在感や影響力を、前向きな方向へ使う時です。大きなビジョンは、一歩ずつ現実に構築してこそ力になります。',
  23: '状況を無理に変えず、今の流れを上手に乗りこなす日です。柔軟に適応しながら、自分の軸を失わないことが大切です。',
  24: '優しさと品位ある行動が、周囲の空気を整えます。愛情を押し付けず、誠実な奉仕として扱うほど影響力が生まれます。',
  25: '自分のペースで歩み続けることで、本当に進むべき道が見えてきます。内省と自己信頼が、深い洞察へつながります。',
  26: 'まだ誰も進んでいない道を切り開く流れです。野心と実行力を、責任感と協調性で支えることが必要です。',
  27: '人生の節目に立ち、新しい段階へ進む準備をする日です。何かの終わりは、次の扉が開く合図でもあります。',
  28: '共鳴する人や環境を選ぶことで、運気の流れが整います。誰と響き合うかが、今後の分岐点になります。',
  29: '未来のビジョンを具体的に描くことで、現実が動き始めます。理想を掲げるだけでなく、現実の一歩へつなげる時です。',
  30: '想像力を信じ、形にすることを恐れない日です。表現することそのものが喜びになり、創造力を動かします。',
  31: '長期的な視点で計画を立て、現実的に構築する流れです。アイデアは、一つずつ積み上げてこそ価値になります。',
  32: '信頼できる仲間と力を合わせることで、成果が大きくなります。依存ではなく、共創と相互補完が鍵です。',
  33: '高い視点から物事を見て、周囲の成長を助ける流れです。自分自身が満たされているほど、愛の使命が正しく働きます。',
};

function parseArgs(argv) {
  const defaultPlatforms = String(process.env.SOCIAL_PLATFORMS || DEFAULT_SOCIAL_PLATFORMS)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const args = { dryRun: false, write: false, post: false, yes: false, platforms: defaultPlatforms.length ? defaultPlatforms : ['threads'], kind: 'all' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--post') args.post = true;
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--platforms') args.platforms = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (arg.startsWith('--platforms=')) args.platforms = arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--date') args.date = argv[++i];
    else if (arg.startsWith('--date=')) args.date = arg.split('=')[1];
    else if (arg === '--kind') args.kind = argv[++i] || 'all';
    else if (arg.startsWith('--kind=')) args.kind = arg.split('=')[1] || 'all';
    else if (arg === '--oracle-card') args.oracleCard = argv[++i];
    else if (arg.startsWith('--oracle-card=')) args.oracleCard = arg.split('=')[1];
    else if (arg === '--oracle-card-mode') args.oracleCardMode = argv[++i];
    else if (arg.startsWith('--oracle-card-mode=')) args.oracleCardMode = arg.split('=')[1];
  }
  if (!['all', ...DRAFT_POST_KINDS].includes(args.kind)) {
    throw new Error(`Invalid --kind: ${args.kind}`);
  }
  if (!args.write && !args.post) args.dryRun = true;
  return args;
}

function normalizeMode(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function boolFromEnv(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizeThreadsHashtag(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === '#占い鑑定') return DEFAULT_THREADS_HASHTAG;
  return trimmed;
}

function normalizeHashtagToken(token) {
  const value = String(token || '').trim().replace(/^＃/, '#').replace(/^#+/, '');
  if (!value) return '';
  return `#${value.replace(/[\s#＃]+/g, '')}`;
}

function uniqueHashtags(tags) {
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const normalized = normalizeHashtagToken(tag);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parseHashtagList(value) {
  return uniqueHashtags(String(value || '').split(/[\s,、;；]+/u));
}

function instagramHashtagEnvName(kind) {
  return `SOCIAL_INSTAGRAM_${String(kind || '').toUpperCase()}_HASHTAGS`;
}

function getInstagramHashtagLine(kind) {
  const key = String(kind || 'concept');
  const configured = String(process.env[instagramHashtagEnvName(key)] || process.env.SOCIAL_INSTAGRAM_HASHTAGS || '').trim();
  let tags = configured
    ? parseHashtagList(configured)
    : uniqueHashtags(DEFAULT_INSTAGRAM_HASHTAGS_BY_KIND[key] || DEFAULT_INSTAGRAM_HASHTAGS_BY_KIND.concept);
  if (key === 'empathy' && tags.includes('#悩み相談')) {
    tags = uniqueHashtags(DEFAULT_INSTAGRAM_HASHTAGS_BY_KIND.empathy);
  }
  return tags.slice(0, INSTAGRAM_HASHTAG_LIMIT).join(' ');
}

function getSocialConfig(args) {
  const platforms = Array.isArray(args.platforms) && args.platforms.length ? args.platforms : ['threads'];
  const primaryPlatform = platforms.includes('threads')
    ? 'threads'
    : platforms.includes('bluesky')
      ? 'bluesky'
      : platforms[0] || 'threads';
  const boothUrl = String(process.env.BOOTH_DEEP_READING_URL || process.env.BOOTH_PRODUCT_URL || '').trim();
  const paidCtaMode = normalizeMode(process.env.SOCIAL_PAID_CTA_MODE, SOCIAL_PAID_CTA_MODES, 'soft');
  return {
    timezone: 'Asia/Tokyo',
    primaryPlatform,
    enableX: platforms.includes('x'),
    enableBluesky: platforms.includes('bluesky'),
    enableInstagram: platforms.includes('instagram'),
    paidCtaMode,
    releaseMode: normalizeMode(process.env.SOCIAL_RELEASE_MODE, SOCIAL_RELEASE_MODES, 'auto'),
    boothEnabled: boolFromEnv(process.env.SOCIAL_BOOTH_ENABLED) && !!boothUrl,
    stripeEnabled: false,
    campaign: String(process.env.SOCIAL_UTM_CAMPAIGN || DEFAULT_SOCIAL_CAMPAIGN).trim() || DEFAULT_SOCIAL_CAMPAIGN,
    defaultHashtag: DEFAULT_HASHTAG,
    threadsHashtag: normalizeThreadsHashtag(process.env.SOCIAL_THREADS_HASHTAG || DEFAULT_THREADS_HASHTAG),
    blueskyHashtags: String(process.env.SOCIAL_BLUESKY_HASHTAGS || DEFAULT_BLUESKY_HASHTAGS).trim() || DEFAULT_BLUESKY_HASHTAGS,
  };
}

function withPlatform(config, primaryPlatform) {
  const next = {
    ...config,
    primaryPlatform,
  };
  if (primaryPlatform === 'threads') next.defaultHashtag = getThreadsHashtagLine(next);
  if (primaryPlatform === 'bluesky') next.defaultHashtag = getBlueskyHashtagLine(next);
  return next;
}

function withInstagramKind(config, kind) {
  return {
    ...withPlatform(config, 'instagram'),
    defaultHashtag: getInstagramHashtagLine(kind),
    instagramHashtagKind: kind,
  };
}

function truncateText(text, maxChars) {
  const chars = [...String(text || '').trim()];
  if (chars.length <= maxChars) return chars.join('');
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join('')}…`;
}

function hasDisplayUrl(text) {
  return /https?:\/\//i.test(String(text || '')) || /\brashin-senjutsu\.onrender\.com\b/i.test(String(text || ''));
}

function normalizeSharedPlatformText(text) {
  return String(text || '')
    .replace(/(^|\n)#[^\s#]+(?:\s+#[^\s#]+)*/g, '$1#<platform-tags>')
    .replace(/\brashin-senjutsu\.onrender\.com\b/g, '<profile-link>')
    .replace(/プロフィールのリンクから[^\n]*/g, '<profile-link>');
}

function assertSharedTextMatchesThreads(entry, platform, kind) {
  if (!THREADS_MATCHED_PLATFORM_KINDS.has(kind)) return;
  const platformText = getEntryTextForPlatform(entry, platform);
  if (normalizeSharedPlatformText(entry.text) !== normalizeSharedPlatformText(platformText)) {
    throw new Error(`${kind} ${platform} post must match the Threads post except hashtags.`);
  }
}

function fitPostText(parts, maxChars) {
  const normalized = parts.map(part => String(part || '').trim()).filter(Boolean);
  let text = normalized.join('\n\n');
  if ([...text].length <= maxChars) return text;
  for (let i = 0; i < normalized.length; i += 1) {
    if (hasDisplayUrl(normalized[i]) || normalized[i].startsWith('#')) continue;
    normalized[i] = truncateText(normalized[i], Math.max(24, [...normalized[i]].length - ([...text].length - maxChars) - 4));
    text = normalized.join('\n\n');
    if ([...text].length <= maxChars) return text;
  }
  throw new Error(`Could not fit social post within ${maxChars} characters without cutting the tracked URL.`);
}

function getDailyConceptAngle(dateKey) {
  const angles = [
    '今日の視点：迷いは小さくなっていい。',
    '今日の視点：本音は急がなくても残る。',
    '今日の視点：結論より、心が戻る余白。',
    '今日の視点：止まる理由にも意味がある。',
    '今日の視点：感情も現実も、どちらも大切。',
    '今日の視点：急がない日にも流れはある。',
    '今日の視点：期待より、静かな変化の気配。',
  ];
  const hash = crypto.createHash('sha256').update(`angle:${dateKey}`).digest()[0];
  const serial = dateKey.replace(/^\d{4}-(\d{2})-(\d{2})$/, '$1$2');
  return `羅針メモ${serial}：${angles[hash % angles.length].replace(/^今日の視点：/, '')}`;
}

function buildRepeatCycleNote(dateKey, cycleLength) {
  const offset = dateToUtcDay(dateKey) - dateToUtcDay(CARD_CYCLE_START_DATE);
  if (!Number.isFinite(offset) || !cycleLength || offset < cycleLength) return '';
  const cycle = Math.floor(offset / cycleLength) + 1;
  return `${cycle}巡目の視点：同じテーマでも、今日の景色は少し違います。`;
}

function normalizeForDuplicateCheck(text) {
  return String(text || '')
    .replace(/[「」『』（）()[\]【】]/g, '')
    .replace(/[、。,.!?！？\s]/g, '')
    .trim();
}

function softenOracleSocialWording(text) {
  return String(text || '')
    .replace(/このカードからの一手/g, 'このカードからのヒント');
}

function oracleSocialCopy(card) {
  return ORACLE_CARD_COPY[Number(card?.id)] || {};
}

function oracleSocialTitle(card) {
  return String(oracleSocialCopy(card).title || card?.title || '').trim();
}

function buildOracleLeadLine(card) {
  const lead = String(oracleSocialCopy(card).lead || '').trim();
  if (lead) return lead;

  const message = String(card?.message || '').trim();
  if (message) return softenOracleSocialWording(message);

  const share = String(card?.share || '').trim();
  const title = String(card?.title || '').trim();
  if (share) {
    const normalizedShare = normalizeForDuplicateCheck(share);
    const normalizedTitle = normalizeForDuplicateCheck(title);
    if (!normalizedTitle || !normalizedShare.includes(normalizedTitle)) return softenOracleSocialWording(share);
  }

  return 'このカードが示すテーマは、今日の心に静かに重ねられます。';
}

function buildOracleActionLine(card) {
  const id = Number(card?.id);
  const action = oracleSocialCopy(card).support || ORACLE_SOFT_ACTIONS[id] || '今日は、そのテーマを静かに持っていていい。';
  return `今日のよりどころ：${action}`;
}

function buildOracleReadingLine(card) {
  const id = Number(card?.id);
  const reading = oracleSocialCopy(card).message || ORACLE_SOCIAL_READINGS[id] || 'このカードは、結論を急がない日に残る静かな視点を示しています。';
  return `カードメッセージ：${reading}`;
}

function getJstDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getCalendarEntry(dateKey) {
  return POST_CALENDAR.find(item => item.date === dateKey) || null;
}

function isBeforeRelease(dateKey) {
  return String(dateKey || '') < RELEASE_DATE;
}

function getReleasePhase(dateKey) {
  const key = String(dateKey || '');
  if (!key || key < PRERELEASE_START_DATE) return 'prelaunch';
  if (key <= PRERELEASE_END_DATE) return 'prerelease';
  if (key <= FIX_PERIOD_END_DATE) return 'fix';
  return 'release';
}

function resolvePaidCta(entry, config) {
  const requested = entry?.paidCta || 'none';
  if (requested === 'none') return 'none';
  if (requested === 'free') return 'free';
  if (config.paidCtaMode === 'off') return 'none';
  if (requested === 'active_if_booth_ready') {
    return config.paidCtaMode === 'active' && config.boothEnabled ? 'active_paid' : 'soft_paid';
  }
  if (requested === 'soft_paid') return 'soft_paid';
  return 'none';
}

function isPreReleasePosting(dateKey, config) {
  return isBeforeRelease(dateKey);
}

function buildThreadsCtaLine(paidCta, dateKey, config) {
  if (isPreReleasePosting(dateKey, config)) {
    if (paidCta === 'free') {
      return '公開日にまた届きます。';
    }
    if (paidCta === 'soft_paid' || paidCta === 'active_paid') {
      return '公開後、必要な方だけ深掘り鑑定の案内があります。';
    }
    return '公開日にまた届きます。';
  }
  if (paidCta === 'free') {
    return '今日のオラクルと無料鑑定があります。';
  }
  if (paidCta === 'active_paid') {
    return '深く整理したい方は、アプリ内の案内から深掘り鑑定へ進めます。';
  }
  if (paidCta === 'soft_paid') {
    return '必要な方だけ、無料鑑定のあとに深掘り鑑定を検討できる形にしています。';
  }
  return '迷いに、静かな羅針を置く占い。';
}

function buildXCtaLine(paidCta, dateKey, config) {
  if (isPreReleasePosting(dateKey, config)) {
    if (paidCta === 'soft_paid' || paidCta === 'active_paid') {
      return '深掘り鑑定は公開後、必要な方だけ案内します。明日の公開を待っていてください。';
    }
    return '気になる方は5/16の公開を待っていてください。';
  }
  if (paidCta === 'free') {
    return 'まずは無料の今日のオラクルから。';
  }
  if (paidCta === 'active_paid') {
    return '深く整理したい方は、アプリ内の案内へ。';
  }
  if (paidCta === 'soft_paid') {
    return '必要な方だけ、深掘り鑑定も選べます。';
  }
  return 'まずは無料の今日のオラクルから。';
}

function pickNightConceptBody(dateKey) {
  const index = dateToUtcDay(dateKey) % NIGHT_CONCEPT_POSTS.length;
  return NIGHT_CONCEPT_POSTS[index];
}

function buildNightConceptCtaLine(paidCta, dateKey, config) {
  if (isPreReleasePosting(dateKey, config)) {
    return '5/16公開。公開日にまた届きます。';
  }
  if (paidCta === 'active_paid') {
    return '無料で整理して、必要な方だけ深掘り鑑定へ。';
  }
  if (paidCta === 'soft_paid') {
    return 'まずは無料鑑定で整理して、必要なら深掘りへ。';
  }
  return 'まずは無料鑑定で、今の迷いを整理できます。';
}

function buildTrackedUrl(publicOrigin, pathname = '/', params = {}) {
  const url = new URL(pathname, publicOrigin.endsWith('/') ? publicOrigin : `${publicOrigin}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function buildPublicUiImageUrl(publicOrigin, fileName) {
  return `${publicOrigin}/images/ui/${encodeURIComponent(fileName)}`;
}

function buildDisplayUrl(publicOrigin = DEFAULT_PUBLIC_ORIGIN, options = {}) {
  const includeProtocol = Boolean(options.includeProtocol);
  try {
    const parsed = new URL(publicOrigin);
    const host = parsed.host.replace(/^www\./i, '');
    return includeProtocol ? `${parsed.protocol}//${host}` : host;
  } catch (_error) {
    const host = String(publicOrigin || DEFAULT_PUBLIC_ORIGIN)
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./i, '');
    return includeProtocol ? `https://${host}` : host;
  }
}

function buildDisplayUrlForPlatform(publicOrigin, config) {
  if (config?.primaryPlatform === 'instagram') {
    return 'プロフィールのリンクから';
  }
  return buildDisplayUrl(publicOrigin, { includeProtocol: false });
}

function buildUtmParams(config, content) {
  return {
    utm_source: config.primaryPlatform,
    utm_medium: 'social',
    utm_campaign: config.campaign,
    utm_content: content,
  };
}

function buildOracleTrackedUrl(card, publicOrigin, config, dateKey) {
  return buildTrackedUrl(publicOrigin, '/share/card', {
    type: 'oracle',
    id: card.id,
    ...buildUtmParams(config, `oracle_${dateKey.replace(/-/g, '')}`),
  });
}

function buildConceptTrackedUrl(dateKey, publicOrigin, config, paidCta) {
  const contentType = paidCta === 'soft_paid' || paidCta === 'active_paid'
    ? 'deep'
    : 'concept';
  return buildTrackedUrl(publicOrigin, '/', buildUtmParams(config, `${contentType}_${dateKey.replace(/-/g, '')}`));
}

function buildMiddayTrackedUrl(dateKey, publicOrigin, config) {
  return buildTrackedUrl(publicOrigin, '/', buildUtmParams(config, `midday_${dateKey.replace(/-/g, '')}`));
}

function buildEmpathyUtmContent(item, dateKey) {
  return `empathy_${compactDate(dateKey)}_card${pad2(item.cardNumber)}`;
}

function buildQuestionUtmContent(item, dateKey) {
  return `question_${compactDate(dateKey)}_v${pad2(item.version)}`;
}

function buildDifferenceUtmContent(item, dateKey) {
  return `difference_${compactDate(dateKey)}_v${pad2(item.version)}`;
}

function buildFreePaidCompareUtmContent(item, dateKey) {
  return `freepaid_${compactDate(dateKey)}_v${pad2(item.version)}`;
}

function buildEmpathyTrackedUrl(item, dateKey, publicOrigin, config) {
  return buildTrackedUrl(publicOrigin, '/', buildUtmParams(config, buildEmpathyUtmContent(item, dateKey)));
}

function buildQuestionTrackedUrl(item, dateKey, publicOrigin, config) {
  return buildTrackedUrl(publicOrigin, '/', buildUtmParams(config, buildQuestionUtmContent(item, dateKey)));
}

function buildDifferenceTrackedUrl(item, dateKey, publicOrigin, config) {
  return buildTrackedUrl(publicOrigin, '/', buildUtmParams(config, buildDifferenceUtmContent(item, dateKey)));
}

function buildFreePaidCompareTrackedUrl(item, dateKey, publicOrigin, config) {
  return buildTrackedUrl(publicOrigin, '/', buildUtmParams(config, buildFreePaidCompareUtmContent(item, dateKey)));
}

function countHashtags(text) {
  return (String(text || '').match(/(^|\s)#[^\s#]+/g) || []).length;
}

function stripLineRolePrefix(text) {
  return String(text || '').replace(/^(今日の1枚|先行版 今日の1枚|今日の数秘オラクル|テーマ|今日の一手|今日のよりどころ|このカードからの一手|ヒント)[:：]\s*/, '');
}

function findAdjacentRepeatedLine(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !/^https?:\/\//i.test(line));

  for (let i = 0; i < lines.length - 1; i += 1) {
    const left = normalizeForDuplicateCheck(stripLineRolePrefix(lines[i]));
    const right = normalizeForDuplicateCheck(stripLineRolePrefix(lines[i + 1]));
    if (left.length < 8 || right.length < 8) continue;
    if (left === right || left.includes(right) || right.includes(left)) {
      return { previous: lines[i], next: lines[i + 1] };
    }
  }
  return null;
}

function getXHashtagLine(config = {}) {
  const configured = String(process.env.SOCIAL_X_HASHTAGS || '').trim();
  return configured || `${config.defaultHashtag || DEFAULT_HASHTAG} #AI占い`;
}

function getThreadsHashtagLine(config = {}) {
  const configured = String(process.env.SOCIAL_THREADS_HASHTAG || '').trim();
  return normalizeThreadsHashtag(configured || config.threadsHashtag || DEFAULT_THREADS_HASHTAG);
}

function getBlueskyHashtagLine(config = {}) {
  const configured = String(process.env.SOCIAL_BLUESKY_HASHTAGS || '').trim();
  return configured || config.blueskyHashtags || DEFAULT_BLUESKY_HASHTAGS;
}

function replaceTrailingHashtagLine(text, currentLine, nextLine) {
  const value = String(text || '');
  if (!currentLine || currentLine === nextLine || !value.endsWith(currentLine)) return value;
  return `${value.slice(0, -currentLine.length)}${nextLine}`;
}

function validatePostText(text, options = {}) {
  const label = options.label || 'post';
  const value = String(text || '');
  const blocked = NG_WORDS.filter(word => value.includes(word));
  if (blocked.length) {
    throw new Error(`${label} contains blocked wording: ${blocked.join(', ')}`);
  }
  const repeated = findAdjacentRepeatedLine(value);
  if (repeated) {
    throw new Error(`${label} has adjacent repeated wording: "${repeated.previous}" / "${repeated.next}"`);
  }
  const hashtagCount = countHashtags(value);
  if (options.platforms?.includes('threads') && hashtagCount > 1) {
    throw new Error(`${label} must use only one hashtag on Threads.`);
  }
  if (options.platforms?.includes('bluesky') && hashtagCount !== countHashtags(getBlueskyHashtagLine())) {
    throw new Error(`${label} must use the configured Bluesky hashtags: ${hashtagCount}/${countHashtags(getBlueskyHashtagLine())}.`);
  }
  if (options.platforms?.includes('instagram') && hashtagCount > INSTAGRAM_HASHTAG_LIMIT) {
    throw new Error(`${label} uses too many Instagram hashtags: ${hashtagCount}/${INSTAGRAM_HASHTAG_LIMIT}.`);
  }
  if (options.platforms?.includes('threads') && [...value].length > THREADS_CHARACTER_LIMIT) {
    throw new Error(`${label} is too long for Threads: ${[...value].length}/${THREADS_CHARACTER_LIMIT}`);
  }
  // X draft export is manual-post oriented, so this lane does not enforce a
  // character limit here. Threads and Bluesky still keep their platform limits.
  if (options.platforms?.includes('bluesky') && [...value].length > BLUESKY_CHARACTER_LIMIT) {
    throw new Error(`${label} is too long for Bluesky: ${[...value].length}/${BLUESKY_CHARACTER_LIMIT}`);
  }
  if (options.platforms?.includes('instagram') && [...value].length > INSTAGRAM_CHARACTER_LIMIT) {
    throw new Error(`${label} is too long for Instagram: ${[...value].length}/${INSTAGRAM_CHARACTER_LIMIT}`);
  }
  if (options.requireTrackedUrl && options.requireVisibleUrl !== false && !hasPublicUrl(value)) {
    throw new Error(`${label} is missing a visible URL.`);
  }
  if (options.requireProfileLink && !value.includes('プロフィールのリンクから')) {
    throw new Error(`${label} is missing the Instagram profile link cue.`);
  }
  if (options.requireTrackedUrl && !extractUtmContent(value) && !extractUtmContent(options.trackedUrl)) {
    throw new Error(`${label} is missing utm_content.`);
  }
}

function getEntryTextForPlatform(entry, platform) {
  if (platform === 'x') return entry.xText;
  if (platform === 'bluesky') return entry.blueskyText;
  if (platform === 'instagram') return entry.instagramText;
  return entry.text;
}

function getTrackedUrlForPlatform(entry, platform) {
  if (platform === 'x') return entry.xTrackedUrl;
  if (platform === 'bluesky') return entry.blueskyTrackedUrl;
  if (platform === 'instagram') return entry.instagramTrackedUrl;
  return entry.trackedUrl;
}

function validateDraft(draft, args) {
  const platforms = Array.isArray(args.platforms) ? args.platforms : ['threads'];
  const kinds = selectedKindsFromArgs(args);
  const requiresVisibleUrl = kind => kind !== 'question';
  if (platforms.includes('threads')) {
    const requiredHashtag = draft.meta?.policy?.threadsHashtag || DEFAULT_THREADS_HASHTAG;
    const preRelease = isPreReleasePosting(draft.date, draft.meta?.socialConfig || {});
    for (const kind of kinds) {
      const entry = draft[kind];
      validatePostText(entry.text, { label: `${kind} Threads post`, platforms: ['threads'], requireTrackedUrl: true, requireVisibleUrl: requiresVisibleUrl(kind), trackedUrl: entry.trackedUrl });
      if (!entry.text.includes(requiredHashtag)) throw new Error(`${kind} Threads post is missing the required hashtag.`);
      if (entry.text.includes(DEFAULT_HASHTAG)) throw new Error(`${kind} Threads post must not use the brand hashtag.`);
      if (!extractUtmContent(entry.trackedUrl || entry.text)) throw new Error(`${kind} Threads post is missing utm_content.`);
    }
    if (preRelease) {
      if (draft.oracle.text.includes('今日の1枚はこちら')) {
        throw new Error('pre-release oracle Threads post must not use the live oracle closing line.');
      }
    } else if (kinds.includes('oracle') && !draft.oracle.text.trim().endsWith('今日の1枚はこちら')) {
      throw new Error('oracle Threads post must end with the required closing line.');
    }
  }
  if (platforms.includes('x')) {
    for (const kind of kinds) {
      const entry = draft[kind];
      validatePostText(entry.xText, { label: `${kind} X post`, platforms: ['x'], requireTrackedUrl: true, requireVisibleUrl: requiresVisibleUrl(kind), trackedUrl: entry.xTrackedUrl });
      if (entry.xText === entry.text) throw new Error(`${kind} X post must not be identical to the Threads post.`);
    }
  }
  if (platforms.includes('bluesky')) {
    const requiredHashtags = String(draft.meta?.policy?.blueskyHashtags || getBlueskyHashtagLine()).match(/#[^\s#]+/g) || [];
    for (const kind of kinds) {
      const entry = draft[kind];
      validatePostText(entry.blueskyText, { label: `${kind} Bluesky post`, platforms: ['bluesky'], requireTrackedUrl: true, requireVisibleUrl: requiresVisibleUrl(kind), trackedUrl: entry.blueskyTrackedUrl });
      for (const requiredHashtag of requiredHashtags) {
        if (!entry.blueskyText.includes(requiredHashtag)) throw new Error(`${kind} Bluesky post is missing the required hashtag: ${requiredHashtag}`);
      }
      if (!entry.blueskyImagePath) throw new Error(`${kind} Bluesky post requires a local image path.`);
      if (entry.blueskyImagePath !== entry.imagePath) {
        throw new Error(`${kind} Bluesky image must match the Threads image.`);
      }
      if (!entry.altText) throw new Error(`${kind} Bluesky image post requires alt text.`);
      assertSharedTextMatchesThreads(entry, 'bluesky', kind);
    }
    if (kinds.includes('midday') && normalizeSharedPlatformText(draft.midday.text) !== normalizeSharedPlatformText(draft.midday.blueskyText)) {
      throw new Error('midday Threads and Bluesky posts must use matching copy except hashtags.');
    }
  }
  if (platforms.includes('instagram')) {
    for (const kind of kinds) {
      const entry = draft[kind];
      validatePostText(entry.instagramText, {
        label: `${kind} Instagram post`,
        platforms: ['instagram'],
        requireTrackedUrl: true,
        requireVisibleUrl: false,
        requireProfileLink: requiresVisibleUrl(kind),
        trackedUrl: entry.instagramTrackedUrl,
      });
      if (!entry.instagramImageUrl) throw new Error(`${kind} Instagram post requires a public image URL.`);
      instagramClient.ensurePublicImageUrl(entry.instagramImageUrl);
      if (!entry.altText) throw new Error(`${kind} Instagram post requires alt text.`);
      assertSharedTextMatchesThreads(entry, 'instagram', kind);
    }
  }
}

function scanConstInitializer(source, constName, openChar, closeChar) {
  const marker = `const ${constName}=`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${constName}`);
  const open = source.indexOf(openChar, start + marker.length);
  if (open < 0) throw new Error(`Missing ${openChar} for ${constName}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === openChar) depth += 1;
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`Could not parse ${constName}`);
}

async function loadDailyOracleMessages() {
  const source = await fs.readFile(APP_JS, 'utf8');
  const literal = scanConstInitializer(source, 'DAILY_ORACLE_MESSAGES', '[', ']');
  return Function(`"use strict"; return (${literal});`)();
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function shuffle(ids) {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const bytes = crypto.randomBytes(4);
    const j = bytes.readUInt32BE(0) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function seededShuffle(ids, seed) {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const digest = crypto.createHash('sha256').update(`${seed}:${i}`).digest();
    const j = digest.readUInt32BE(0) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dateToUtcDay(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return 0;
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function utcDayToWeekday(utcDay) {
  return new Date(utcDay * 86400000).getUTCDay();
}

function getScheduledOccurrenceIndex(dateKey, weekdays, startDate = CONTENT_CYCLE_START_DATE) {
  const startDay = dateToUtcDay(startDate);
  const targetDay = dateToUtcDay(dateKey);
  if (!Number.isFinite(startDay) || !Number.isFinite(targetDay)) return 0;
  const normalizedWeekdays = new Set(weekdays);
  if (targetDay < startDay) {
    const distance = Math.abs(targetDay - startDay);
    return distance % Math.max(1, normalizedWeekdays.size);
  }
  let count = 0;
  for (let day = startDay; day <= targetDay; day += 1) {
    if (normalizedWeekdays.has(utcDayToWeekday(day))) count += 1;
  }
  return Math.max(0, count - 1);
}

function pickScheduledContent(items, dateKey, weekdays, namespace = 'social-content') {
  if (!Array.isArray(items) || !items.length) throw new Error('Missing social content items.');
  const index = getScheduledOccurrenceIndex(dateKey, weekdays);
  const cycle = Math.floor(index / items.length);
  const seed = process.env.SOCIAL_CONTENT_SEED || process.env.SOCIAL_UTM_CAMPAIGN || DEFAULT_SOCIAL_CAMPAIGN;
  const order = seededShuffle(items.map((_item, itemIndex) => itemIndex), `${namespace}:${seed}:${cycle}`);
  return items[order[index % items.length]];
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function compactDate(dateKey) {
  return String(dateKey || '').replace(/-/g, '');
}

function lenormandImageName(cardNumber) {
  return `${String(cardNumber).padStart(2, '0')}.jpg`;
}

function lenormandImagePath(cardNumber) {
  return path.join(ROOT, 'images', 'cards', 'lenormand', lenormandImageName(cardNumber));
}

function lenormandImageUrl(publicOrigin, cardNumber) {
  return `${publicOrigin}/images/cards/lenormand/${lenormandImageName(cardNumber)}`;
}

function instagramSocialImagePath(...segments) {
  return path.join(ROOT, 'images', 'social', 'instagram', ...segments);
}

function instagramSocialImageUrl(publicOrigin, ...segments) {
  return `${publicOrigin}/images/social/instagram/${segments.map(segment => encodeURIComponent(segment)).join('/')}`;
}

function deterministicCardId(ids, dateKey) {
  if (CARD_OVERRIDES_BY_DATE[dateKey] && ids.includes(CARD_OVERRIDES_BY_DATE[dateKey])) {
    return CARD_OVERRIDES_BY_DATE[dateKey];
  }
  const seed = process.env.SOCIAL_CARD_SEED || process.env.SOCIAL_UTM_CAMPAIGN || DEFAULT_SOCIAL_CAMPAIGN;
  const order = seededShuffle(ids, seed);
  const offset = dateToUtcDay(dateKey) - dateToUtcDay(CARD_CYCLE_START_DATE);
  const index = ((offset % order.length) + order.length) % order.length;
  return order[index];
}

function dateSeededRandomCardId(ids, dateKey) {
  const seed = process.env.SOCIAL_CARD_RANDOM_SEED || process.env.SOCIAL_UTM_CAMPAIGN || DEFAULT_SOCIAL_CAMPAIGN;
  const offset = dateToUtcDay(dateKey) - dateToUtcDay(CARD_CYCLE_START_DATE);
  const cycle = Math.floor(offset / ids.length);
  const index = ((offset % ids.length) + ids.length) % ids.length;
  const order = seededShuffle(ids, `oracle-random:${seed}:${cycle}`);
  return order[index];
}

function explicitCardId(ids, value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const picked = Number(raw);
  if (!Number.isInteger(picked) || !ids.includes(picked)) {
    throw new Error(`Invalid oracle card id: ${raw}`);
  }
  return picked;
}

function getOracleCardMode(args = {}) {
  return String(args.oracleCardMode || process.env.SOCIAL_ORACLE_CARD_MODE || 'deterministic').trim().toLowerCase();
}

function useStatelessCardPicking() {
  return process.env.SOCIAL_STATELESS_MODE === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

async function pickCard(messages, dateKey, writeState, args = {}) {
  const ids = messages.map(item => item.id);
  const explicit = explicitCardId(ids, args.oracleCard || process.env.SOCIAL_ORACLE_CARD_ID);
  const mode = getOracleCardMode(args);
  const picked = explicit || (mode === 'random'
    ? dateSeededRandomCardId(ids, dateKey)
    : deterministicCardId(ids, dateKey));

  if (!useStatelessCardPicking() && writeState) {
    const state = await readJson(STATE_FILE, { remaining: [], pickedByDate: {} });
    state.pickedByDate = state.pickedByDate || {};
    state.pickedByDate[dateKey] = picked;
    state.remaining = Array.isArray(state.remaining)
      ? state.remaining.filter(id => id !== picked)
      : ids.filter(id => id !== picked);
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  }
  return messages.find(item => item.id === picked) || messages[0];
}

function buildOracleText(card, publicOrigin, options = {}) {
  const dateKey = options.dateKey || getJstDateString();
  const config = options.config || getSocialConfig({ platforms: ['threads'] });
  const hashtag = config.defaultHashtag || DEFAULT_HASHTAG;
  const displayUrl = buildDisplayUrlForPlatform(publicOrigin, config);
  const limit = getPostLimitForConfig(config);
  if (isPreReleasePosting(dateKey, config)) {
    return fitPostText([
      '先行 数秘オラクル',
      card.name,
      `テーマ：${oracleSocialTitle(card)}`,
      buildOracleLeadLine(card),
      buildOracleReadingLine(card),
      buildOracleActionLine(card),
      buildRepeatCycleNote(dateKey, ORACLE_CARD_CYCLE_LENGTH),
      displayUrl,
      hashtag,
    '公開日にまた届きます',
    ], limit);
  }
  return fitPostText([
    '今日の数秘オラクル',
    card.name,
    `テーマ：${oracleSocialTitle(card)}`,
    buildOracleLeadLine(card),
    buildOracleReadingLine(card),
    buildOracleActionLine(card),
    buildRepeatCycleNote(dateKey, ORACLE_CARD_CYCLE_LENGTH),
    displayUrl,
    hashtag,
    '今日の1枚はこちら',
  ], limit);
}

function buildXOracleText(card, publicOrigin, options = {}) {
  const dateKey = options.dateKey || getJstDateString();
  const config = options.config || getSocialConfig({ platforms: ['x'] });
  const hashtags = getXHashtagLine(config);
  const displayUrl = buildDisplayUrl(publicOrigin);
  if (isPreReleasePosting(dateKey, config)) {
    return fitPostText([
      `先行オラクル：${card.name} / ${oracleSocialTitle(card)}`,
      buildOracleActionLine(card),
      buildRepeatCycleNote(dateKey, ORACLE_CARD_CYCLE_LENGTH),
      '公開日にまた届きます',
      displayUrl,
      hashtags,
    ], X_CHARACTER_LIMIT);
  }
  return fitPostText([
    `今日の数秘オラクル：${card.name}`,
    `テーマ：${oracleSocialTitle(card)}`,
    buildOracleActionLine(card),
    buildRepeatCycleNote(dateKey, ORACLE_CARD_CYCLE_LENGTH),
    displayUrl,
    hashtags,
  ], X_CHARACTER_LIMIT);
}

function splitSocialSentences(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return [];
  return value
    .split(/(?<=。)/u)
    .map(line => line.trim())
    .filter(Boolean);
}

function buildXOracleManualDraftText(card, publicOrigin, options = {}) {
  const dateKey = options.dateKey || getJstDateString();
  const publicUrl = (publicOrigin || DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, '');
  const copy = oracleSocialCopy(card);
  const leadLines = splitSocialSentences(copy.lead || buildOracleLeadLine(card));
  const readingLines = splitSocialSentences(copy.message || buildOracleReadingLine(card));
  const action = String(copy.support || ORACLE_SOFT_ACTIONS[Number(card.id)] || '').trim();
  const cycleNote = buildRepeatCycleNote(dateKey, ORACLE_CARD_CYCLE_LENGTH);
  const message = readingLines[0] || leadLines[0] || '';
  return fitPostText([
    'おはてけ🌸🦦',
    `今日の数秘オラクル：${card.name}`,
    `テーマ：${oracleSocialTitle(card)}`,
    message ? `カードメッセージ：${message}` : '',
    action ? `今日のよりどころ：${action}` : '',
    cycleNote || null,
    '今日の1枚はこちら',
    publicUrl,
    X_ORACLE_HASHTAGS.join(' '),
  ].filter(line => line !== null), X_CHARACTER_LIMIT);
}

function buildBlueskyOracleText(card, publicOrigin, options = {}) {
  const config = options.config || getSocialConfig({ platforms: ['bluesky'] });
  return buildOracleText(card, publicOrigin, { ...options, config });
}

function buildOracleAltText(card) {
  return `数秘オラクルカード No.${card.id}「${card.name}」。テーマは「${oracleSocialTitle(card)}」。`;
}

function pickConceptImage(entry, dateKey) {
  const theme = String(entry?.eveningTheme || '');
  if (theme.includes('プレリリース') || theme.includes('羅針占術とは') || isBeforeRelease(dateKey)) {
    return SOCIAL_CONCEPT_IMAGES.vertical;
  }
  if (theme.includes('使い方') || theme.includes('無料鑑定') || theme.includes('今日のオラクル')) {
    return SOCIAL_CONCEPT_IMAGES.icon;
  }
  return SOCIAL_CONCEPT_IMAGES.wide;
}

function pickBlueskyConceptImage(conceptImage) {
  return {
    ...conceptImage,
    file: conceptImage?.blueskyFile || conceptImage?.file,
  };
}

function buildConceptText(dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['threads'] })) {
  const entry = getCalendarEntry(dateKey);
  const paidCta = resolvePaidCta(entry, config);
  const link = buildConceptTrackedUrl(dateKey, publicOrigin, config, paidCta);
  return fitPostText([
    pickNightConceptBody(dateKey),
    buildRepeatCycleNote(dateKey, NIGHT_CONCEPT_POSTS.length),
    buildNightConceptCtaLine(paidCta, dateKey, config),
    link,
    config.defaultHashtag || DEFAULT_HASHTAG,
  ], BLUESKY_CHARACTER_LIMIT);
}

const X_CONCEPT_POSTS = {
  '先行版: 羅針占術とは': '自作AI占いアプリ「羅針占術」を5/16にプレリリースします。\n\n未来を断定せず、本質・本音・いまの現実から次の一手を整理する占いです。',
  '羅針占術とは': '本日、自作AI占いアプリ「羅針占術」をプレリリースしました。\n\n迷いを「次の一手」に変える占いです。',
  '今日のオラクルの使い方': '今日のオラクルは、読むだけで終わらせず、今日の行動をひとつ決めるために使えます。',
  '無料鑑定で見えるもの': '無料鑑定では、本質・本音・いまの現実・次の一手まで整理できます。',
  '二択にしない迷いの整理': '迷っているときは、二択に見えるものを「試す・待つ・相談する」に分けてみてください。',
  '読みっぱなしにしない占い': '占いは、読んで終わりにしなくてもいい。迷い、カード、その後の行動を残すと変化が見えます。',
  '鑑定結果を記録する価値': '前回の迷いを見返すと、同じ悩みに見えても少し変わっていることがあります。',
  '深掘り鑑定の違い': '深掘り鑑定は、無料で見えた流れを追加カードと質問で具体化する鑑定です。',
  'BOOTH購入後の流れ': '購入情報はSNSでは扱いません。必要な方だけ、アプリ内の案内からBOOTH購入と注文番号入力に進めます。',
  '迷いを3行で整理する': '今週の迷いを3行で整理するなら、何に迷ったか、何を後回しにしたか、何を少し動かせたか。',
  '当てるより整理する占い': '悪いカードが悪い未来を決めるわけではありません。注意点は、整えるためのヒントです。',
  '仕事・転職の使い方': '仕事の迷いは、今すぐ決めることと、まず確認することを分けると前に進みやすくなります。',
  '恋愛で断定しない理由': '恋愛占いで大切にしたいのは、相手の気持ちを決めつけることではなく、自分の本音を見ることです。',
  '専門判断の代替にしない': 'お金、健康、法律の不安が強いときほど、占いだけで判断しないことが大切です。',
  '深掘り鑑定の利用例': '深掘り鑑定は強い結果を出すものではなく、次に確認したいことを具体化する鑑定です。',
  '今日のオラクルから深掘りまでの流れ': '今日のオラクルは入口。無料鑑定は整理。必要な方だけ深掘りへ。',
  'プレリリース前日案内': '明日、自作AI占いアプリ「羅針占術」をプレリリースします。\n\n入口は無料の今日のオラクルと無料鑑定です。',
};

function buildXConceptText(dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['x'] })) {
  const entry = getCalendarEntry(dateKey);
  const paidCta = resolvePaidCta(entry, config);
  const hashtags = getXHashtagLine(config);
  const link = buildConceptTrackedUrl(dateKey, publicOrigin, config, paidCta);
  return fitPostText([
    pickNightConceptBody(dateKey),
    buildRepeatCycleNote(dateKey, NIGHT_CONCEPT_POSTS.length),
    buildNightConceptCtaLine(paidCta, dateKey, config),
    link,
    hashtags,
  ], X_CHARACTER_LIMIT);
}

function buildBlueskyConceptText(dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['bluesky'] })) {
  return buildConceptText(dateKey, publicOrigin, config);
}

function pickMiddayTopic(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const day = Number.isNaN(date.getTime()) ? 0 : date.getUTCDay();
  return MIDDAY_TOPIC_POSTS[day % MIDDAY_TOPIC_POSTS.length];
}

function pickMiddayFocus(dateKey) {
  const start = new Date(`${CARD_CYCLE_START_DATE}T00:00:00.000Z`);
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(date.getTime())) return MIDDAY_FOCUS_LINES[0];
  const diffDays = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return MIDDAY_FOCUS_LINES[((diffDays % MIDDAY_FOCUS_LINES.length) + MIDDAY_FOCUS_LINES.length) % MIDDAY_FOCUS_LINES.length];
}

function buildMiddayText(dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['threads'] })) {
  const focus = pickMiddayFocus(dateKey);
  if (isPreReleasePosting(dateKey, config)) {
    return fitPostText([
      '昼の羅針｜公開前メモ',
      '羅針占術は5/16公開予定です。悩みを未来の断定で終わらせず、現実と本音を分けて次の一手を整理するAI占いとして準備しています。',
      focus,
      '気になる方は保存して、公開日に見返してください。',
      buildDisplayUrlForPlatform(publicOrigin, config),
      config.defaultHashtag || DEFAULT_HASHTAG,
    ], BLUESKY_CHARACTER_LIMIT);
  }
  const topic = pickMiddayTopic(dateKey);
  return fitPostText([
    topic.title,
    topic.body,
    focus,
    '無料鑑定はこちら',
    buildDisplayUrlForPlatform(publicOrigin, config),
    config.defaultHashtag || DEFAULT_HASHTAG,
  ], BLUESKY_CHARACTER_LIMIT);
}

function buildXMiddayText(dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['x'] })) {
  const focus = pickMiddayFocus(dateKey);
  if (isPreReleasePosting(dateKey, config)) {
    return fitPostText([
      '昼の羅針｜公開前メモ',
      '羅針占術は5/16公開予定です。現実と本音を分けて、次の一手を整理するAI占いとして準備しています。',
      focus,
      '保存して、公開日に見返してください。',
      buildDisplayUrl(publicOrigin),
      getXHashtagLine(config),
    ], X_CHARACTER_LIMIT);
  }
  const topic = pickMiddayTopic(dateKey);
  return fitPostText([
    topic.title,
    topic.body,
    focus,
    '無料鑑定はこちら',
    buildDisplayUrl(publicOrigin),
    getXHashtagLine(config),
  ], X_CHARACTER_LIMIT);
}

function buildBlueskyMiddayText(dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['bluesky'] })) {
  return buildMiddayText(dateKey, publicOrigin, config);
}

function getPostLimitForConfig(config) {
  if (config?.primaryPlatform === 'bluesky') return BLUESKY_CHARACTER_LIMIT;
  if (config?.primaryPlatform === 'instagram') return INSTAGRAM_CHARACTER_LIMIT;
  return THREADS_CHARACTER_LIMIT;
}

function buildScheduledCycleNote(dateKey, weekdays, cycleLength, noun) {
  const index = getScheduledOccurrenceIndex(dateKey, weekdays);
  const cycle = Math.floor(index / cycleLength) + 1;
  if (cycle <= 1) return '';
  return `${cycle}巡目の${noun}：同じテーマでも、今日の景色は少し違います。`;
}

function buildGenericSocialText(parts, dateKey, publicOrigin, config, options = {}) {
  const limit = options.limit || getPostLimitForConfig(config);
  return fitPostText([
    ...parts,
    options.cycleNote || '',
    buildDisplayUrlForPlatform(publicOrigin, config),
    config.defaultHashtag || DEFAULT_HASHTAG,
  ], limit);
}

function buildXGenericSocialText(parts, publicOrigin, config, options = {}) {
  return fitPostText([
    ...parts,
    options.cycleNote || '',
    buildDisplayUrl(publicOrigin),
    getXHashtagLine(config),
  ], options.limit || THREADS_CHARACTER_LIMIT);
}

function buildInstagramSocialText(parts, dateKey, publicOrigin, config, options = {}) {
  const heading = options.heading || '保存用メモ';
  const note = options.note || '画像とあわせて、後で見返しやすい形にまとめています。';
  return buildGenericSocialText([
    heading,
    ...parts,
    note,
  ], dateKey, publicOrigin, config, {
    cycleNote: options.cycleNote || '',
  });
}

function buildQuestionSocialText(item, dateKey, config, options = {}) {
  const limit = options.limit || getPostLimitForConfig(config);
  return fitPostText([
    item.prompt,
    item.optionA,
    item.optionB,
    item.followup,
    options.cycleNote || '',
    options.extraLine || '',
    config.defaultHashtag || DEFAULT_HASHTAG,
  ], limit);
}

function pickEmpathyPost(dateKey) {
  return pickScheduledContent(LENORMAND_EMPATHY_POSTS, dateKey, EMPATHY_WEEKDAYS, 'empathy-lenormand');
}

function pickQuestionPost(dateKey) {
  return pickScheduledContent(THREAD_QUESTION_POSTS, dateKey, QUESTION_WEEKDAYS, 'thread-question');
}

function pickDifferencePost(dateKey) {
  return pickScheduledContent(DIFFERENCE_POSTS, dateKey, DIFFERENCE_WEEKDAYS, 'difference');
}

function pickFreePaidComparePost(dateKey) {
  return pickScheduledContent(FREE_PAID_COMPARE_POSTS, dateKey, FREE_PAID_COMPARE_WEEKDAYS, 'free-paid-compare');
}

function buildLenormandCardLine(item) {
  return `No.${pad2(item.cardNumber)} / ${item.cardName} / ${item.cardNameEn}`;
}

function buildLenormandOneCardParts(item) {
  return [
    '今日のルノルマン一枚',
    buildLenormandCardLine(item),
    item.title,
    `今日の兆し\n${item.message}`,
    `流れのサイン\n${item.action}`,
    item.cta,
  ];
}

function buildEmpathyText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['threads'] })) {
  return buildGenericSocialText(buildLenormandOneCardParts(item), dateKey, publicOrigin, config, {
    cycleNote: buildScheduledCycleNote(dateKey, EMPATHY_WEEKDAYS, LENORMAND_EMPATHY_POSTS.length, 'カード'),
  });
}

function buildXEmpathyText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['x'] })) {
  return buildXGenericSocialText(buildLenormandOneCardParts(item), publicOrigin, config, {
    cycleNote: buildScheduledCycleNote(dateKey, EMPATHY_WEEKDAYS, LENORMAND_EMPATHY_POSTS.length, 'カード'),
  });
}

function buildInstagramEmpathyText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['instagram'] })) {
  return buildEmpathyText(item, dateKey, publicOrigin, config);
}

function buildQuestionText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['threads'] })) {
  return buildQuestionSocialText(item, dateKey, config, {
    cycleNote: buildScheduledCycleNote(dateKey, QUESTION_WEEKDAYS, THREAD_QUESTION_POSTS.length, '質問'),
    extraLine: 'AかBだけで大丈夫です。今近い方を返信に一文字で置いてください。',
  });
}

function buildXQuestionText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['x'] })) {
  return buildQuestionSocialText(item, dateKey, config, {
    cycleNote: buildScheduledCycleNote(dateKey, QUESTION_WEEKDAYS, THREAD_QUESTION_POSTS.length, '質問'),
    extraLine: '返信しやすいほうを一文字で残せます。',
  });
}

function buildInstagramQuestionText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['instagram'] })) {
  return buildQuestionSocialText(item, dateKey, config, {
    cycleNote: buildScheduledCycleNote(dateKey, QUESTION_WEEKDAYS, THREAD_QUESTION_POSTS.length, '質問'),
    extraLine: 'コメントではA/Bだけでも大丈夫です。保存して後で見返す用にも使えます。',
  });
}

function buildDifferenceText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['threads'] })) {
  return buildGenericSocialText([
    item.title,
    item.body,
    item.cta,
  ], dateKey, publicOrigin, config, {
    cycleNote: buildScheduledCycleNote(dateKey, DIFFERENCE_WEEKDAYS, DIFFERENCE_POSTS.length, '違い紹介'),
  });
}

function buildXDifferenceText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['x'] })) {
  return buildXGenericSocialText([
    item.title,
    item.body,
    item.cta,
  ], publicOrigin, config, {
    cycleNote: buildScheduledCycleNote(dateKey, DIFFERENCE_WEEKDAYS, DIFFERENCE_POSTS.length, '違い紹介'),
  });
}

function buildInstagramDifferenceText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['instagram'] })) {
  return buildDifferenceText(item, dateKey, publicOrigin, config);
}

function buildFreePaidCompareText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['threads'] })) {
  return buildGenericSocialText([
    item.title,
    item.body,
    item.cta,
  ], dateKey, publicOrigin, config, {
    cycleNote: buildScheduledCycleNote(dateKey, FREE_PAID_COMPARE_WEEKDAYS, FREE_PAID_COMPARE_POSTS.length, '比較'),
  });
}

function buildXFreePaidCompareText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['x'] })) {
  return buildXGenericSocialText([
    item.title,
    item.body,
    item.cta,
  ], publicOrigin, config, {
    cycleNote: buildScheduledCycleNote(dateKey, FREE_PAID_COMPARE_WEEKDAYS, FREE_PAID_COMPARE_POSTS.length, '比較'),
  });
}

function buildInstagramFreePaidCompareText(item, dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['instagram'] })) {
  return buildFreePaidCompareText(item, dateKey, publicOrigin, config);
}

function buildEmpathyAltText(item) {
  return `ルノルマンカード No.${item.cardNumber}「${item.cardName} / ${item.cardNameEn}」。今日のルノルマン一枚投稿で使うカード画像。`;
}

function buildQuestionAltText(item) {
  return `羅針占術のA/B質問投稿。テーマは「${item.title}」。`;
}

function buildDifferenceAltText(item) {
  return `${SOCIAL_CONTENT_IMAGES.difference.altText} 投稿テーマは「${item.title}」。`;
}

function buildFreePaidCompareAltText(item) {
  return `${SOCIAL_CONTENT_IMAGES.free_paid_compare.altText} 投稿テーマは「${item.title}」。`;
}

async function buildDraft(args) {
  const dateKey = args.date || getJstDateString();
  const publicOrigin = (process.env.PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, '');
  const config = getSocialConfig(args);
  const threadsConfig = withPlatform(config, 'threads');
  const xConfig = withPlatform(config, 'x');
  const blueskyConfig = withPlatform(config, 'bluesky');
  const instagramOracleConfig = withInstagramKind(config, 'oracle');
  const instagramEmpathyConfig = withInstagramKind(config, 'empathy');
  const instagramQuestionConfig = withInstagramKind(config, 'question');
  const instagramDifferenceConfig = withInstagramKind(config, 'difference');
  const instagramFreePaidCompareConfig = withInstagramKind(config, 'free_paid_compare');
  const instagramMiddayConfig = withInstagramKind(config, 'midday');
  const instagramConceptConfig = withInstagramKind(config, 'concept');
  const calendar = getCalendarEntry(dateKey);
  const paidCta = resolvePaidCta(calendar, config);
  const conceptImage = pickConceptImage(calendar, dateKey);
  const empathyPost = pickEmpathyPost(dateKey);
  const questionPost = pickQuestionPost(dateKey);
  const differencePost = pickDifferencePost(dateKey);
  const freePaidComparePost = pickFreePaidComparePost(dateKey);
  const differenceImage = SOCIAL_CONTENT_IMAGES.difference;
  const freePaidCompareImage = SOCIAL_CONTENT_IMAGES.free_paid_compare;
  const blueskyConceptImage = pickBlueskyConceptImage(conceptImage);
  const middayImage = SOCIAL_CONCEPT_IMAGES.icon;
  const questionImage = SOCIAL_CONCEPT_IMAGES.vertical;
  const blueskyMiddayImage = pickBlueskyConceptImage(middayImage);
  const blueskyQuestionImage = pickBlueskyConceptImage(questionImage);
  const blueskyDifferenceImage = pickBlueskyConceptImage(differenceImage);
  const blueskyFreePaidCompareImage = pickBlueskyConceptImage(freePaidCompareImage);
  const instagramConceptImage = pickBlueskyConceptImage(conceptImage);
  const instagramMiddayImage = pickBlueskyConceptImage(middayImage);
  const conceptImagePath = path.join(ROOT, 'images', 'ui', conceptImage.file);
  const blueskyConceptImagePath = path.join(ROOT, 'images', 'ui', blueskyConceptImage.file);
  const middayImagePath = path.join(ROOT, 'images', 'ui', middayImage.file);
  const questionImagePath = path.join(ROOT, 'images', 'ui', questionImage.blueskyFile || questionImage.file);
  const blueskyMiddayImagePath = path.join(ROOT, 'images', 'ui', blueskyMiddayImage.file);
  const blueskyQuestionImagePath = path.join(ROOT, 'images', 'ui', blueskyQuestionImage.file);
  const empathyImagePath = lenormandImagePath(empathyPost.cardNumber);
  const empathyImageUrl = lenormandImageUrl(publicOrigin, empathyPost.cardNumber);
  const differenceImagePath = instagramSocialImagePath(differenceImage.file);
  const blueskyDifferenceImagePath = instagramSocialImagePath(blueskyDifferenceImage.file);
  const freePaidCompareImagePath = instagramSocialImagePath(freePaidCompareImage.file);
  const blueskyFreePaidCompareImagePath = instagramSocialImagePath(blueskyFreePaidCompareImage.file);
  const instagramConceptImagePath = path.join(ROOT, 'images', 'ui', instagramConceptImage.file);
  const instagramMiddayImagePath = path.join(ROOT, 'images', 'ui', instagramMiddayImage.file);
  const questionImageUrl = buildPublicUiImageUrl(publicOrigin, questionImage.blueskyFile || questionImage.file);
  const messages = await loadDailyOracleMessages();
  const card = await pickCard(messages, dateKey, args.write || args.post, args);
  const imageName = `${String(card.id).padStart(2, '0')}.jpg`;
  const oracleInstagramImagePath = instagramSocialImagePath('oracle', imageName);
  const oracleInstagramImageUrl = instagramSocialImageUrl(publicOrigin, 'oracle', imageName);
  const empathyInstagramImageName = lenormandImageName(empathyPost.cardNumber);
  const empathyInstagramImagePath = instagramSocialImagePath('lenormand-empathy', empathyInstagramImageName);
  const empathyInstagramImageUrl = instagramSocialImageUrl(publicOrigin, 'lenormand-empathy', empathyInstagramImageName);
  const differenceInstagramImagePath = instagramSocialImagePath('difference.jpg');
  const differenceInstagramImageUrl = instagramSocialImageUrl(publicOrigin, 'difference.jpg');
  const freePaidCompareInstagramImagePath = instagramSocialImagePath('free-paid-compare.jpg');
  const freePaidCompareInstagramImageUrl = instagramSocialImageUrl(publicOrigin, 'free-paid-compare.jpg');
  const draft = {
    date: dateKey,
    schedule: {
      oracle: `${process.env.SOCIAL_ORACLE_TIME || '07:00'} Asia/Tokyo`,
      empathy: `${process.env.SOCIAL_EMPATHY_TIME || '12:00'} Asia/Tokyo Mon/Wed/Fri`,
      question: `${process.env.SOCIAL_QUESTION_TIME || '12:00'} Asia/Tokyo Tue/Thu`,
      difference: `${process.env.SOCIAL_DIFFERENCE_TIME || '20:00'} Asia/Tokyo Tue`,
      free_paid_compare: `${process.env.SOCIAL_FREE_PAID_COMPARE_TIME || '20:00'} Asia/Tokyo Sat`,
      midday: `${process.env.SOCIAL_MIDDAY_TIME || '12:00'} Asia/Tokyo`,
      concept: `${process.env.SOCIAL_CONCEPT_TIME || '20:00'} Asia/Tokyo`,
    },
    oracle: {
      card,
      imagePath: oracleInstagramImagePath,
      imageUrl: oracleInstagramImageUrl,
      altText: buildOracleAltText(card),
      text: buildOracleText(card, publicOrigin, { dateKey, config: threadsConfig }),
      trackedUrl: buildOracleTrackedUrl(card, publicOrigin, threadsConfig, dateKey),
      xText: buildXOracleManualDraftText(card, publicOrigin, { dateKey }),
      xTrackedUrl: buildOracleTrackedUrl(card, publicOrigin, xConfig, dateKey),
      blueskyText: buildBlueskyOracleText(card, publicOrigin, { dateKey, config: blueskyConfig }),
      blueskyTrackedUrl: buildOracleTrackedUrl(card, publicOrigin, blueskyConfig, dateKey),
      blueskyImagePath: oracleInstagramImagePath,
      blueskyImageUrl: oracleInstagramImageUrl,
      instagramText: buildOracleText(card, publicOrigin, { dateKey, config: instagramOracleConfig }),
      instagramTrackedUrl: buildOracleTrackedUrl(card, publicOrigin, instagramOracleConfig, dateKey),
      instagramImagePath: oracleInstagramImagePath,
      instagramImageUrl: oracleInstagramImageUrl,
    },
    empathy: {
      card: {
        cardNumber: empathyPost.cardNumber,
        cardName: empathyPost.cardName,
        cardNameEn: empathyPost.cardNameEn,
        tone: empathyPost.tone,
        title: empathyPost.title,
      },
      imagePath: empathyInstagramImagePath,
      imageUrl: empathyInstagramImageUrl,
      altText: buildEmpathyAltText(empathyPost),
      text: buildEmpathyText(empathyPost, dateKey, publicOrigin, threadsConfig),
      trackedUrl: buildEmpathyTrackedUrl(empathyPost, dateKey, publicOrigin, threadsConfig),
      xText: buildXEmpathyText(empathyPost, dateKey, publicOrigin, xConfig),
      xTrackedUrl: buildEmpathyTrackedUrl(empathyPost, dateKey, publicOrigin, xConfig),
      blueskyText: buildEmpathyText(empathyPost, dateKey, publicOrigin, blueskyConfig),
      blueskyTrackedUrl: buildEmpathyTrackedUrl(empathyPost, dateKey, publicOrigin, blueskyConfig),
      blueskyImagePath: empathyInstagramImagePath,
      blueskyImageUrl: empathyInstagramImageUrl,
      instagramText: buildInstagramEmpathyText(empathyPost, dateKey, publicOrigin, instagramEmpathyConfig),
      instagramTrackedUrl: buildEmpathyTrackedUrl(empathyPost, dateKey, publicOrigin, instagramEmpathyConfig),
      instagramImagePath: empathyInstagramImagePath,
      instagramImageUrl: empathyInstagramImageUrl,
    },
    question: {
      content: {
        version: questionPost.version,
        title: questionPost.title,
      },
      imagePath: questionImagePath,
      imageUrl: questionImageUrl,
      altText: buildQuestionAltText(questionPost),
      text: buildQuestionText(questionPost, dateKey, publicOrigin, threadsConfig),
      trackedUrl: buildQuestionTrackedUrl(questionPost, dateKey, publicOrigin, threadsConfig),
      xText: buildXQuestionText(questionPost, dateKey, publicOrigin, xConfig),
      xTrackedUrl: buildQuestionTrackedUrl(questionPost, dateKey, publicOrigin, xConfig),
      blueskyText: buildQuestionText(questionPost, dateKey, publicOrigin, blueskyConfig),
      blueskyTrackedUrl: buildQuestionTrackedUrl(questionPost, dateKey, publicOrigin, blueskyConfig),
      blueskyImagePath: blueskyQuestionImagePath,
      blueskyImageUrl: buildPublicUiImageUrl(publicOrigin, blueskyQuestionImage.file),
      instagramText: buildInstagramQuestionText(questionPost, dateKey, publicOrigin, instagramQuestionConfig),
      instagramTrackedUrl: buildQuestionTrackedUrl(questionPost, dateKey, publicOrigin, instagramQuestionConfig),
      instagramImagePath: questionImagePath,
      instagramImageUrl: questionImageUrl,
    },
    difference: {
      content: {
        version: differencePost.version,
        title: differencePost.title,
      },
      imagePath: differenceImagePath,
      imageUrl: instagramSocialImageUrl(publicOrigin, differenceImage.file),
      altText: buildDifferenceAltText(differencePost),
      text: buildDifferenceText(differencePost, dateKey, publicOrigin, threadsConfig),
      trackedUrl: buildDifferenceTrackedUrl(differencePost, dateKey, publicOrigin, threadsConfig),
      xText: buildXDifferenceText(differencePost, dateKey, publicOrigin, xConfig),
      xTrackedUrl: buildDifferenceTrackedUrl(differencePost, dateKey, publicOrigin, xConfig),
      blueskyText: buildDifferenceText(differencePost, dateKey, publicOrigin, blueskyConfig),
      blueskyTrackedUrl: buildDifferenceTrackedUrl(differencePost, dateKey, publicOrigin, blueskyConfig),
      blueskyImagePath: blueskyDifferenceImagePath,
      blueskyImageUrl: instagramSocialImageUrl(publicOrigin, blueskyDifferenceImage.file),
      instagramText: buildInstagramDifferenceText(differencePost, dateKey, publicOrigin, instagramDifferenceConfig),
      instagramTrackedUrl: buildDifferenceTrackedUrl(differencePost, dateKey, publicOrigin, instagramDifferenceConfig),
      instagramImagePath: differenceInstagramImagePath,
      instagramImageUrl: differenceInstagramImageUrl,
    },
    free_paid_compare: {
      content: {
        version: freePaidComparePost.version,
        title: freePaidComparePost.title,
      },
      imagePath: freePaidCompareImagePath,
      imageUrl: instagramSocialImageUrl(publicOrigin, freePaidCompareImage.file),
      altText: buildFreePaidCompareAltText(freePaidComparePost),
      text: buildFreePaidCompareText(freePaidComparePost, dateKey, publicOrigin, threadsConfig),
      trackedUrl: buildFreePaidCompareTrackedUrl(freePaidComparePost, dateKey, publicOrigin, threadsConfig),
      xText: buildXFreePaidCompareText(freePaidComparePost, dateKey, publicOrigin, xConfig),
      xTrackedUrl: buildFreePaidCompareTrackedUrl(freePaidComparePost, dateKey, publicOrigin, xConfig),
      blueskyText: buildFreePaidCompareText(freePaidComparePost, dateKey, publicOrigin, blueskyConfig),
      blueskyTrackedUrl: buildFreePaidCompareTrackedUrl(freePaidComparePost, dateKey, publicOrigin, blueskyConfig),
      blueskyImagePath: blueskyFreePaidCompareImagePath,
      blueskyImageUrl: instagramSocialImageUrl(publicOrigin, blueskyFreePaidCompareImage.file),
      instagramText: buildInstagramFreePaidCompareText(freePaidComparePost, dateKey, publicOrigin, instagramFreePaidCompareConfig),
      instagramTrackedUrl: buildFreePaidCompareTrackedUrl(freePaidComparePost, dateKey, publicOrigin, instagramFreePaidCompareConfig),
      instagramImagePath: freePaidCompareInstagramImagePath,
      instagramImageUrl: freePaidCompareInstagramImageUrl,
    },
    midday: {
      imagePath: middayImagePath,
      imageUrl: buildPublicUiImageUrl(publicOrigin, middayImage.file),
      altText: middayImage.altText,
      text: buildMiddayText(dateKey, publicOrigin, threadsConfig),
      trackedUrl: buildMiddayTrackedUrl(dateKey, publicOrigin, threadsConfig),
      xText: buildXMiddayText(dateKey, publicOrigin, xConfig),
      xTrackedUrl: buildMiddayTrackedUrl(dateKey, publicOrigin, xConfig),
      blueskyText: buildBlueskyMiddayText(dateKey, publicOrigin, blueskyConfig),
      blueskyTrackedUrl: buildMiddayTrackedUrl(dateKey, publicOrigin, blueskyConfig),
      blueskyImagePath: blueskyMiddayImagePath,
      blueskyImageUrl: buildPublicUiImageUrl(publicOrigin, blueskyMiddayImage.file),
      instagramText: buildMiddayText(dateKey, publicOrigin, instagramMiddayConfig),
      instagramTrackedUrl: buildMiddayTrackedUrl(dateKey, publicOrigin, instagramMiddayConfig),
      instagramImagePath: instagramMiddayImagePath,
      instagramImageUrl: buildPublicUiImageUrl(publicOrigin, instagramMiddayImage.file),
    },
    concept: {
      imagePath: conceptImagePath,
      imageUrl: buildPublicUiImageUrl(publicOrigin, conceptImage.file),
      altText: conceptImage.altText,
      text: buildConceptText(dateKey, publicOrigin, threadsConfig),
      trackedUrl: buildConceptTrackedUrl(dateKey, publicOrigin, threadsConfig, paidCta),
      xText: buildXConceptText(dateKey, publicOrigin, xConfig),
      xTrackedUrl: buildConceptTrackedUrl(dateKey, publicOrigin, xConfig, paidCta),
      blueskyText: buildBlueskyConceptText(dateKey, publicOrigin, blueskyConfig),
      blueskyTrackedUrl: buildConceptTrackedUrl(dateKey, publicOrigin, blueskyConfig, paidCta),
      blueskyImagePath: blueskyConceptImagePath,
      blueskyImageUrl: buildPublicUiImageUrl(publicOrigin, blueskyConceptImage.file),
      instagramText: buildConceptText(dateKey, publicOrigin, instagramConceptConfig),
      instagramTrackedUrl: buildConceptTrackedUrl(dateKey, publicOrigin, instagramConceptConfig, paidCta),
      instagramImagePath: instagramConceptImagePath,
      instagramImageUrl: buildPublicUiImageUrl(publicOrigin, instagramConceptImage.file),
    },
    meta: {
      releasePhase: getReleasePhase(dateKey),
      releasePlan: {
        prelaunchUntil: '2026-05-15',
        prereleaseStart: PRERELEASE_START_DATE,
        prereleaseEnd: PRERELEASE_END_DATE,
        fixPeriodStart: '2026-05-30',
        fixPeriodEnd: FIX_PERIOD_END_DATE,
        fullReleaseDate: FULL_RELEASE_DATE,
      },
      socialConfig: {
        primaryPlatform: config.primaryPlatform,
        paidCtaMode: config.paidCtaMode,
        releaseMode: config.releaseMode,
        boothEnabled: config.boothEnabled,
        stripeEnabled: config.stripeEnabled,
        campaign: config.campaign,
        enableBluesky: config.enableBluesky,
        enableInstagram: config.enableInstagram,
        expansionStartDate: SOCIAL_EXPANSION_START_DATE,
      },
      content: {
        empathy: {
          cardNumber: empathyPost.cardNumber,
          cardName: empathyPost.cardName,
          cardNameEn: empathyPost.cardNameEn,
          tone: empathyPost.tone,
          title: empathyPost.title,
        },
        question: {
          version: questionPost.version,
          title: questionPost.title,
        },
        difference: {
          version: differencePost.version,
          title: differencePost.title,
        },
        freePaidCompare: {
          version: freePaidComparePost.version,
          title: freePaidComparePost.title,
        },
      },
      calendar: calendar ? {
        morningTheme: calendar.morningTheme,
        eveningTheme: calendar.eveningTheme,
        paidCta,
      } : null,
      policy: {
        hashtag: config.defaultHashtag,
        threadsHashtag: getThreadsHashtagLine(threadsConfig),
        blueskyHashtags: getBlueskyHashtagLine(blueskyConfig),
        xHashtags: getXHashtagLine(xConfig),
        blockedWordCount: NG_WORDS.length,
      },
    },
  };
  validateDraft(draft, args);
  if (args.write || args.post) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(path.join(OUT_DIR, `${dateKey}.json`), `${JSON.stringify(draft, null, 2)}\n`);
  }
  return draft;
}

function oauthEncode(value) {
  return encodeURIComponent(value).replace(/[!*()']/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader(method, url, extraParams = {}) {
  const required = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing X credentials: ${missing.join(', ')}`);
  const oauth = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  const allParams = { ...extraParams, ...oauth };
  const paramString = Object.keys(allParams).sort().map(key => `${oauthEncode(key)}=${oauthEncode(allParams[key])}`).join('&');
  const base = [method.toUpperCase(), oauthEncode(url), oauthEncode(paramString)].join('&');
  const signingKey = `${oauthEncode(process.env.X_API_SECRET)}&${oauthEncode(process.env.X_ACCESS_TOKEN_SECRET)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  return `OAuth ${Object.keys(oauth).sort().map(key => `${oauthEncode(key)}="${oauthEncode(oauth[key])}"`).join(', ')}`;
}

async function postToX(text, imagePath) {
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
  const image = await fs.readFile(imagePath);
  const form = new FormData();
  form.append('media', new Blob([image], { type: 'image/jpeg' }), path.basename(imagePath));
  form.append('media_category', 'tweet_image');
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: buildOAuthHeader('POST', uploadUrl) },
    body: form,
  });
  const uploadJson = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) throw new Error(`X media upload failed: ${uploadRes.status} ${JSON.stringify(uploadJson)}`);
  const tweetUrl = 'https://api.x.com/2/tweets';
  const tweetRes = await fetch(tweetUrl, {
    method: 'POST',
    headers: {
      Authorization: buildOAuthHeader('POST', tweetUrl),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      media: { media_ids: [uploadJson.media_id_string] },
    }),
  });
  const tweetJson = await tweetRes.json().catch(() => ({}));
  if (!tweetRes.ok) throw new Error(`X post failed: ${tweetRes.status} ${JSON.stringify(tweetJson)}`);
  return tweetJson;
}

async function postTextToX(text) {
  const tweetUrl = 'https://api.x.com/2/tweets';
  const tweetRes = await fetch(tweetUrl, {
    method: 'POST',
    headers: {
      Authorization: buildOAuthHeader('POST', tweetUrl),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  const tweetJson = await tweetRes.json().catch(() => ({}));
  if (!tweetRes.ok) throw new Error(`X post failed: ${tweetRes.status} ${JSON.stringify(tweetJson)}`);
  return tweetJson;
}

async function postToThreads(text, imageUrl, altText = '') {
  return threadsClient.postImageToThreads({ text, imageUrl, altText });
}

async function postTextToThreads(text) {
  return threadsClient.postTextToThreads({ text });
}

async function postToInstagram(text, imageUrl, altText = '') {
  return instagramClient.postImageToInstagram({ text, imageUrl, altText });
}

function extractUtmContent(text) {
  const match = String(text || '').match(/[?&]utm_content=([^&#\s]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function hasPublicUrl(text) {
  return hasDisplayUrl(text);
}

function normalizeDuplicateText(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findExistingThreadsPost({ marker = null, text = '' } = {}) {
  if (process.env.SOCIAL_ALLOW_DUPLICATE_POSTS === 'true') return null;
  if (!marker && !text) throw new Error('Missing duplicate protection marker or text.');
  const recent = await threadsClient.listThreads({ limit: Number(process.env.THREADS_DUPLICATE_LOOKBACK || 25) });
  const normalizedText = normalizeDuplicateText(text);
  return (recent.data || []).find(post => {
    const postText = String(post.text || '');
    if (marker && postText.includes(`utm_content=${marker}`)) return true;
    return normalizedText && normalizeDuplicateText(postText) === normalizedText;
  }) || null;
}

async function findExistingBlueskyPost({ marker = null, text = '' } = {}) {
  if (process.env.SOCIAL_ALLOW_DUPLICATE_POSTS === 'true') return null;
  if (!marker && !text) throw new Error('Missing duplicate protection marker or text.');
  const credentials = blueskyClient.getBlueskyCredentials();
  const actor = credentials.expectedHandle || credentials.identifier;
  if (!actor) return null;
  const recent = await blueskyClient.listBlueskyAuthorFeed({
    actor,
    limit: Number(process.env.BLUESKY_DUPLICATE_LOOKBACK || 25),
  });
  const normalizedText = normalizeDuplicateText(text);
  return (recent.feed || []).map(item => item.post).find(post => {
    const postText = String(post?.record?.text || '');
    if (marker && postText.includes(`utm_content=${marker}`)) return true;
    return normalizedText && normalizeDuplicateText(postText) === normalizedText;
  }) || null;
}

async function findExistingInstagramPost({ marker = null, text = '' } = {}) {
  if (process.env.SOCIAL_ALLOW_DUPLICATE_POSTS === 'true') return null;
  if (!marker && !text) throw new Error('Missing duplicate protection marker or text.');
  const recent = await instagramClient.listInstagramMedia({
    limit: Number(process.env.INSTAGRAM_DUPLICATE_LOOKBACK || 25),
  });
  const normalizedText = normalizeDuplicateText(text);
  return (recent.data || []).find(post => {
    const postText = String(post.caption || '');
    if (marker && postText.includes(`utm_content=${marker}`)) return true;
    return normalizedText && normalizeDuplicateText(postText) === normalizedText;
  }) || null;
}

function selectedKindsFromArgs(args) {
  if (args.kind === 'all') return SOCIAL_POST_KINDS;
  if (DRAFT_POST_KINDS.includes(args.kind)) return [args.kind];
  return SOCIAL_POST_KINDS;
}

function shouldPostKind(args, kind) {
  return args.kind === 'all' || args.kind === kind;
}

function resultKeyFor(platform, kind) {
  return `${platform}${RESULT_SUFFIX_BY_KIND[kind] || kind.charAt(0).toUpperCase() + kind.slice(1)}`;
}

function isScheduledPostingRun() {
  return process.env.SOCIAL_SCHEDULED_RUN === 'true'
    && process.env.SOCIAL_AUTOMATED_POSTING_ENABLED === 'true';
}

function getRetryAttempts() {
  const raw = String(process.env.SOCIAL_API_RETRY_ATTEMPTS || '3').trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(5, Math.floor(value));
}

function getRetryDelayMs(attempt) {
  const raw = String(process.env.SOCIAL_API_RETRY_BASE_MS || '1500').trim();
  const base = Number(raw);
  const normalizedBase = Number.isFinite(base) && base >= 0 ? base : 1500;
  return normalizedBase * Math.max(1, attempt);
}

function isNonRetriableSocialError(error) {
  const message = String(error?.message || error || '');
  return /Missing |expected |too long|disabled|Unsupported|must |requires |not include|is empty|credentials/i.test(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withSocialRetry(label, operation) {
  const attempts = getRetryAttempts();
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || isNonRetriableSocialError(error)) break;
      console.error(JSON.stringify({
        retrying: label,
        attempt,
        nextAttempt: attempt + 1,
        error: error?.message || String(error),
      }));
      await sleep(getRetryDelayMs(attempt));
    }
  }
  throw lastError;
}

async function confirmPostingIfNeeded(args) {
  if (!args.post || args.yes || isScheduledPostingRun()) return;
  if (!process.stdin.isTTY) {
    throw new Error('Real posting requires a preview and an explicit yes. Re-run with --yes from an intentional manual command, or use the scheduled Render runner.');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Type yes to publish the previewed posts: ');
    if (answer.trim() !== 'yes') {
      throw new Error('Posting cancelled because confirmation was not "yes".');
    }
  } finally {
    rl.close();
  }
}

async function postImageToThreadsOnce({ text, imageUrl, altText, marker }) {
  const existing = await findExistingThreadsPost({ marker, text });
  if (existing) {
    return {
      skipped: true,
      reason: 'existing_threads_post',
      marker,
      id: existing.id,
      permalink: existing.permalink,
      timestamp: existing.timestamp,
    };
  }
  try {
    return await postToThreads(text, imageUrl, altText);
  } catch (error) {
    if (process.env.SOCIAL_THREADS_IMAGE_FALLBACK_TEXT !== 'true') throw error;
    const fallback = await postTextToThreads(text);
    return {
      ...fallback,
      fallback: 'text_after_image_failure',
      imageError: error.message,
    };
  }
}

async function postTextToThreadsOnce({ text, marker }) {
  const existing = await findExistingThreadsPost({ marker, text });
  if (existing) {
    return {
      skipped: true,
      reason: 'existing_threads_post',
      marker,
      id: existing.id,
      permalink: existing.permalink,
      timestamp: existing.timestamp,
    };
  }
  return postTextToThreads(text);
}

async function postImageToBlueskyOnce({ text, imagePath, altText, marker }) {
  const existing = await findExistingBlueskyPost({ marker, text });
  if (existing) {
    return {
      skipped: true,
      reason: 'existing_bluesky_post',
      marker,
      uri: existing.uri,
      cid: existing.cid,
      permalink: existing.uri ? `https://bsky.app/profile/${(blueskyClient.getBlueskyCredentials().expectedHandle || '').replace(/^@/, '')}/post/${String(existing.uri).split('/').pop()}` : null,
      indexedAt: existing.indexedAt,
    };
  }
  return blueskyClient.postImageToBluesky({ text, imagePath, altText });
}

async function postImageToInstagramOnce({ text, imageUrl, altText, marker }) {
  const existing = await findExistingInstagramPost({ marker, text });
  if (existing) {
    return {
      skipped: true,
      reason: 'existing_instagram_post',
      marker,
      id: existing.id,
      permalink: existing.permalink,
      timestamp: existing.timestamp,
    };
  }
  return postToInstagram(text, imageUrl, altText);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const draft = await buildDraft(args);
  console.log(JSON.stringify(draft, null, 2));
  const ledgerOptions = {
    platforms: args.platforms,
    kinds: selectedKindsFromArgs(args),
  };
  if (args.write || args.post) {
    await postLedger.recordDraft(draft, { ...ledgerOptions, status: 'draft' });
  }
  if (!args.post) return;
  await confirmPostingIfNeeded(args);
  const results = {};
  const kindsToPost = selectedKindsFromArgs(args);
  try {
    if (args.platforms.includes('x')) {
      if (process.env.SOCIAL_X_API_POSTING_ENABLED !== 'true') {
        throw new Error('X API posting is disabled. Generate X drafts with npm run social:x:drafts and post manually, or set SOCIAL_X_API_POSTING_ENABLED=true when official X API credentials are intentionally configured.');
      }
      for (const kind of kindsToPost) {
        const entry = draft[kind];
        results[resultKeyFor('x', kind)] = await withSocialRetry(`x:${kind}`, () => postToX(entry.xText, entry.imagePath));
      }
    }
    if (args.platforms.includes('threads')) {
      for (const kind of kindsToPost) {
        const entry = draft[kind];
        results[resultKeyFor('threads', kind)] = await withSocialRetry(`threads:${kind}`, () => postImageToThreadsOnce({
          text: entry.text,
          imageUrl: entry.imageUrl,
          altText: entry.altText,
          marker: extractUtmContent(entry.trackedUrl || entry.text),
        }));
      }
    }
    if (args.platforms.includes('bluesky')) {
      for (const kind of kindsToPost) {
        const entry = draft[kind];
        results[resultKeyFor('bluesky', kind)] = await withSocialRetry(`bluesky:${kind}`, () => postImageToBlueskyOnce({
          text: entry.blueskyText,
          imagePath: entry.blueskyImagePath,
          altText: entry.altText,
          marker: extractUtmContent(entry.blueskyTrackedUrl || entry.blueskyText),
        }));
      }
    }
    if (args.platforms.includes('instagram')) {
      for (const kind of kindsToPost) {
        const entry = draft[kind];
        results[resultKeyFor('instagram', kind)] = await withSocialRetry(`instagram:${kind}`, () => postImageToInstagramOnce({
          text: entry.instagramText,
          imageUrl: entry.instagramImageUrl,
          altText: entry.altText,
          marker: extractUtmContent(entry.instagramTrackedUrl || entry.instagramText),
        }));
      }
    }
    await postLedger.recordDraft(draft, { ...ledgerOptions, status: 'posted', results });
  } catch (error) {
    await postLedger.recordDraft(draft, { ...ledgerOptions, status: 'failed', results });
    throw error;
  }
  console.log(JSON.stringify({ posted: results }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
