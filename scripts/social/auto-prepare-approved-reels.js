const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');

const { birthdayMiniFamilyForDay } = require('./birthday-mini-family');
const { dailyBirthdayReelTimesForDate } = require('./social-schedule-rules');

const ROOT = path.resolve(__dirname, '..', '..');
const PLAN_DIR = path.join(ROOT, 'data', 'social-posts', 'reel-plans');
const APPROVED_DIR = path.join(ROOT, 'data', 'social-posts', 'approved-reels');
const CANDIDATE_DIR = path.join(ROOT, 'output', 'social-approved-reels-candidates');
const REVIEW_DIR = path.join(ROOT, 'output', 'social-reels-review');
const GENERATOR = path.join(ROOT, 'scripts', 'social', 'generate-birthday-reels-20260620.js');
const DEFAULT_PLATFORMS = 'threads,instagram';
const DEFAULT_PDCA_FEEDBACK_FILE = path.join(ROOT, 'data', 'social-posts', 'pdca', 'video-insights-feedback.json');
const DEFAULT_PREP_BLOCKLIST_FILE = path.join(ROOT, 'data', 'social-posts', 'reel-prep-blocklist.json');

function resolveConfiguredPath(envName, fallback) {
  const configured = String(process.env[envName] || '').trim();
  if (!configured) return fallback;
  return path.isAbsolute(configured) ? configured : path.resolve(ROOT, configured);
}

const PDCA_FEEDBACK_FILE = resolveConfiguredPath('SOCIAL_VIDEO_PDCA_FEEDBACK_FILE', DEFAULT_PDCA_FEEDBACK_FILE);
const PREP_BLOCKLIST_FILE = resolveConfiguredPath('SOCIAL_REEL_PREP_BLOCKLIST_FILE', DEFAULT_PREP_BLOCKLIST_FILE);

const THEMES = [
  { accent: '#2d6f86', accent2: '#b76a3b', ink: '#17323c', bg1: '#eef7fb', bg2: '#fffdf8', bg3: '#e8ecd8', glow: '#d7efff' },
  { accent: '#7a4f2b', accent2: '#2f7f63', ink: '#2b2118', bg1: '#fff7ec', bg2: '#f8fbef', bg3: '#e4f0ec', glow: '#ffe6a8' },
  { accent: '#315f7d', accent2: '#b65b5b', ink: '#172a3a', bg1: '#eef6ff', bg2: '#fffaf5', bg3: '#ece8f6', glow: '#dceeff' },
  { accent: '#596c2f', accent2: '#b85f40', ink: '#202816', bg1: '#f5faec', bg2: '#fffdf7', bg3: '#e8f0f6', glow: '#ecf7b7' },
  { accent: '#80536b', accent2: '#2c746d', ink: '#2c1d28', bg1: '#fff1f7', bg2: '#fffdf8', bg3: '#e6f4f0', glow: '#ffd9ed' },
  { accent: '#3c6d58', accent2: '#8f5b2d', ink: '#17281f', bg1: '#eef9f2', bg2: '#fffaf1', bg3: '#e7edf7', glow: '#d9f3dd' },
  { accent: '#6b5f2b', accent2: '#3e7893', ink: '#292612', bg1: '#fbf8e8', bg2: '#fffdf7', bg3: '#e5f1f6', glow: '#fff0aa' },
  { accent: '#7a3f50', accent2: '#406f34', ink: '#2d1920', bg1: '#fff0f2', bg2: '#fffdf7', bg3: '#edf5e8', glow: '#ffd6dc' },
];

const DAY_SETS = [
  [7, 16, 25, 4, 22],
  [8, 6, 24, 1, 31],
  [5, 14, 23, 9, 18],
  [3, 12, 21, 30, 10],
  [2, 11, 20, 29, 17],
  [13, 22, 31, 6, 15],
  [4, 8, 26, 19, 27],
  [1, 10, 28, 5, 14],
  [9, 18, 27, 3, 12],
  [6, 15, 24, 2, 11],
  [16, 25, 7, 21, 30],
  [20, 29, 2, 13, 31],
];

