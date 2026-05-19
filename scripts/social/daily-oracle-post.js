const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const readline = require('readline/promises');
const threadsClient = require('./threads-client');
const blueskyClient = require('./bluesky-client');
const postLedger = require('./post-ledger');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_JS = path.join(ROOT, 'app.js');
const OUT_DIR = path.join(ROOT, 'data', 'social-posts');
const STATE_FILE = path.join(OUT_DIR, 'daily-oracle-state.json');
const DEFAULT_PUBLIC_ORIGIN = 'https://rashin-senjutsu.onrender.com';
const DEFAULT_HASHTAG = '#羅針占術';
const DEFAULT_THREADS_HASHTAG = '#占い鑑定';
const DEFAULT_BLUESKY_HASHTAGS = '#羅針占術 #今日の占い #今日の運勢 #占い師';
const THREADS_CHARACTER_LIMIT = 500;
const X_CHARACTER_LIMIT = 280;
const BLUESKY_CHARACTER_LIMIT = 300;
const DEFAULT_SOCIAL_CAMPAIGN = '202605_prerelease';
const PRERELEASE_START_DATE = '2026-05-16';
const PRERELEASE_END_DATE = '2026-05-29';
const FIX_PERIOD_END_DATE = '2026-06-05';
const FULL_RELEASE_DATE = '2026-06-06';
const RELEASE_DATE = PRERELEASE_START_DATE;
const CARD_CYCLE_START_DATE = '2026-05-12';
const SOCIAL_PAID_CTA_MODES = new Set(['off', 'soft', 'active']);
const SOCIAL_RELEASE_MODES = new Set(['auto', 'prelaunch', 'prerelease', 'fix', 'release', 'launch', 'postrelease']);
const SOCIAL_POST_KINDS = ['oracle', 'midday', 'concept'];
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
  'AI占いにほしいのは、派手な断言より「今どう動くか」。\n羅針占術は、命術とカードを重ねて、恋愛・仕事・人間関係の迷いを次の一手まで落とし込みます。',
  'カードだけで未来を決めつけない。\n羅針占術は、名前・生まれ持つ傾向・動物タイプに加えて、ルノルマンで現実を読み、数秘オラクルで打開点を探すAI占いです。',
  '「当たった」で終わる占いではなく、「だから何をするか」まで見る占い。\n羅針占術は、本質・本音・現実・次の一手を分けて、悩みを動かせる形にします。',
  '恋愛で苦しい時ほど、相手の気持ちだけを追うと迷いやすい。\n羅針占術は、自分の本音・相手との距離・今できる一手を分けて整理します。',
  '仕事や転職で迷う時、必要なのは根性論ではなく判断材料。\n羅針占術は、性質・流れ・今の不安を整理して、次に確認することを見える形にします。',
  '人間関係の悩みは、正解探しより「どこで苦しくなっているか」を見る方が早い。\n羅針占術は、相手より先に自分の軸を整えるためのAI占いです。',
  '羅針占術は、怖がらせるための占いではありません。\n曖昧な不安を、本質・本音・現実・次の一手に分けて、今日できることまで小さくします。',
  '未来を断定されるより、今の状況を整理したい人へ。\n羅針占術は、姓名判断・四柱推命・カードを組み合わせて、迷いの輪郭を言葉にします。',
  '占いに依存するためではなく、自分で選び直すために。\n羅針占術は、命術で土台を見て、カードで今の流れを読み、最後に一手を決めます。',
  '「進む」「止まる」「様子を見る」。\n羅針占術は、その選択を感情だけで決めないために、性質・状況・カードの流れを重ねて整理します。',
  '相手の反応が気になる時ほど、自分の本音が置き去りになります。\n羅針占術は、相手を見る前に、自分が何を望んでいるかを整理します。',
  '悩みが大きい時は、答えより分解が先です。\n羅針占術は、恋愛・仕事・人間関係の不安を小さく分けて、次にできる行動まで落とします。',
  '羅針占術が見るのは、運命の一言ではなく「迷いの地図」です。\n自分の性質、今の流れ、カードの示す注意点を重ねて、進み方を探します。',
  '普通のAI占いで物足りない人へ。\n羅針占術は、命術・カード・動物タイプを重ねて、悩みを一問一答ではなく流れとして読みます。',
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
  1: '本音に近い方向を、ひとつだけ見失わない。',
  2: '支える前に、自分の負担も同じだけ見る。',
  3: '重さを少しゆるめる選び方を探す。',
  4: '足元を整える意識をひとつ持つ。',
  5: 'いつもの外側に、小さな余白を見る。',
  6: '優しさの向きが自分を削っていないか確かめる。',
  7: 'ひとつを丁寧に扱う意識を持つ。',
  8: '力を向ける先を、感情だけで決めない。',
  9: 'もう役目を終えたものに気づく。',
  10: '再開より、組み直しの視点で見る。',
  11: 'ひらめきを急いで結論にしない。',
  12: 'どちらかを責める前に、余白を置く。',
  13: '続けるものと変えるものを分けて見る。',
  14: '足しすぎ、減らしすぎの偏りを見る。',
  15: '引き受ける前に、動機の濁りを見る。',
  16: '違和感を流さず、事実と感情を分ける。',
  17: '助言より、希望が残る言葉を選ぶ。',
  18: '不安より、今ある事実に戻る。',
  19: '守りたい基準を静かに確認する。',
  20: '過去の教訓を、今の判断に戻す。',
  21: '終わらせ方を少し美しくする。',
  22: '大きな理想を、小さな約束として見る。',
  23: '流れが変わった前提で、別の見方を探す。',
  24: '伝え方の品位をひとつ整える。',
  25: '即答せず、自分の歩幅を取り戻す。',
  26: '失敗しても崩れない小ささで見る。',
  27: '進む前に、残すものと手放すものを分ける。',
  28: '響き合う場所かどうかを感じ直す。',
  29: '理想を遠くに置かず、今の視点へ近づける。',
  30: '浮かんだものを形にする意識を持つ。',
  31: '勢いより、順番を見る。',
  32: 'ひとりで抱えず、共有の余地を見る。',
  33: '与える前に、自分の余白を確かめる。',
};