const TOPIC_BANK = [
  {
    slug: 'henshin-osokutemo-taisetsu-top5',
    title: '返信が遅くても大切にしてる生まれ日TOP5',
    titleLines: ['返信が遅くても', '大切にしてる生まれ日TOP5'],
    lead: 'すぐ返せない時ほど、ちゃんと考えてから向き合うタイプ',
    summary: '返信が遅い日は、冷たいのではなく言葉を雑にしたくない慎重さが出やすいです。',
    trait: '相手を雑に扱わない慎重さ',
    moment: '連絡の間が空いた時',
    gift: '安心感',
    action: '言葉を選んで返す',
    value: '誠実さ',
  },
  {
    slug: 'chiisana-iwakan-kizuku-top5',
    title: '小さな違和感に気づく生まれ日TOP5',
    titleLines: ['小さな違和感に気づく', '生まれ日TOP5'],
    lead: '空気の変化や言葉の温度差を、早めに察知しやすいタイプ',
    summary: '小さな違和感に気づく日は、早く気づくからこそ大きなズレを防ぎやすいです。',
    trait: '細かな変化を拾う観察力',
    moment: '会話の温度が少し変わる場面',
    gift: '早めの気づき',
    action: 'そっと軌道修正する',
    value: '違和感の扱い方',
  },
  {
    slug: 'muri-shisouna-hito-minuku-top5',
    title: '無理しそうな人を見抜く生まれ日TOP5',
    titleLines: ['無理しそうな人を見抜く', '生まれ日TOP5'],
    lead: '平気そうな顔の奥にある疲れを、先に見つけやすいタイプ',
    summary: '無理に気づける日は、助けるより先に休める空気を作るのが上手です。',
    trait: '人の疲れに気づくやさしさ',
    moment: '相手が平気なふりをする場面',
    gift: '休める空気',
    action: '負担を軽くする',
    value: '相手の余白',
  },
  {
    slug: 'waratteru-kedo-fukai-top5',
    title: '笑ってるけど考え深い生まれ日TOP5',
    titleLines: ['笑ってるけど考え深い', '生まれ日TOP5'],
    lead: '軽く見えても、内側ではかなり深く受け止めているタイプ',
    summary: '笑っている日は、場を暗くしない強さと、深く考える静けさを両方持っています。',
    trait: '明るさの奥にある思慮深さ',
    moment: '場を和ませたい時',
    gift: 'やわらかい安心',
    action: '重い話を軽く受け止める',
    value: '空気の守り方',
  },
  {
    slug: 'soudan-honki-naru-top5',
    title: '相談されると本気になる生まれ日TOP5',
    titleLines: ['相談されると本気になる', '生まれ日TOP5'],
    lead: '頼られた瞬間に、相手のための答えを真剣に探し始めるタイプ',
    summary: '相談で本気になる日は、聞くだけで終わらず次の一歩まで一緒に考えます。',
    trait: '頼られた時の集中力',
    moment: '誰かが本音をこぼす場面',
    gift: '実用的な支え',
    action: '次の一歩を整理する',
    value: '相手への責任感',
  },
  {
    slug: 'shotaimen-kuuki-yomu-top5',
    title: '初対面で空気を読む生まれ日TOP5',
    titleLines: ['初対面で空気を読む', '生まれ日TOP5'],
    lead: '距離の詰め方を見ながら、自然に安心できる場を作るタイプ',
    summary: '初対面で空気を読む日は、前に出すぎず相手の緊張をほどきやすいです。',
    trait: '場の距離感を整える力',
    moment: 'はじめましての空気',
    gift: '入りやすさ',
    action: '相手のテンポに合わせる',
    value: '自然な距離感',
  },
  {
    slug: 'suki-koto-kyuuni-shuchu-top5',
    title: '好きなことは急に集中する生まれ日TOP5',
    titleLines: ['好きなことは急に集中する', '生まれ日TOP5'],
    lead: '興味が入った瞬間、表情も時間の使い方も変わりやすいタイプ',
    summary: '好きなことに集中する日は、始まるまで静かでも火がつくと一気に伸びます。',
    trait: '好きなことへの没入力',
    moment: '興味のスイッチが入る場面',
    gift: '伸びる勢い',
    action: '一気に掘り下げる',
    value: '自分の熱量',
  },
  {
    slug: 'kidoku-yori-taido-top5',
    title: '既読より態度で伝える生まれ日TOP5',
    titleLines: ['既読より態度で伝える', '生まれ日TOP5'],
    lead: '言葉の量より、会った時の態度や行動に本音が出やすいタイプ',
    summary: '態度で伝える日は、短い言葉の奥にちゃんと大切にする気持ちがあります。',
    trait: '行動で気持ちを示す誠実さ',
    moment: '言葉が少ない時',
    gift: '伝わる行動',
    action: '態度で補う',
    value: '行動の一貫性',
  },
  {
    slug: 'yotei-henkou-tsuyoi-top5',
    title: '予定変更に強い生まれ日TOP5',
    titleLines: ['予定変更に強い', '生まれ日TOP5'],
    lead: '急に流れが変わっても、今できる形に組み直しやすいタイプ',
    summary: '予定変更に強い日は、完璧な予定より、その場で整える現実感が光ります。',
    trait: '流れを組み直す柔軟さ',
    moment: '急な変更が入る場面',
    gift: '立て直す力',
    action: '優先順位を入れ替える',
    value: '今できる最善',
  },
  {
    slug: 'hisoka-ni-doryoku-top5',
    title: 'ひそかに努力を続ける生まれ日TOP5',
    titleLines: ['ひそかに努力を続ける', '生まれ日TOP5'],
    lead: '見せびらかさないけれど、毎日少しずつ積み上げるタイプ',
    summary: 'ひそかに努力する日は、目立たない積み重ねがあとで大きな信用になります。',
    trait: '静かな継続力',
    moment: '誰も見ていない時間',
    gift: 'あとから効く信頼',
    action: '淡々と積み上げる',
    value: '続けること',
  },
  {
    slug: 'nakanaori-kikkake-top5',
    title: '仲直りのきっかけを作る生まれ日TOP5',
    titleLines: ['仲直りのきっかけを作る', '生まれ日TOP5'],
    lead: '気まずさが残る場面でも、戻れる入口をそっと置けるタイプ',
    summary: '仲直りのきっかけを作る日は、正しさよりも戻れる空気を大切にします。',
    trait: '関係を戻すやわらかさ',
    moment: '少し気まずい場面',
    gift: '戻れる入口',
    action: '空気をほどく',
    value: '関係の温度',
  },
  {
    slug: 'henka-mae-shizuka-top5',
    title: '変化の前に静かになる生まれ日TOP5',
    titleLines: ['変化の前に静かになる', '生まれ日TOP5'],
    lead: '大きく動く前ほど、内側で準備を整えたくなるタイプ',
    summary: '静かになる日は、止まっているのではなく次に動く準備をしています。',
    trait: '動く前に整える慎重さ',
    moment: '変化が近づく場面',
    gift: '落ち着いた準備',
    action: '内側を整える',
    value: '準備の時間',
  },
  {
    slug: 'chokkan-kiken-sakeru-top5',
    title: '直感で危険を避ける生まれ日TOP5',
    titleLines: ['直感で危険を避ける', '生まれ日TOP5'],
    lead: '理由を言語化する前に、なんとなく違うを察しやすいタイプ',
    summary: '直感で避ける日は、怖がりではなく小さな違和感を早く拾える日です。',
    trait: '早めに察知する直感',
    moment: '何かが少し違う場面',
    gift: '大きな失敗を避ける感覚',
    action: '一歩引いて確認する',
    value: '直感の扱い方',
  },
  {
    slug: 'daiji-hito-hodo-enryo-top5',
    title: '大事な人ほど遠慮する生まれ日TOP5',
    titleLines: ['大事な人ほど遠慮する', '生まれ日TOP5'],
    lead: '近い相手だからこそ、負担にならないように考えすぎるタイプ',
    summary: '大事な人に遠慮する日は、距離を置きたいのではなく大切にしたい気持ちが強いです。',
    trait: '近い人を思う遠慮',
    moment: '本音を言う前の迷い',
    gift: '相手への配慮',
    action: '少し控えめに伝える',
    value: '大切な人との距離',
  },
  {
    slug: 'kyuuni-switch-hairu-top5',
    title: '急にスイッチが入る生まれ日TOP5',
    titleLines: ['急にスイッチが入る', '生まれ日TOP5'],
    lead: '普段は穏やかでも、必要な瞬間に一気に集中できるタイプ',
    summary: '急にスイッチが入る日は、準備していないように見えて本番で強さが出ます。',
    trait: '本番で上がる集中力',
    moment: 'ここぞという場面',
    gift: '一気に進める力',
    action: '迷わず動く',
    value: '切り替えの速さ',
  },
  {
    slug: 'honne-materu-top5',
    title: '相手の本音を待てる生まれ日TOP5',
    titleLines: ['相手の本音を待てる', '生まれ日TOP5'],
    lead: '急かさずに、話せるタイミングまで待つことができるタイプ',
    summary: '本音を待てる日は、聞き出すよりも話したくなる空気を作ります。',
    trait: '急かさず待てる余裕',
    moment: '相手が迷っている場面',
    gift: '話しやすさ',
    action: '待つことで支える',
    value: '相手のタイミング',
  },
  {
    slug: 'pressure-shuchu-agaru-top5',
    title: 'プレッシャーで集中力が上がる生まれ日TOP5',
    titleLines: ['プレッシャーで集中力が上がる', '生まれ日TOP5'],
    lead: '追い込まれるほど、余計な迷いが消えて力を出しやすいタイプ',
    summary: 'プレッシャーに強い日は、重さを力に変える集中の入り方ができます。',
    trait: '重さを力に変える集中力',
    moment: '期限や期待が近い場面',
    gift: 'やり切る力',
    action: '必要なことに絞る',
    value: '集中の深さ',
  },
  {
    slug: 'iinizurai-maruku-tsutaeru-top5',
    title: '言いにくいことを丸く伝える生まれ日TOP5',
    titleLines: ['言いにくいことを丸く伝える', '生まれ日TOP5'],
    lead: '正直さを失わず、相手が受け取りやすい形に整えるタイプ',
    summary: '丸く伝える日は、遠回しではなく関係を壊さない言葉選びができます。',
    trait: '角を立てない言葉選び',
    moment: '本音を伝える必要がある場面',
    gift: '受け取りやすさ',
    action: '言葉を整える',
    value: '関係を守る正直さ',
  },
  {
    slug: 'kitai-nerareru-top5',
    title: '期待されると粘れる生まれ日TOP5',
    titleLines: ['期待されると粘れる', '生まれ日TOP5'],
    lead: '見られていると緊張しながらも、最後まで踏ん張れるタイプ',
    summary: '期待で粘れる日は、重く受け止めすぎず力に変えるほど伸びます。',
    trait: '期待を力にする粘り',
    moment: '任された場面',
    gift: '最後まで整える力',
    action: 'もう一歩粘る',
    value: '信頼に応えること',
  },
  {
    slug: 'sarigenai-yasashisa-nokoru-top5',
    title: 'さりげない優しさが残る生まれ日TOP5',
    titleLines: ['さりげない優しさが残る', '生まれ日TOP5'],
    lead: '大きく見せない気配りほど、あとから相手の記憶に残るタイプ',
    summary: 'さりげない優しさの日は、言葉より小さな行動で安心を残します。',
    trait: 'あとから効く気配り',
    moment: '相手が少し困っている場面',
    gift: '記憶に残る安心',
    action: '小さく助ける',
    value: '押しつけない優しさ',
  },
  {
    slug: 'nigate-demo-saigo-made-top5',
    title: '苦手でも最後まで整える生まれ日TOP5',
    titleLines: ['苦手でも最後まで整える', '生まれ日TOP5'],
    lead: '得意じゃないことでも、任されたら形にする責任感があるタイプ',
    summary: '苦手でも整える日は、器用さよりも逃げずに向き合う強さが出ます。',
    trait: '苦手でも逃げない責任感',
    moment: 'やり切る必要がある場面',
    gift: '仕上げる力',
    action: '最後を整える',
    value: '任されたこと',
  },
  {
    slug: 'jibun-pace-mamoru-top5',
    title: '自分のペースを守る生まれ日TOP5',
    titleLines: ['自分のペースを守る', '生まれ日TOP5'],
    lead: '周りに急かされても、自分が崩れない速度を選べるタイプ',
    summary: '自分のペースを守る日は、遅いのではなく安定して続けるための速度を知っています。',
    trait: '崩れない速度を選ぶ力',
    moment: '周りが急いでいる場面',
    gift: '安定感',
    action: '自分の速度で進める',
    value: '長く続くリズム',
  },
  {
    slug: 'kuuki-omoi-toki-tasukeru-top5',
    title: '空気が重い時に助ける生まれ日TOP5',
    titleLines: ['空気が重い時に助ける', '生まれ日TOP5'],
    lead: '沈んだ場面で、無理に明るくせず少し軽くできるタイプ',
    summary: '重い空気を助ける日は、盛り上げ役ではなく逃げ場を作る役になれます。',
    trait: '場を少し軽くする力',
    moment: '空気が止まりそうな場面',
    gift: '息がしやすい余白',
    action: '場の圧をゆるめる',
    value: '無理のない明るさ',
  },
  {
    slug: 'totsuzen-chance-tsuyoi-top5',
    title: '突然のチャンスに強い生まれ日TOP5',
    titleLines: ['突然のチャンスに強い', '生まれ日TOP5'],
    lead: '予定外の流れでも、来たものを掴む反応が早いタイプ',
    summary: '突然のチャンスに強い日は、完璧な準備よりも動きながら整える力があります。',
    trait: '機会を逃さない反応力',
    moment: '予定外の誘いや提案',
    gift: '掴む速さ',
    action: '動きながら整える',
    value: '流れを読むこと',
  },
  {
    slug: 'fukaku-kangaete-ugoku-top5',
    title: '深く考えてから動く生まれ日TOP5',
    titleLines: ['深く考えてから動く', '生まれ日TOP5'],
    lead: '即答しない分、動く時には理由を持って進めるタイプ',
    summary: '深く考えて動く日は、遅く見えても決めた後のブレにくさが強みです。',
    trait: '理由を持って動く慎重さ',
    moment: '大事な判断の前',
    gift: 'ブレにくさ',
    action: '納得してから進む',
    value: '理由のある選択',
  },
  {
    slug: 'hito-no-ii-tokoro-mitsukeru-top5',
    title: '人のいい所を見つける生まれ日TOP5',
    titleLines: ['人のいい所を見つける', '生まれ日TOP5'],
    lead: '目立つ成果より、その人らしい良さを拾いやすいタイプ',
    summary: '人のいい所を見つける日は、褒め言葉が相手の自己肯定感を戻します。',
    trait: '相手の良さを拾う視点',
    moment: '誰かが自信をなくしている場面',
    gift: '自信を戻す言葉',
    action: '良いところを言葉にする',
    value: 'その人らしさ',
  },
  {
    slug: 'taisetsu-yakusoku-wasurerarenai-top5',
    title: '大切な約束を忘れにくい生まれ日TOP5',
    titleLines: ['大切な約束を忘れにくい', '生まれ日TOP5'],
    lead: '小さな約束ほど、相手の気持ちごと覚えているタイプ',
    summary: '約束を忘れにくい日は、内容だけでなく約束した時の気持ちを大切にします。',
    trait: '約束を覚えておく誠実さ',
    moment: '小さな約束を交わした後',
    gift: '信頼の積み重ね',
    action: '覚えて行動する',
    value: '小さな信頼',
  },
  {
    slug: 'samishisa-egao-kakusu-top5',
    title: '寂しさを笑顔で隠す生まれ日TOP5',
    titleLines: ['寂しさを笑顔で隠す', '生まれ日TOP5'],
    lead: '平気な顔で場を保ちながら、本当は少し寄り添ってほしいタイプ',
    summary: '寂しさを隠す日は、強がりの奥に気づいてくれる人を大切にします。',
    trait: '強がりの奥にある素直さ',
    moment: '本当は寂しい場面',
    gift: '気づいてほしいサイン',
    action: '笑顔で場を保つ',
    value: '気づいてくれる人',
  },
  {
    slug: 'isogashii-hodo-dandori-top5',
    title: '忙しいほど段取りが光る生まれ日TOP5',
    titleLines: ['忙しいほど段取りが光る', '生まれ日TOP5'],
    lead: 'やることが多い時ほど、順番を整理して前に進めるタイプ',
    summary: '忙しいほど段取りが光る日は、焦りを整理に変えて着実に進めます。',
    trait: '混雑を整理する段取り力',
    moment: 'やることが重なる場面',
    gift: '進めやすさ',
    action: '順番を整える',
    value: '焦らない整理',
  },
  {
    slug: 'arigatou-koudou-kaesu-top5',
    title: 'ありがとうを行動で返す生まれ日TOP5',
    titleLines: ['ありがとうを行動で返す', '生まれ日TOP5'],
    lead: '感謝を言葉だけで終わらせず、次の行動で返したくなるタイプ',
    summary: 'ありがとうを行動で返す日は、受け取った優しさを別の形で循環させます。',
    trait: '感謝を返す行動力',
    moment: '助けてもらった後',
    gift: 'やさしさの循環',
    action: '行動で返す',
    value: '受け取った気持ち',
  },
];

const SINGLE_DAY_TYPES = [
  {
    topicType: 'birthday_day_aruaru',
    slugPrefix: 'birthday-day-aruaru',
    titleSuffix: '日生まれあるある5選',
    leadPrefix: 'その日に生まれた人が出しやすい反応を、保存しやすい5つのあるあるに整理します。',
    summaryPrefix: 'この日の人は、無理に目立つよりも自分の反応の癖を知るほど動きやすくなります。',
  },
  {
    topicType: 'birthday_day_manual',
    slugPrefix: 'birthday-day-manual',
    titleSuffix: '日生まれ取説5選',
    leadPrefix: '接し方、休ませ方、力の出し方を1日分だけに絞って取扱説明書にします。',
    summaryPrefix: 'この日の人は、扱い方のポイントを先に知ると関係も予定も整えやすくなります。',
  },
];

const SINGLE_DAY_POINT_BANK = [
  '最初は静かでも、納得すると一気に動きます。',
  '急かされるより、選べる余白があるほど本音が出ます。',
  '気にしていないふりをして、細かい空気の変化を見ています。',
  '頼られると強いですが、雑に任されると急に距離を置きます。',
  '予定変更には弱く見えても、理由がわかると切り替えが早いです。',
  '好きなことには集中が深く、時間の感覚が薄くなりやすいです。',
  '感謝は言葉より行動で返そうとする傾向があります。',
  '大事な人ほど遠慮して、あとから気持ちを出すことがあります。',
  'ひとりの時間で回復してから、人に優しく戻ります。',
  '違和感には早く気づきますが、すぐには言葉にしません。',
];