const ORACLE_SOCIAL_READINGS = {
  1: '誰かの正解を探すほど、自分の中に残っている小さな願いが見えにくくなります。始まりの火は、外から与えられるものではなく、まだ消えていない本音に宿ります。',
  2: '静かに支える力は、目立たなくても流れを整えます。ただ、相手のために動くほど自分の輪郭が薄くなりやすい日でもあります。優しさと負担を同じ場所に置いて見てください。',
  3: '深刻に考えるほど、心の動きが固くなることがあります。軽さは逃げではなく、本音を取り戻すための余白です。少しやわらかく見ることで、選べる道が戻ってきます。',
  4: '大きな変化を求めるより、足元を締めることで安心が戻るカードです。乱れている場所を責めるのではなく、今の自分を支える土台がどこにあるかを見直す流れです。',
  5: '同じ選び方を続けていると、可能性まで同じ形に見えてしまいます。冒険は大きな飛躍ではなく、いつもの外側に少しだけ視線を向けることから始まります。',
  6: '誰かを思う気持ちが強いほど、自分の疲れや本音を後回しにしやすくなります。優しさは自己犠牲と同じではありません。向ける先と量を整えるカードです。',
  7: '数をこなすより、ひとつの感覚を深く見ることで質が立ち上がる日です。焦って広げるより、今すでに手の中にあるものを磨くほど、自分らしさが見えます。',
  8: '力がある日ほど、勢いだけで押し切ると大切なものを見落とします。このカードは強さを否定せず、何を守るために力を使うのかを問い直す流れです。',
  9: '経験が増えるほど、抱えたままの考えや役割も増えていきます。今日は積み上げるより、手放せる余地を見つけることで視界が広がるカードです。',
  10: '終わったように見えることの中に、別の入口が残っているかもしれません。無理に元通りへ戻すより、いまの自分に合う形へ組み直す視点が鍵になります。',
  11: 'ひらめきや違和感は、まだ言葉になる前の答えとして届くことがあります。すぐ結論にせず、浮かんだ感覚を雑に扱わないことで、次の形が見えやすくなります。',
  12: '白黒をつけたい場面ほど、間に置ける余白が流れを変えます。どちらが正しいかを急ぐより、互いの事情が置ける場所を作ることで固さがゆるみます。',
  13: '守ってきたものを否定する必要はありません。ただ、今の自分に合わなくなった型まで抱え続けると重くなります。残す型と更新する型を見分けるカードです。',
  14: '変化は一気に別人になることではなく、配合を少し変えることでも起こります。足りないもの、過剰なもの、混ざりすぎたものを見直すことで流れが整います。',
  15: '人の役に立つことと、自分をすり減らすことは別です。頼まれたから、期待されたからだけで動く前に、その選択に納得があるかを見るカードです。',
  16: '小さな違和感は、あなたを止めるためではなく、見直す場所を知らせる合図です。不安や思い込みと混ぜず、起きていることと心の反応を分けるほど輪郭が見えてきます。',
  17: '大きな助けではなくても、残る言葉や小さな姿勢が誰かの希望になります。ただし助言を急ぐより、相手の中に光が残る伝え方を選ぶ流れです。',
  18: '霧の中では、想像が先に走りやすくなります。急いで答えを決めるより、今見えている事実に戻ることで、恐れと現実の境目が少しずつ分かれていきます。',
  19: '周りの反応に合わせ続けると、自分の基準が見えにくくなります。このカードは強く押し返すより、内側で守りたい線を静かに思い出す流れです。',
  20: '過去は責めるためではなく、今の判断に戻せる教訓として現れます。同じ後悔を繰り返さないために、何を学びとして持っていくかを見るカードです。',
  21: '終えることは負けではなく、次の流れを入れるための区切りです。完璧に仕上げるより、今の自分にとって美しい終わらせ方を選ぶ意識が出ています。',
  22: '大きな理想や影響力は、派手な言葉より小さな約束の積み重ねに宿ります。遠くを見る力を持ちながら、今日の現実に置ける形へ下ろすカードです。',
  23: '予定外の流れは、邪魔ではなく別ルートの知らせかもしれません。思い通りに進まないときほど、固執をゆるめて見方を変える余地が生まれます。',
  24: '同じ本音でも、伝え方が変わると届き方が変わります。強く言うことだけが誠実さではありません。品位と柔らかさが、関係を守る力になります。',
  25: '急がされるほど、自分の内側の速度を見失いやすくなります。遅さではなく確かさを選ぶカードです。周りの速度に飲まれず、内側のリズムへ戻る流れが出ています。',
  26: 'まだ形になっていない案でも、小さく試せば道になります。成功を証明するより、崩れない大きさで触れてみることが、次の可能性を開きます。',
  27: '新しい扉の前では、何を持っていくかだけでなく、何を置いていくかも大切になります。進む前の整理が、次の段階を軽くするカードです。',
  28: '人や場所との響き合いは、理屈だけでは測れません。縮こまる場所に合わせ続けるより、呼吸が深くなる関係や環境を感じ直す流れです。',
  29: '理想が遠すぎると、今の自分とは無関係に見えてしまいます。このカードは夢を小さくするのではなく、今の場所から触れられる形へ寄せるために出ています。',
  30: '頭の中にあるものは、外に出した瞬間から育ちはじめます。完成度を気にしすぎるより、消えやすいひらめきを形として残す意識が流れを作ります。',
  31: '勢いは悪いものではありません。ただ、順番を見失うと大事なものまで散らばります。何を先に見て、何を後に回すかを整理すると静かに動きます。',
  32: '一人で抱えるほど、動かないものは重くなります。すべてを任せる必要はありませんが、共有できる余地を見ることで流れが変わるカードです。',
  33: '誰かを照らす力は、自分の灯が守られているときにいちばん澄んで届きます。与える前に余白を確かめることは、冷たさではなく持続する優しさです。',
};