const GRAPH_LABELS = [
  '直感',
  '行動',
  '安心',
  '集中',
  '調整',
  '共感',
  '挑戦',
];

function singleDayForDate(dateKey, seed, slotIndex) {
  const dayOfMonth = Number(dateKey.slice(-2));
  return ((dayOfMonth + seed + slotIndex * 7) % 31) + 1;
}

function singleDayType(seed, slotIndex) {
  return SINGLE_DAY_TYPES[(seed + slotIndex) % SINGLE_DAY_TYPES.length];
}

function buildSingleDayPoints(day, seed) {
  const rotated = rotate(SINGLE_DAY_POINT_BANK, (seed + day) % SINGLE_DAY_POINT_BANK.length);
  return rotated.slice(0, 5).map((text, index) => ({
    rank: index + 1,
    text,
  }));
}

function graphScore(day, seed) {
  return 38 + ((seed + day * 17 + (day % 9) * 11) % 61);
}

function buildGraphDays(seed) {
  return Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    birthdayMiniFamilyForDay(day);
    return {
      day,
      score: graphScore(day, seed),
      label: GRAPH_LABELS[(seed + day) % GRAPH_LABELS.length],
    };
  });
}

function parseArgs(argv) {
  const args = {
    date: '',
    daysAhead: 1,
    dryRun: false,
    overwrite: false,
    autoApprove: true,
    publishToGit: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') args.date = argv[++i] || '';
    else if (arg.startsWith('--date=')) args.date = arg.slice('--date='.length);
    else if (arg === '--days-ahead') args.daysAhead = Number(argv[++i] || 1);
    else if (arg.startsWith('--days-ahead=')) args.daysAhead = Number(arg.slice('--days-ahead='.length));
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--overwrite') args.overwrite = true;
    else if (arg === '--publish-to-git') args.publishToGit = true;
    else if (arg === '--auto-approve') args.autoApprove = true;
    else if (arg === '--no-auto-approve') args.autoApprove = false;
  }
  if (!Number.isInteger(args.daysAhead) || args.daysAhead < 0 || args.daysAhead > 14) {
    throw new Error(`Invalid --days-ahead: ${args.daysAhead}`);
  }
  return args;
}

function jstParts(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
}

function targetDateFromDaysAhead(daysAhead) {
  const parts = jstParts();
  const base = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + daysAhead));
  return base.toISOString().slice(0, 10);
}

function validateDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}`);
  return value;
}

function dayOfWeek(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function findBlockedPrepDate(dateKey) {
  if (!fs.existsSync(PREP_BLOCKLIST_FILE)) return null;
  const data = readJson(PREP_BLOCKLIST_FILE);
  const blockedDates = Array.isArray(data) ? data : data.blockedDates || [];
  for (const entry of blockedDates) {
    if (typeof entry === 'string' && entry === dateKey) {
      return { date: dateKey, reason: 'blocked' };
    }
    if (entry && entry.date === dateKey && entry.enabled !== false) {
      return entry;
    }
  }
  return null;
}

function walkJson(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.json$/i.test(entry.name)) files.push(full);
    }
  };
  walk(dir);
  return files.sort();
}

function normalizeTopic(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function collectExistingTopics() {
  const titles = new Set();
  const slugs = new Set();
  for (const file of [...walkJson(PLAN_DIR), ...walkJson(APPROVED_DIR), ...walkJson(CANDIDATE_DIR)]) {
    let data;
    try {
      data = readJson(file);
    } catch {
      continue;
    }
    for (const post of data.posts || []) {
      if (post.title) titles.add(normalizeTopic(post.title));
      if (post.slug) slugs.add(String(post.slug));
      if (post.id) slugs.add(String(post.id).replace(/^birthday_reel_\d{8}_\d{4}_/, '').replaceAll('_', '-'));
    }
  }
  return { titles, slugs };
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rotate(array, amount) {
  const offset = amount % array.length;
  return [...array.slice(offset), ...array.slice(0, offset)];
}

function postTimesForDate(dateKey) {
  return dailyBirthdayReelTimesForDate(dateKey);
}

function loadPdcaFeedback() {
  if (process.env.SOCIAL_VIDEO_PDCA_APPLY === 'false') return null;
  if (!fs.existsSync(PDCA_FEEDBACK_FILE)) return null;
  const feedback = readJson(PDCA_FEEDBACK_FILE);
  if (!feedback || typeof feedback !== 'object') return null;
  return feedback;
}

function topicKindFromTopicType(topicType) {
  const value = String(topicType || '');
  if (value === 'birthday_top5') return 'top5';
  if (value === 'birthday_graph_1_31') return 'graph';
  if (value === 'birthday_day_aruaru' || value === 'birthday_day_manual') return 'single_day';
  return '';
}

function topicKindWeight(kind, feedback) {
  const weights = feedback?.topicTypeWeights || {};
  if (kind === 'top5') return Number(weights.birthday_top5 || 1);
  if (kind === 'graph') return Number(weights.birthday_graph_1_31 || 1);
  if (kind === 'single_day') {
    return Math.max(Number(weights.birthday_day_aruaru || 1), Number(weights.birthday_day_manual || 1));
  }
  return 1;
}

function orderTopicKinds(baseOrder, feedback) {
  if (!feedback) return baseOrder;
  const preferred = [];
  for (const topicType of feedback.preferredTopicTypes || []) {
    const kind = topicKindFromTopicType(topicType);
    if (kind && baseOrder.includes(kind) && !preferred.includes(kind)) preferred.push(kind);
  }
  const remaining = baseOrder
    .filter(kind => !preferred.includes(kind))
    .sort((a, b) => topicKindWeight(b, feedback) - topicKindWeight(a, feedback));
  return [...preferred, ...remaining];
}

function pdcaFeedbackSummary(feedback) {
  if (!feedback) return null;
  return {
    updatedAt: feedback.updatedAt || '',
    sourceReport: feedback.sourceReport || '',
    preferredTopicTypes: feedback.preferredTopicTypes || [],
    preferredTimes: feedback.preferredTimes || [],
    topicTypeWeights: feedback.topicTypeWeights || {},
    nextResearchDirectives: feedback.nextResearchDirectives || [],
  };
}

function sourceNotesForDate(dateKey) {
  return [
    {
      sourceAccount: 'Instagram Creators / Meta',
      sourceUrl: 'https://creators.instagram.com/grow/algorithms-and-ranking?locale=en_GB',
      observedPattern: 'Instagramのランキングは視聴維持・反応・シェアされやすさを強く見るため、短く分かる1テーマ構成にする。',
      usedAs: '毎日リールの設計原則',
      transformationNote: '広告色を強めず、保存したくなる自己理解Top5として再構成する。',
      duplicateCheck: '外部投稿本文・画像・ランキングはコピーせず、羅針占術の誕生日数Top5へ変換する。',
    },
    {
      sourceAccount: 'Meta Transparency Center',
      sourceUrl: 'https://transparency.meta.com/features/explaining-ranking/ig-reels-chaining/',
      observedPattern: 'Reels面は次に見たい可能性が高い動画を予測して並べるため、冒頭で内容がすぐ分かる構成を優先する。',
      usedAs: 'タイトル・リードの設計根拠',
      transformationNote: '1枚目で「自分の誕生日があるか」を即確認できる見出しにする。',
      duplicateCheck: 'トレンド音源や他者動画素材には依存しない。',
    },
    {
      sourceAccount: '羅針占術 internal',
      sourceUrl: 'docs/sns-runbook.md',
      observedPattern: 'Threads + Instagram、InstagramはReels、Threadsは動画投稿。木曜20:00は比較カルーセル優先。',
      usedAs: `${dateKey} の投稿時刻と媒体制約`,
      transformationNote: '木曜20:00は比較カルーセル優先。日次リールは木曜21:00/22:00、他曜日20:00/21:00/22:00だけにする。',
      duplicateCheck: '承認済みmanifestと投稿済みledgerの既存タイトルを避ける。',
    },
    {
      sourceAccount: '羅針占術 video insights PDCA',
      sourceUrl: 'data/social-posts/pdca/video-insights-feedback.json',
      observedPattern: '投稿済み動画の保存・シェア・返信/コメント・プロフィール訪問をスコア化し、次回のリサーチ候補順へ反映する。',
      usedAs: `${dateKey} のネタ型と投稿時刻の改善材料`,
      transformationNote: '必須3系統は維持し、強かったネタ型を早い枠へ寄せる。',
      duplicateCheck: 'PDCAは型と時刻の優先度だけに使い、本文・順位・画像・動画はコピーしない。',
    },
  ];
}

function buildRows(topic, seed, topicIndex) {
  const days = rotate(DAY_SETS[(seed + topicIndex) % DAY_SETS.length], topicIndex % 5);
  const patterns = [
    `${topic.trait}が特に出やすい日です。${topic.moment}でも、${topic.value}を大切にできます。`,
    `一見ゆっくりでも観察は細かいです。必要な時だけ、${topic.action}流れを作れます。`,
    `無理に目立たなくても伝わります。近くの人ほど、あとから${topic.gift}が効いてきます。`,
    `気持ちを整理してから動くタイプです。勢いより、${topic.value}を大切にします。`,
    `表では控えめでも芯があります。大事な場面で${topic.action}力が出やすい日です。`,
  ];
  return days.map((day, index) => {
    birthdayMiniFamilyForDay(day);
    return {
      rank: index + 1,
      day,
      reason: patterns[index],
    };
  });
}

function selectTop5Topics(dateKey, count) {
  const existing = collectExistingTopics();
  const seed = hashString(dateKey);
  const rotated = rotate(TOPIC_BANK, seed % TOPIC_BANK.length);
  const selected = [];
  for (const topic of rotated) {
    if (selected.length >= count) break;
    if (existing.titles.has(normalizeTopic(topic.title))) continue;
    if (existing.slugs.has(topic.slug)) continue;
    selected.push(topic);
  }
  if (selected.length < count) {
    throw new Error(`Topic bank exhausted for ${dateKey}. Add more topics before auto-generating.`);
  }
  return selected;
}

function slotsForDate(dateKey, pdcaFeedback = loadPdcaFeedback()) {
  const times = postTimesForDate(dateKey);
  if (dayOfWeek(dateKey) === 4) {
    const topicOrder = orderTopicKinds(['single_day', 'graph'], pdcaFeedback);
    return times.map((time, index) => ({ time, topicKind: topicOrder[index] }));
  }
  const topicOrder = orderTopicKinds(['top5', 'single_day', 'graph'], pdcaFeedback);
  return times.map((time, index) => ({ time, topicKind: topicOrder[index] }));
}

function buildTop5Post(topic, slot, seed, index) {
  return {
    time: slot.time,
    topicType: 'birthday_top5',
    researchTarget: 'birthday_top5',
    slug: topic.slug,
    title: topic.title,
    titleLines: topic.titleLines,
    lead: topic.lead,
    sourceUrl: 'https://www.instagram.com/uranai.kitsune/?hl=ja',
    theme: THEMES[(seed + index) % THEMES.length],
    rows: buildRows(topic, seed, index),
    summary: topic.summary,
  };
}

function buildSingleDayPost(dateKey, slot, seed, index) {
  const day = singleDayForDate(dateKey, seed, index);
  const type = singleDayType(seed, index);
  const title = `${day}${type.titleSuffix}`;
  return {
    time: slot.time,
    topicType: type.topicType,
    researchTarget: 'birthday_day_aruaru_manual',
    slug: `${type.slugPrefix}-${String(day).padStart(2, '0')}-${dateKey.replaceAll('-', '')}`,
    title,
    titleLines: [`${day}日生まれ`, type.topicType === 'birthday_day_manual' ? '取説5選' : 'あるある5選'],
    lead: type.leadPrefix,
    sourceUrl: 'https://www.instagram.com/uranai.kitsune/?hl=ja',
    theme: THEMES[(seed + index) % THEMES.length],
    day,
    points: buildSingleDayPoints(day, seed + index),
    summary: type.summaryPrefix,
  };
}

function buildGraphPost(dateKey, slot, seed, index) {
  return {
    time: slot.time,
    topicType: 'birthday_graph_1_31',
    researchTarget: 'birthday_graph_all_days',
    slug: `birthday-graph-1-31-${dateKey.replaceAll('-', '')}`,
    title: '生まれ日グラフ 1日〜31日',
    titleLines: ['生まれ日グラフ', '1日〜31日ぜんぶ'],
    lead: '1日から31日までを1本で見られるように、保存向けのグラフ動画にします。',
    sourceUrl: 'https://www.instagram.com/uranai.kitsune/?hl=ja',
    theme: THEMES[(seed + index) % THEMES.length],
    graphDays: buildGraphDays(seed + index),
    summary: '全日を一度に見られる投稿にして、自分と周りの生まれ日を探しやすくします。',
  };
}

function buildPlan(dateKey) {
  const seed = hashString(dateKey);
  const pdcaFeedback = loadPdcaFeedback();
  const slots = slotsForDate(dateKey, pdcaFeedback);
  const top5Topics = selectTop5Topics(dateKey, slots.filter(slot => slot.topicKind === 'top5').length);
  const avoidedTopics = [...collectExistingTopics().titles].slice(-80);
  let top5Index = 0;
  return {
    date: dateKey,
    reviewTitle: `${dateKey} 夜枠 誕生日リール自動生成候補`,
    schedulePolicy: {
      dailyBirthdayReelTimes: postTimesForDate(dateKey),
      thursdayComparisonTime: '20:00',
    },
    sourceNotes: sourceNotesForDate(dateKey),
    pdcaFeedback: pdcaFeedbackSummary(pdcaFeedback),
    requiredResearchTargets: [
      '生まれ日あるある/取説: 1日〜31日のいずれかを毎日自動選定',
      '生まれ日グラフ: 1日〜31日を毎回すべて網羅',
      '○○な生まれ日TOP5: 木曜20時以外の20時枠で自動選定',
    ],
    avoidedTopics,
    posts: slots.map((slot, index) => {
      if (slot.topicKind === 'top5') {
        const post = buildTop5Post(top5Topics[top5Index], slot, seed, index);
        top5Index += 1;
        return post;
      }
      if (slot.topicKind === 'single_day') return buildSingleDayPost(dateKey, slot, seed, index);
      if (slot.topicKind === 'graph') return buildGraphPost(dateKey, slot, seed, index);
      throw new Error(`Unknown topic kind: ${slot.topicKind}`);
    }),
  };
}

async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed${output ? `\n${output}` : ''}`);
  }
  return result.stdout ? result.stdout.trim() : '';
}