function parseArgs(argv) {
  const defaultPlatforms = String(process.env.SOCIAL_PLATFORMS || 'threads')
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
    paidCtaMode,
    releaseMode: normalizeMode(process.env.SOCIAL_RELEASE_MODE, SOCIAL_RELEASE_MODES, 'auto'),
    boothEnabled: boolFromEnv(process.env.SOCIAL_BOOTH_ENABLED) && !!boothUrl,
    stripeEnabled: false,
    campaign: String(process.env.SOCIAL_UTM_CAMPAIGN || DEFAULT_SOCIAL_CAMPAIGN).trim() || DEFAULT_SOCIAL_CAMPAIGN,
    defaultHashtag: DEFAULT_HASHTAG,
    threadsHashtag: String(process.env.SOCIAL_THREADS_HASHTAG || DEFAULT_THREADS_HASHTAG).trim() || DEFAULT_THREADS_HASHTAG,
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

function truncateText(text, maxChars) {
  const chars = [...String(text || '').trim()];
  if (chars.length <= maxChars) return chars.join('');
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join('')}…`;
}

function hasDisplayUrl(text) {
  return /https?:\/\//i.test(String(text || '')) || /\brashin-senjutsu\.onrender\.com\b/i.test(String(text || ''));
}

function normalizeSharedThreadsBlueskyText(text) {
  return String(text || '')
    .replace(/https:\/\/rashin-senjutsu\.onrender\.com/g, 'rashin-senjutsu.onrender.com')
    .replace(/(^|\n)#[^\s#]+(?:\s+#[^\s#]+)*/g, '$1#<platform-tags>');
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
    '今日の視点：迷いを一段だけ小さくする。',
    '今日の視点：相手より先に、自分の本音を整理する。',
    '今日の視点：結論より、次の確認を決める。',
    '今日の視点：焦って選ばず、止まる理由を読む。',
    '今日の視点：感情と事実を分けて眺める。',
    '今日の視点：いま動かす一手だけに絞る。',
    '今日の視点：期待ではなく、反応の変化を見る。',
  ];
  const hash = crypto.createHash('sha256').update(`angle:${dateKey}`).digest()[0];
  const serial = dateKey.replace(/^\d{4}-(\d{2})-(\d{2})$/, '$1$2');
  return `羅針メモ${serial}：${angles[hash % angles.length].replace(/^今日の視点：/, '')}`;
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

function buildOracleLeadLine(card) {
  const message = String(card?.message || '').trim();
  if (message) return softenOracleSocialWording(message);

  const share = String(card?.share || '').trim();
  const title = String(card?.title || '').trim();
  if (share) {
    const normalizedShare = normalizeForDuplicateCheck(share);
    const normalizedTitle = normalizeForDuplicateCheck(title);
    if (!normalizedTitle || !normalizedShare.includes(normalizedTitle)) return softenOracleSocialWording(share);
  }

  return 'このカードが示すテーマを、今日の行動に少しだけ移してみてください。';
}

function buildOracleActionLine(card) {
  const id = Number(card?.id);
  const action = ORACLE_SOFT_ACTIONS[id] || 'このテーマを、今の迷いに重ねて見る。';
  return `今日の一手：${action}`;
}

function buildOracleReadingLine(card) {
  const id = Number(card?.id);
  const reading = ORACLE_SOCIAL_READINGS[id] || 'このカードは、結論を急ぐより今の状態を見つめ直すための視点を示しています。';
  return `カードメッセージ：${reading}結論を急がず、気持ちと現実の接点を少し静かに見てください。`;
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
      return '気になる方は保存して、5/16に見返してください。';
    }
    if (paidCta === 'soft_paid' || paidCta === 'active_paid') {
      return '明日の公開を見逃さないよう、フォローして待っていてください。深掘り鑑定は公開後、必要な方だけ案内します。';
    }
    return '気になる方はフォローして、5/16の公開を待っていてください。';
  }
  if (paidCta === 'free') {
    return '今日のオラクルや無料鑑定で、今の状態を見てみてください。';
  }
  if (paidCta === 'active_paid') {
    return '深く整理したい方は、アプリ内の案内から深掘り鑑定へ進めます。';
  }
  if (paidCta === 'soft_paid') {
    return '必要な方だけ、無料鑑定のあとに深掘り鑑定を検討できる形にしています。';
  }
  return '迷いを、次の一手に変える占い。';
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
    return '5/16公開。気になる方は保存して、公開日に見返してください。';
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
  return buildDisplayUrl(publicOrigin, { includeProtocol: config?.primaryPlatform === 'bluesky' });
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

function countHashtags(text) {
  return (String(text || '').match(/(^|\s)#[^\s#]+/g) || []).length;
}

function stripLineRolePrefix(text) {
  return String(text || '').replace(/^(今日の1枚|先行版 今日の1枚|今日の数秘オラクル|テーマ|今日の一手|このカードからの一手|ヒント)[:：]\s*/, '');
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
  return configured || config.threadsHashtag || DEFAULT_THREADS_HASHTAG;
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
  if (options.platforms?.includes('x') && hashtagCount > 2) {
    throw new Error(`${label} must use at most two hashtags on X.`);
  }
  if (options.platforms?.includes('bluesky') && hashtagCount !== countHashtags(getBlueskyHashtagLine())) {
    throw new Error(`${label} must use the configured Bluesky hashtags: ${hashtagCount}/${countHashtags(getBlueskyHashtagLine())}.`);
  }
  if (options.platforms?.includes('threads') && [...value].length > THREADS_CHARACTER_LIMIT) {
    throw new Error(`${label} is too long for Threads: ${[...value].length}/${THREADS_CHARACTER_LIMIT}`);
  }
  if (options.platforms?.includes('x') && [...value].length > X_CHARACTER_LIMIT) {
    throw new Error(`${label} is too long for X: ${[...value].length}/${X_CHARACTER_LIMIT}`);
  }
  if (options.platforms?.includes('bluesky') && [...value].length > BLUESKY_CHARACTER_LIMIT) {
    throw new Error(`${label} is too long for Bluesky: ${[...value].length}/${BLUESKY_CHARACTER_LIMIT}`);
  }
  if (options.requireTrackedUrl && !hasPublicUrl(value)) {
    throw new Error(`${label} is missing a visible URL.`);
  }
  if (options.requireTrackedUrl && !extractUtmContent(value) && !extractUtmContent(options.trackedUrl)) {
    throw new Error(`${label} is missing utm_content.`);
  }
}

function validateDraft(draft, args) {
  const platforms = Array.isArray(args.platforms) ? args.platforms : ['threads'];
  if (platforms.includes('threads')) {
    validatePostText(draft.oracle.text, { label: 'oracle Threads post', platforms: ['threads'], requireTrackedUrl: true, trackedUrl: draft.oracle.trackedUrl });
    validatePostText(draft.midday.text, { label: 'midday Threads post', platforms: ['threads'], requireTrackedUrl: true, trackedUrl: draft.midday.trackedUrl });
    validatePostText(draft.concept.text, { label: 'concept Threads post', platforms: ['threads'], requireTrackedUrl: true, trackedUrl: draft.concept.trackedUrl });
    const requiredHashtag = draft.meta?.policy?.threadsHashtag || DEFAULT_THREADS_HASHTAG;
    const preRelease = isPreReleasePosting(draft.date, draft.meta?.socialConfig || {});
    if (!draft.oracle.text.includes(requiredHashtag)) throw new Error('oracle Threads post is missing the required hashtag.');
    if (!draft.midday.text.includes(requiredHashtag)) throw new Error('midday Threads post is missing the required hashtag.');
    if (!draft.concept.text.includes(requiredHashtag)) throw new Error('concept Threads post is missing the required hashtag.');
    if (draft.oracle.text.includes(DEFAULT_HASHTAG) || draft.midday.text.includes(DEFAULT_HASHTAG) || draft.concept.text.includes(DEFAULT_HASHTAG)) {
      throw new Error('Threads posts must not use the brand hashtag.');
    }
    if (preRelease) {
      if (draft.oracle.text.includes('あなたも今日の1枚を引かない？')) {
        throw new Error('pre-release oracle Threads post must not use the live oracle closing line.');
      }
    } else {
      if (!extractUtmContent(draft.oracle.trackedUrl || draft.oracle.text)) throw new Error('oracle Threads post is missing utm_content.');
      if (!extractUtmContent(draft.midday.trackedUrl || draft.midday.text)) throw new Error('midday Threads post is missing utm_content.');
      if (!extractUtmContent(draft.concept.text)) throw new Error('concept Threads post is missing utm_content.');
      if (!draft.oracle.text.trim().endsWith('あなたも今日の1枚を引かない？')) {
        throw new Error('oracle Threads post must end with the required closing line.');
      }
    }
  }
  if (platforms.includes('x')) {
    validatePostText(draft.oracle.xText, { label: 'oracle X post', platforms: ['x'], requireTrackedUrl: true, trackedUrl: draft.oracle.xTrackedUrl });
    validatePostText(draft.midday.xText, { label: 'midday X post', platforms: ['x'], requireTrackedUrl: true, trackedUrl: draft.midday.xTrackedUrl });
    validatePostText(draft.concept.xText, { label: 'concept X post', platforms: ['x'], requireTrackedUrl: true, trackedUrl: draft.concept.xTrackedUrl });
    if (draft.oracle.xText === draft.oracle.text || draft.midday.xText === draft.midday.text || draft.concept.xText === draft.concept.text) {
      throw new Error('X posts must not be identical to Threads posts.');
    }
  }
  if (platforms.includes('bluesky')) {
    validatePostText(draft.oracle.blueskyText, { label: 'oracle Bluesky post', platforms: ['bluesky'], requireTrackedUrl: true, trackedUrl: draft.oracle.blueskyTrackedUrl });
    validatePostText(draft.midday.blueskyText, { label: 'midday Bluesky post', platforms: ['bluesky'], requireTrackedUrl: true, trackedUrl: draft.midday.blueskyTrackedUrl });
    validatePostText(draft.concept.blueskyText, { label: 'concept Bluesky post', platforms: ['bluesky'], requireTrackedUrl: true, trackedUrl: draft.concept.blueskyTrackedUrl });
    const requiredHashtags = String(draft.meta?.policy?.blueskyHashtags || getBlueskyHashtagLine()).match(/#[^\s#]+/g) || [];
    for (const requiredHashtag of requiredHashtags) {
      if (!draft.oracle.blueskyText.includes(requiredHashtag)) throw new Error(`oracle Bluesky post is missing the required hashtag: ${requiredHashtag}`);
      if (!draft.midday.blueskyText.includes(requiredHashtag)) throw new Error(`midday Bluesky post is missing the required hashtag: ${requiredHashtag}`);
      if (!draft.concept.blueskyText.includes(requiredHashtag)) throw new Error(`concept Bluesky post is missing the required hashtag: ${requiredHashtag}`);
    }
    if (!/https:\/\/rashin-senjutsu\.onrender\.com\b/i.test(draft.oracle.blueskyText)
      || !/https:\/\/rashin-senjutsu\.onrender\.com\b/i.test(draft.midday.blueskyText)
      || !/https:\/\/rashin-senjutsu\.onrender\.com\b/i.test(draft.concept.blueskyText)) {
      throw new Error('Bluesky posts must use clickable https://rashin-senjutsu.onrender.com URLs.');
    }
    if (normalizeSharedThreadsBlueskyText(draft.midday.text) !== normalizeSharedThreadsBlueskyText(draft.midday.blueskyText)) {
      throw new Error('midday Threads and Bluesky posts must use matching copy except the Bluesky URL protocol.');
    }
    if (!draft.oracle.blueskyImagePath || !draft.midday.blueskyImagePath || !draft.concept.blueskyImagePath) {
      throw new Error('Bluesky posts require local image paths.');
    }
    if (!draft.oracle.altText || !draft.midday.altText || !draft.concept.altText) {
      throw new Error('Bluesky image posts require alt text.');
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

function useStatelessCardPicking() {
  return process.env.SOCIAL_STATELESS_MODE === 'true' || process.env.GITHUB_ACTIONS === 'true';
}

async function pickCard(messages, dateKey, writeState) {
  const ids = messages.map(item => item.id);
  const picked = deterministicCardId(ids, dateKey);

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
  if (isPreReleasePosting(dateKey, config)) {
    return fitPostText([
      '先行 数秘オラクル',
      card.name,
      `テーマ：${card.title}`,
      buildOracleLeadLine(card),
      buildOracleReadingLine(card),
      buildOracleActionLine(card),
      displayUrl,
      hashtag,
      '保存して公開日に見返してね',
    ], BLUESKY_CHARACTER_LIMIT);
  }
  return fitPostText([
    '今日の数秘オラクル',
    card.name,
    `テーマ：${card.title}`,
    buildOracleLeadLine(card),
    buildOracleReadingLine(card),
    buildOracleActionLine(card),
    displayUrl,
    hashtag,
    'あなたも今日の1枚を引かない？',
  ], BLUESKY_CHARACTER_LIMIT);
}

function buildXOracleText(card, publicOrigin, options = {}) {
  const dateKey = options.dateKey || getJstDateString();
  const config = options.config || getSocialConfig({ platforms: ['x'] });
  const hashtags = getXHashtagLine(config);
  const displayUrl = buildDisplayUrl(publicOrigin);
  if (isPreReleasePosting(dateKey, config)) {
    return fitPostText([
      `先行オラクル：${card.name} / ${card.title}`,
      buildOracleActionLine(card),
      '保存して公開日に見返してね',
      displayUrl,
      hashtags,
    ], X_CHARACTER_LIMIT);
  }
  return fitPostText([
    `今日の数秘オラクル：${card.name}`,
    `テーマ：${card.title}`,
    buildOracleActionLine(card),
    displayUrl,
    hashtags,
  ], X_CHARACTER_LIMIT);
}

function buildBlueskyOracleText(card, publicOrigin, options = {}) {
  const config = options.config || getSocialConfig({ platforms: ['bluesky'] });
  return buildOracleText(card, publicOrigin, { ...options, config });
}

function buildOracleAltText(card) {
  return `数秘オラクルカード No.${card.id}「${card.name}」。テーマは「${card.title}」。`;
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

async function buildDraft(args) {
  const dateKey = args.date || getJstDateString();
  const publicOrigin = (process.env.PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, '');
  const config = getSocialConfig(args);
  const threadsConfig = withPlatform(config, 'threads');
  const xConfig = withPlatform(config, 'x');
  const blueskyConfig = withPlatform(config, 'bluesky');
  const calendar = getCalendarEntry(dateKey);
  const paidCta = resolvePaidCta(calendar, config);
  const conceptImage = pickConceptImage(calendar, dateKey);
  const blueskyConceptImage = pickBlueskyConceptImage(conceptImage);
  const middayImage = SOCIAL_CONCEPT_IMAGES.icon;
  const blueskyMiddayImage = pickBlueskyConceptImage(middayImage);
  const conceptImagePath = path.join(ROOT, 'images', 'ui', conceptImage.file);
  const blueskyConceptImagePath = path.join(ROOT, 'images', 'ui', blueskyConceptImage.file);
  const middayImagePath = path.join(ROOT, 'images', 'ui', middayImage.file);
  const blueskyMiddayImagePath = path.join(ROOT, 'images', 'ui', blueskyMiddayImage.file);
  const messages = await loadDailyOracleMessages();
  const card = await pickCard(messages, dateKey, args.write || args.post);
  const imageName = `${String(card.id).padStart(2, '0')}.jpg`;
  const draft = {
    date: dateKey,
    schedule: {
      oracle: `${process.env.SOCIAL_ORACLE_TIME || '07:00'} Asia/Tokyo`,
      midday: `${process.env.SOCIAL_MIDDAY_TIME || '12:00'} Asia/Tokyo`,
      concept: `${process.env.SOCIAL_CONCEPT_TIME || '20:00'} Asia/Tokyo`,
    },
    oracle: {
      card,
      imagePath: path.join(ROOT, 'images', 'cards', 'oracle', imageName),
      imageUrl: `${publicOrigin}/images/cards/oracle/${imageName}`,
      altText: buildOracleAltText(card),
      text: buildOracleText(card, publicOrigin, { dateKey, config: threadsConfig }),
      trackedUrl: buildOracleTrackedUrl(card, publicOrigin, threadsConfig, dateKey),
      xText: buildXOracleText(card, publicOrigin, { dateKey, config: xConfig }),
      xTrackedUrl: buildOracleTrackedUrl(card, publicOrigin, xConfig, dateKey),
      blueskyText: buildBlueskyOracleText(card, publicOrigin, { dateKey, config: blueskyConfig }),
      blueskyTrackedUrl: buildOracleTrackedUrl(card, publicOrigin, blueskyConfig, dateKey),
      blueskyImagePath: path.join(ROOT, 'images', 'cards', 'oracle', imageName),
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

function selectedKindsFromArgs(args) {
  if (args.kind === 'all') return SOCIAL_POST_KINDS;
  return SOCIAL_POST_KINDS.includes(args.kind) ? [args.kind] : SOCIAL_POST_KINDS;
}

function shouldPostKind(args, kind) {
  return args.kind === 'all' || args.kind === kind;
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
  try {
    if (args.platforms.includes('x')) {
      if (process.env.SOCIAL_X_API_POSTING_ENABLED !== 'true') {
        throw new Error('X API posting is disabled. Generate X drafts with npm run social:x:drafts and post manually, or set SOCIAL_X_API_POSTING_ENABLED=true when official X API credentials are intentionally configured.');
      }
      if (shouldPostKind(args, 'oracle')) {
        results.xOracle = await withSocialRetry('x:oracle', () => postToX(draft.oracle.xText, draft.oracle.imagePath));
      }
      if (shouldPostKind(args, 'midday')) {
        results.xMidday = await withSocialRetry('x:midday', () => postToX(draft.midday.xText, draft.midday.imagePath));
      }
      if (shouldPostKind(args, 'concept')) {
        results.xConcept = await withSocialRetry('x:concept', () => postToX(draft.concept.xText, draft.concept.imagePath));
      }
    }
    if (args.platforms.includes('threads')) {
      if (shouldPostKind(args, 'oracle')) {
        results.threadsOracle = await withSocialRetry('threads:oracle', () => postImageToThreadsOnce({
          text: draft.oracle.text,
          imageUrl: draft.oracle.imageUrl,
          altText: draft.oracle.altText,
          marker: extractUtmContent(draft.oracle.trackedUrl || draft.oracle.text),
        }));
      }
      if (shouldPostKind(args, 'midday')) {
        results.threadsMidday = await withSocialRetry('threads:midday', () => postImageToThreadsOnce({
          text: draft.midday.text,
          imageUrl: draft.midday.imageUrl,
          altText: draft.midday.altText,
          marker: extractUtmContent(draft.midday.trackedUrl || draft.midday.text),
        }));
      }
      if (shouldPostKind(args, 'concept')) {
        results.threadsConcept = await withSocialRetry('threads:concept', () => postImageToThreadsOnce({
          text: draft.concept.text,
          imageUrl: draft.concept.imageUrl,
          altText: draft.concept.altText,
          marker: extractUtmContent(draft.concept.trackedUrl || draft.concept.text),
        }));
      }
    }
    if (args.platforms.includes('bluesky')) {
      if (shouldPostKind(args, 'oracle')) {
        results.blueskyOracle = await withSocialRetry('bluesky:oracle', () => postImageToBlueskyOnce({
          text: draft.oracle.blueskyText,
          imagePath: draft.oracle.blueskyImagePath,
          altText: draft.oracle.altText,
          marker: extractUtmContent(draft.oracle.blueskyTrackedUrl || draft.oracle.blueskyText),
        }));
      }
      if (shouldPostKind(args, 'midday')) {
        results.blueskyMidday = await withSocialRetry('bluesky:midday', () => postImageToBlueskyOnce({
          text: draft.midday.blueskyText,
          imagePath: draft.midday.blueskyImagePath,
          altText: draft.midday.altText,
          marker: extractUtmContent(draft.midday.blueskyTrackedUrl || draft.midday.blueskyText),
        }));
      }
      if (shouldPostKind(args, 'concept')) {
        results.blueskyConcept = await withSocialRetry('bluesky:concept', () => postImageToBlueskyOnce({
          text: draft.concept.blueskyText,
          imagePath: draft.concept.blueskyImagePath,
          altText: draft.concept.altText,
          marker: extractUtmContent(draft.concept.blueskyTrackedUrl || draft.concept.blueskyText),
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