function gitOutput(args) {
  return run('git', args, { capture: true });
}

function parseOriginSlug() {
  const remote = gitOutput(['config', '--get', 'remote.origin.url']);
  const https = remote.match(/github\.com[:/](.+?\/.+?)(?:\.git)?$/i);
  if (https) return https[1].replace(/\.git$/i, '');
  return 'tekechannnel-max/rashin_senjutsu';
}

function currentBranch() {
  const branch = gitOutput(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch || branch === 'HEAD') throw new Error('Cannot build raw GitHub URLs from detached HEAD.');
  return branch;
}

function rawGithubUrl(relativePath, branch) {
  const repo = parseOriginSlug();
  const encodedPath = relativePath.split('/').map(part => encodeURIComponent(part)).join('/');
  return `https://raw.githubusercontent.com/${repo}/refs/heads/${branch}/${encodedPath}`;
}

function selectedGitPaths(dateKey, approvedManifest) {
  const paths = new Set([
    rel(path.join(PLAN_DIR, `${dateKey}-birthday-reels.json`)),
    rel(path.join(APPROVED_DIR, `${dateKey}-night-reels.json`)),
    rel(path.join(CANDIDATE_DIR, `${dateKey}-approved-candidate.json`)),
    rel(path.join(REVIEW_DIR, dateKey)),
  ]);
  for (const post of approvedManifest.posts || []) {
    if (post.videoPath) {
      const parts = rel(path.resolve(ROOT, post.videoPath)).split('/');
      paths.add(parts.slice(0, -2).join('/'));
      paths.add(parts.slice(0, -1).join('/'));
    }
    for (const screenshot of post.designReview?.screenshots || []) {
      const parts = rel(path.resolve(ROOT, screenshot)).split('/');
      paths.add(parts.slice(0, -1).join('/'));
    }
  }
  return [...paths].filter(Boolean);
}

function publishSelectedPaths(dateKey, approvedManifest) {
  const paths = selectedGitPaths(dateKey, approvedManifest);
  gitOutput(['add', '-f', '--', ...paths]);
  const diff = spawnSync('git', ['diff', '--cached', '--quiet', '--', ...paths], { cwd: ROOT });
  if (diff.status === 0) return { committed: false, pushed: false, paths };
  const message = `Auto prepare approved SNS reels ${dateKey}`;
  gitOutput(['commit', '--only', '-m', message, '--', ...paths]);
  gitOutput(['push', 'origin', 'HEAD']);
  return { committed: true, pushed: true, paths };
}

async function approveCandidate(dateKey, options) {
  const candidatePath = path.join(CANDIDATE_DIR, `${dateKey}-approved-candidate.json`);
  const approvedPath = path.join(APPROVED_DIR, `${dateKey}-night-reels.json`);
  const candidate = readJson(candidatePath);
  const branch = currentBranch();
  const now = new Date().toISOString();
  const approved = {
    ...candidate,
    approvalStatus: 'approved',
    approvedBy: 'automation',
    approvedAt: now,
    approvalText: 'User requested fully automated SNS research, production, approval-manifest preparation, and scheduled posting on 2026-06-25.',
    approvalScope: DEFAULT_PLATFORMS,
    sourceCandidate: rel(candidatePath),
    note: 'Auto-approved by local Rashin SNS automation. Posting remains limited to due windows and approved birthday_reel manifests.',
    posts: (candidate.posts || []).map(post => ({
      ...post,
      platforms: post.platforms || DEFAULT_PLATFORMS,
      videoUrl: post.videoUrl || rawGithubUrl(post.videoPath, branch),
    })),
  };
  if (!options.overwrite && fs.existsSync(approvedPath)) {
    const existing = readJson(approvedPath);
    if (existing.approvalStatus === 'approved') {
      return { approvedPath, approved: existing, skipped: true };
    }
  }
  await writeJson(approvedPath, approved);
  return { approvedPath, approved, skipped: false };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dateKey = validateDateKey(args.date || targetDateFromDaysAhead(args.daysAhead));
  const blockedPrepDate = findBlockedPrepDate(dateKey);
  if (blockedPrepDate) {
    console.log(JSON.stringify({
      status: 'skipped_blocked_date',
      date: dateKey,
      blocklistPath: rel(PREP_BLOCKLIST_FILE),
      reason: blockedPrepDate.reason || '',
      unblockCondition: blockedPrepDate.unblockCondition || '',
      schedulePolicy: {
        dailyBirthdayReelTimes: postTimesForDate(dateKey),
        thursdayComparisonTime: '20:00',
      },
    }, null, 2));
    return;
  }

  const approvedPath = path.join(APPROVED_DIR, `${dateKey}-night-reels.json`);
  const existingApproved = fs.existsSync(approvedPath) ? readJson(approvedPath) : null;
  if (!args.overwrite && existingApproved?.approvalStatus === 'approved') {
    let git = { committed: false, pushed: false, paths: [] };
    if (args.publishToGit) {
      git = publishSelectedPaths(dateKey, existingApproved);
    }
    console.log(JSON.stringify({
      status: 'skipped_existing_approved_manifest',
      date: dateKey,
      approvedPath: rel(approvedPath),
      schedulePolicy: {
        dailyBirthdayReelTimes: postTimesForDate(dateKey),
        thursdayComparisonTime: '20:00',
      },
      publishToGit: git,
      posts: (existingApproved.posts || []).map(post => ({ id: post.id, time: post.time, title: post.title })),
    }, null, 2));
    return;
  }

  const plan = buildPlan(dateKey);
  const planPath = path.join(PLAN_DIR, `${dateKey}-birthday-reels.json`);
  if (args.dryRun) {
    console.log(JSON.stringify({
      status: 'dry_run',
      date: dateKey,
      planPath: rel(planPath),
      schedulePolicy: plan.schedulePolicy,
      pdcaFeedbackApplied: Boolean(plan.pdcaFeedback),
      pdcaFeedback: plan.pdcaFeedback,
      posts: plan.posts.map(post => ({
        time: post.time,
        topicType: post.topicType,
        researchTarget: post.researchTarget,
        slug: post.slug,
        title: post.title,
        day: post.day || null,
        rows: post.rows || null,
        pointCount: Array.isArray(post.points) ? post.points.length : null,
        graphDayCount: Array.isArray(post.graphDays) ? post.graphDays.length : null,
      })),
    }, null, 2));
    return;
  }

  await writeJson(planPath, plan);
  run(process.execPath, [GENERATOR, '--config', planPath]);

  let approval = null;
  if (args.autoApprove) {
    approval = await approveCandidate(dateKey, args);
  }

  let git = { committed: false, pushed: false, paths: [] };
  if (args.publishToGit && approval?.approved) {
    git = publishSelectedPaths(dateKey, approval.approved);
  }

  console.log(JSON.stringify({
    status: 'prepared',
    date: dateKey,
    planPath: rel(planPath),
    approvedPath: approval ? rel(approval.approvedPath) : '',
    approvalSkipped: approval ? approval.skipped : false,
    schedulePolicy: plan.schedulePolicy,
    pdcaFeedbackApplied: Boolean(plan.pdcaFeedback),
    pdcaFeedback: plan.pdcaFeedback,
    publishToGit: git,
    posts: plan.posts.map(post => ({
      time: post.time,
      topicType: post.topicType,
      researchTarget: post.researchTarget,
      slug: post.slug,
      title: post.title,
    })),
  }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
