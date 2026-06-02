const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const ACTIVE_KINDS = ['oracle', 'empathy', 'difference', 'free_paid_compare'];
const THREADS_MATCHED_PLATFORM_KINDS = ['oracle', 'empathy', 'difference', 'free_paid_compare'];
const { LENORMAND_EMPATHY_POSTS } = require('../scripts/social/content/lenormand-empathy-posts');
const { ORACLE_CARD_COPY } = require('../scripts/social/content/oracle-card-copy');

const SOCIAL_FORCED_TASK_WORDS = /確認|見る|見直|読む|書く|書き|整理|測る|言葉にする|形に残す|試す|選ぶ前|候補|深呼吸|手放す|決める前|事実だけ|都合よく使われ|行き先|優先する/;

function runNode(args, options = {}) {
  const result = spawnSync(NODE, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
  });
  if (options.expectSuccess !== false) {
    assert.equal(result.status, 0, `${args.join(' ')} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

function parseDraft(date = '2026-05-27', options = {}) {
  const result = runNode([
    'scripts/social/daily-oracle-post.js',
    '--dry-run',
    `--date=${date}`,
    '--platforms=threads,bluesky,x,instagram',
    '--kind=all',
  ], options);
  return JSON.parse(result.stdout);
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function scheduledDates(from, weekdays, count) {
  const dates = [];
  for (let date = from; dates.length < count; date = addDays(date, 1)) {
    if (weekdays.includes(new Date(`${date}T00:00:00.000Z`).getUTCDay())) dates.push(date);
  }
  return dates;
}

function assertTracked(text, trackedUrl, label, options = {}) {
  if (options.visibleUrl === false) {
    assert.doesNotMatch(String(text || ''), /rashin-senjutsu\.onrender\.com/, `${label} should keep visible URL out of the copy`);
  } else {
    assert.match(String(text || ''), /rashin-senjutsu\.onrender\.com/, `${label} needs visible app URL`);
  }
  if (options.profileLink) {
    assert.match(String(text || ''), /プロフィールのリンクから/, `${label} should point Instagram readers to the profile link`);
  }
  assert.match(trackedUrl, /https:\/\/rashin-senjutsu\.onrender\.com\/\S*utm_source=/, `${label} needs tracked URL`);
  assert.match(trackedUrl, /[?&]utm_medium=social\b/, `${label} needs utm_medium`);
  assert.match(trackedUrl, /[?&]utm_campaign=/, `${label} needs utm_campaign`);
  assert.match(trackedUrl, /[?&]utm_content=/, `${label} needs utm_content`);
}

function assertImageAndAlt(imagePath, altText, label) {
  assert.ok(imagePath, `${label} imagePath is required`);
  assert.ok(fs.existsSync(imagePath), `${label} image does not exist: ${imagePath}`);
  assert.ok(String(altText || '').trim().length >= 10, `${label} alt text is too short`);
}

function normalizePlatformHashtagOnlyDifference(text) {
  return String(text || '')
    .replace(/(^|\n)#[^\s#]+(?:\s+#[^\s#]+)*/g, '$1#<platform-tags>')
    .replace(/(?:https?:\/\/)?rashin-senjutsu\.onrender\.com\b/g, '<profile-link>')
    .replace(/プロフィールのリンクから[^\n]*/g, '<profile-link>')
    .replace(/<profile-link>(?:\s*<profile-link>)+/g, '<profile-link>')
    .replace(/utm_source=(threads|bluesky|instagram)/g, 'utm_source=<platform>');
}

function countHashtags(text) {
  return (String(text || '').match(/(^|\s)#[^\s#]+/g) || []).length;
}

function scanConstInitializer(source, constName, openChar, closeChar) {
  const match = new RegExp(`const\\s+${constName}\\s*=`).exec(source);
  assert.ok(match, `${constName} is missing`);
  const open = source.indexOf(openChar, match.index + match[0].length);
  assert.ok(open >= 0, `${constName} initializer is missing`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
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
  throw new Error(`${constName} initializer did not close`);
}

function readConstFromFile(relativeFile, constName, openChar, closeChar) {
  const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
  const literal = scanConstInitializer(source, constName, openChar, closeChar);
  return Function(`"use strict"; return (${literal});`)();
}

function assertGroundingTerms(text, terms, label, minimum = 2) {
  const hits = terms.filter(term => String(text || '').includes(term));
  assert.ok(
    hits.length >= minimum,
    `${label} should be grounded in card meaning terms. hits=${hits.join(',') || '-'} required=${terms.join(',')}`
  );
}

const ORACLE_GROUNDING_TERMS = {
  1: ['意志', '一歩', '道しるべ', '道筋'],
  2: ['支え', '自分の軸', '尊重'],
  3: ['純粋', '楽しさ', '創造'],
  4: ['焦らず', '積み重ね', '基盤', '安定'],
  5: ['未知', '新しい体験', '成長', '変化'],
  6: ['思いやり', '自己犠牲', '受け取る', 'バランス'],
  7: ['感性', '技術', '内面', '一歩'],
  8: ['覚悟', '行動', '現実', '力'],
  9: ['経験', '知恵', '手放す', '次のサイクル'],
  10: ['新しい力', '可能性', '新局面', '転換'],
  11: ['直感', 'ひらめき', '感覚', '手がかり'],
  12: ['対立', '違い', '調整', 'バランス'],
  13: ['冷静', '判断', '責任', '安定'],
  14: ['変化', '更新', '中庸', '調整'],
  15: ['役に立つ', '貢献', '純粋な動機'],
  16: ['本質', '観察', '洞察', '再生'],
  17: ['希望', '与える', '豊かな流れ'],
  18: ['探求', '見えていない答え', '不安', '幻想'],
  19: ['信念', '意志', '謙虚', '道'],
  20: ['つなげる', '過去', '統合', '可能性'],
  21: ['完成', '節目', '終わり', '次'],
  22: ['影響力', 'ビジョン', '構築', '一歩'],
  23: ['流れ', '乗りこなす', '柔軟', '自分の軸'],
  24: ['優しさ', '品位', '誠実', '奉仕'],
  25: ['自分のペース', '道', '内省', '自己信頼'],
  26: ['切り開く', '野心', '実行力', '責任'],
  27: ['節目', '新しい段階', '次の扉', '移行'],
  28: ['共鳴', '人や環境', '運気', '調和'],
  29: ['ビジョン', '理想', '現実の一歩', '使命'],
  30: ['想像力', '形', '表現', '創造'],
  31: ['長期', '計画', '構築', '積み上げ'],
  32: ['信頼', '仲間', '共創', '相互補完'],
  33: ['高い視点', '成長', '満たされ', '愛'],
};

const LENORMAND_GROUNDING_TERMS = {
  1: ['知らせ', '吉報', '流れ', '早まる'],
  2: ['幸運', '偶然', '好機', '味方'],
  3: ['遠方', '遠い縁', '旅立ち', '動き出す'],
  4: ['安心', '土台', '居場所', '支え'],
  5: ['根づく', '時間', '実り', '安定'],
  6: ['霧', '迷い', '不安', '前触れ'],
  7: ['絡む', '誘惑', '複雑', '影'],
  8: ['終わり', '閉じる', '再生', '静けさ'],
  9: ['祝福', '喜び', '好意', '予感'],
  10: ['突然', '区切り', '分かれ目', '鋭く'],
  11: ['繰り返', '摩擦', '衝突', '余白'],
  12: ['ざわめく', '言葉', '波', '不安'],
  13: ['新芽', '始まり', '小さな芽', '可能性'],
  14: ['隠れた意図', '本音', '影', '慎重'],
  15: ['守り', '強い力', '背後', '庇護'],
  16: ['星', '希望', '光', '理想'],
  17: ['変化', '環境', '改善', '風'],
  18: ['信頼', '忠実', '味方', '誠実'],
  19: ['孤高', '塔', '距離', '自立'],
  20: ['人の輪', '縁', '場', '運'],
  21: ['山', '壁', '遅れ', '迂回'],
  22: ['分岐', '道', '迷い', '転機'],
  23: ['削られる', '消耗', '欠け', '運気'],
  24: ['心', '愛情', '好意', '流れ'],
  25: ['結び', '約束', '絆', '巡り'],
  26: ['隠された', '秘密', '知識', '鍵'],
  27: ['知らせ', '運気', '返事', '流れ'],
  28: ['男性性', '焦点', '立場', '運'],
  29: ['女性性', '焦点', '立場', '運'],
  30: ['成熟', '平和', '信頼', '根'],
  31: ['成功', '成果', '光', '運気'],
  32: ['月', '評判', '感性', '流れ'],
  33: ['鍵', '突破口', '答え', '扉'],
  34: ['豊か', '巡り', '金運', '動き始める'],
  35: ['錨', '安定', '戻り', '支え'],
  36: ['十字架', '責任', '試練', '山場'],
};

function testDraftHasTrackingImagesAndAlt() {
  const draft = parseDraft();
  for (const kind of ACTIVE_KINDS) {
    const visibleUrl = true;
    assertTracked(draft[kind].text, draft[kind].trackedUrl, `threads ${kind}`, { visibleUrl });
    assertTracked(draft[kind].blueskyText, draft[kind].blueskyTrackedUrl, `bluesky ${kind}`, { visibleUrl });
    assertTracked(draft[kind].xText, draft[kind].xTrackedUrl, `x ${kind}`, { visibleUrl });
    assert.ok([...draft[kind].xText].length <= 280, `${kind} X draft should fit the 280 character posting limit`);
    assertTracked(draft[kind].instagramText, draft[kind].instagramTrackedUrl, `instagram ${kind}`, {
      visibleUrl: false,
      profileLink: true,
    });
    assertImageAndAlt(draft[kind].imagePath, draft[kind].altText, `threads ${kind}`);
    assertImageAndAlt(draft[kind].blueskyImagePath, draft[kind].altText, `bluesky ${kind}`);
    assertImageAndAlt(draft[kind].instagramImagePath, draft[kind].altText, `instagram ${kind}`);
    assert.equal(draft[kind].blueskyImagePath, draft[kind].imagePath, `${kind} Bluesky image should match Threads image`);
    assert.equal(draft[kind].blueskyImageUrl, draft[kind].imageUrl, `${kind} Bluesky image URL should match Threads image URL`);
    assert.match(draft[kind].instagramImageUrl, /\.jpg$/i, `${kind} Instagram image must be JPEG`);
    if (kind === 'oracle') {
      assert.match(draft[kind].imagePath, /images[\\/]social[\\/]instagram[\\/]oracle[\\/]\d{2}\.jpg$/, 'oracle Threads should use the text-added generated image');
      assert.match(draft[kind].imageUrl, /\/images\/social\/instagram\/oracle\/\d{2}\.jpg$/, 'oracle Threads URL should use the generated image');
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]oracle[\\/]\d{2}\.jpg$/, 'oracle Instagram should use the text-added generated image');
      assert.match(draft[kind].instagramImageUrl, /\/images\/social\/instagram\/oracle\/\d{2}\.jpg$/, 'oracle Instagram URL should use the generated image');
    } else if (kind === 'empathy') {
      assert.match(draft[kind].imagePath, /images[\\/]social[\\/]instagram[\\/]lenormand-empathy[\\/]\d{2}\.jpg$/, 'empathy Threads should use the text-added generated image');
      assert.match(draft[kind].imageUrl, /\/images\/social\/instagram\/lenormand-empathy\/\d{2}\.jpg$/, 'empathy Threads URL should use the generated image');
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]lenormand-empathy[\\/]\d{2}\.jpg$/, 'empathy Instagram should use the text-added generated image');
      assert.match(draft[kind].instagramImageUrl, /\/images\/social\/instagram\/lenormand-empathy\/\d{2}\.jpg$/, 'empathy Instagram URL should use the generated image');
    } else if (kind === 'difference') {
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]difference\.jpg$/, 'difference Instagram should use the dedicated Instagram image');
    } else if (kind === 'free_paid_compare') {
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]free-paid-compare\.jpg$/, 'free_paid_compare Instagram should use the dedicated Instagram image');
    }
    assert.ok(fs.statSync(draft[kind].blueskyImagePath).size <= 1_000_000, `${kind} Bluesky image must be <= 1,000,000 bytes`);
  }
}

function testPlatformHashtagPolicy() {
  const draft = parseDraft('2026-06-06');
  const legacyEnvDraft = parseDraft('2026-06-06', {
    env: { SOCIAL_THREADS_HASHTAG: '#占い鑑定' },
  });
  const customInstagramDraft = parseDraft('2026-06-06', {
    env: { SOCIAL_INSTAGRAM_HASHTAGS: '#one #two #three #four #five #six' },
  });
  const legacyInstagramDraft = parseDraft('2026-06-06', {
    env: { SOCIAL_INSTAGRAM_EMPATHY_HASHTAGS: '#羅針占術 #ルノルマンカード #悩み相談 #占い好きな人と繋がりたい #AI占い' },
  });
  const blueskyTags = ['#羅針占術', '#今日の占い', '#今日の運勢', '#占い師'];
  const instagramKindTags = {
    oracle: ['#おはようvtuber', '#今日の占い', '#オラクルカード'],
    empathy: ['#ルノルマンカード', '#カード占い'],
    difference: ['#AI占い', '#無料占い'],
    free_paid_compare: ['#無料占い', '#ルノルマンカード'],
  };
  for (const kind of ACTIVE_KINDS) {
    assert.match(draft[kind].text, /#占い師のつぶやき/, `${kind} Threads post should use #占い師のつぶやき`);
    assert.doesNotMatch(draft[kind].text, /#羅針占術/, `${kind} Threads post should not use #羅針占術`);
    assert.equal(countHashtags(draft[kind].text), 1, `${kind} Threads post should keep one hashtag`);
    assert.match(legacyEnvDraft[kind].text, /#占い師のつぶやき/, `${kind} legacy Threads hashtag env should normalize to #占い師のつぶやき`);
    assert.doesNotMatch(legacyEnvDraft[kind].text, /#占い鑑定/, `${kind} legacy Threads hashtag env should not leak #占い鑑定`);

    for (const tag of blueskyTags) {
      assert.ok(draft[kind].blueskyText.includes(tag), `${kind} Bluesky post should include ${tag}`);
    }
    assert.equal(countHashtags(draft[kind].blueskyText), blueskyTags.length, `${kind} Bluesky post should use configured hashtags`);
    assert.equal(
      normalizePlatformHashtagOnlyDifference(draft[kind].blueskyText),
      normalizePlatformHashtagOnlyDifference(draft[kind].text),
      `${kind} Bluesky copy should match Threads copy except hashtags`
    );

    assert.match(draft[kind].xText, /#羅針占術/, `${kind} X draft should keep the brand tag`);
    assert.doesNotMatch(draft[kind].xText, /#占い師のつぶやき/, `${kind} X draft should not use the Threads tag`);

    assert.match(draft[kind].instagramText, /#羅針占術/, `${kind} Instagram post should keep the brand tag`);
    assert.equal(countHashtags(draft[kind].instagramText), 5, `${kind} Instagram post should use five focused hashtags`);
    for (const tag of instagramKindTags[kind]) {
      assert.ok(draft[kind].instagramText.includes(tag), `${kind} Instagram post should include ${tag}`);
    }
    assert.doesNotMatch(draft[kind].instagramText, /#占い鑑定/, `${kind} Instagram post should not use the legacy Threads tag`);
    if (THREADS_MATCHED_PLATFORM_KINDS.includes(kind)) {
      assert.equal(
        normalizePlatformHashtagOnlyDifference(draft[kind].instagramText),
        normalizePlatformHashtagOnlyDifference(draft[kind].text),
        `${kind} Instagram copy should match Threads copy except hashtags`
      );
    }
    assert.equal(countHashtags(customInstagramDraft[kind].instagramText), 5, `${kind} custom Instagram hashtags should be capped at five`);
    assert.doesNotMatch(customInstagramDraft[kind].instagramText, /#six/, `${kind} custom Instagram hashtags should drop tags after the fifth`);
  }
  assert.match(legacyInstagramDraft.empathy.instagramText, /#カード占い/, 'legacy Lenormand Instagram tags should normalize to card-reading tags');
  assert.doesNotMatch(legacyInstagramDraft.empathy.instagramText, /#悩み相談/, 'legacy Lenormand Instagram tags should not keep the old worry tag');
}

function testAutomationDocsEnableBlueskyWithThreadsAndInstagram() {
  const expectedPlatforms = 'SOCIAL_PLATFORMS=threads,bluesky,instagram';
  for (const relativeFile of ['.env.example', '.env.example.txt', path.join('docs', 'sns-runbook.md'), path.join('scripts', 'social', 'README.md')]) {
    const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
    assert.match(source, new RegExp(expectedPlatforms), `${relativeFile} should configure Bluesky with Threads and Instagram`);
  }
  const runbook = fs.readFileSync(path.join(ROOT, 'docs', 'sns-runbook.md'), 'utf8');
  const disabledBlueskyPhrases = [
    ['Blueskyは現運用では', '自動投稿しない'].join(''),
    ['Bluesky', '再開時だけ'].join(''),
  ];
  for (const phrase of disabledBlueskyPhrases) {
    assert.ok(!runbook.includes(phrase), 'runbook should not describe Bluesky as disabled');
  }
}

function testWorkflowPostingPlatformsMatchProductionLane() {
  for (const relativeFile of [path.join('.github', 'workflows', 'sns-automation.yml'), path.join('.github', 'workflows', 'threads-social.yml')]) {
    const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
    assert.match(source, /SOCIAL_PLATFORMS:\s*threads,bluesky,instagram/, `${relativeFile} should post to Threads, Bluesky, and Instagram together`);
    assert.match(source, /BLUESKY_APP_PASSWORD/, `${relativeFile} should require Bluesky credentials`);
    assert.match(source, /INSTAGRAM_ACCESS_TOKEN/, `${relativeFile} should require Instagram credentials`);
    assert.match(source, /npm run instagram:doctor/, `${relativeFile} should verify Instagram before posting`);
    assert.match(source, /npm run bluesky:doctor/, `${relativeFile} should verify Bluesky before posting`);
    assert.doesNotMatch(source, /SOCIAL_PLATFORMS:\s*threads\s*$/m, `${relativeFile} should not keep a Threads-only posting lane`);
  }
}

function testMorningOracleCopyStillKeepsRequiredClosing() {
  const draft = parseDraft('2026-05-27');
  assert.ok(draft.oracle.text.startsWith('おはてけ🌸🦦'), 'morning oracle Threads post should start with the friendly greeting');
  assert.match(draft.oracle.text, /今日の数秘オラクル/, 'morning oracle post should keep the oracle label');
  assert.match(draft.oracle.text, /今日の1枚はこちら！👇/, 'oracle Threads post must keep the requested CTA line');
  assert.doesNotMatch(draft.oracle.text, /utm_source=|utm_content=|\/share\/card/, 'oracle visible text should not include long tracking URL');
  assert.match(draft.oracle.trackedUrl, /utm_content=oracle_20260527/, 'oracle tracked URL should keep the oracle utm_content');
}

function testOracleDailyCopyIsGroundedInAllCardReadings() {
  const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const oracle = readConstFromFile('app.js', 'ORACLE', '{', '}');
  const dailyMessages = readConstFromFile('app.js', 'DAILY_ORACLE_MESSAGES', '[', ']');
  const generatorSource = fs.readFileSync(path.join(ROOT, 'scripts', 'social', 'generate-instagram-assets.js'), 'utf8');
  const posterSource = fs.readFileSync(path.join(ROOT, 'scripts', 'social', 'daily-oracle-post.js'), 'utf8');
  const seen = new Set();

  assert.equal(dailyMessages.length, 33, 'daily oracle copy should cover all 33 oracle cards');
  assert.equal(Object.keys(ORACLE_CARD_COPY).length, 33, 'oracle social copy should cover all 33 oracle cards');
  assert.doesNotMatch(appSource, /今日の一手/, 'daily oracle app copy should use 今日のよりどころ instead of 今日の一手');
  assert.match(generatorSource, /ORACLE_CARD_COPY/, 'oracle image generator should use externally grounded social copy');
  assert.match(posterSource, /ORACLE_CARD_COPY/, 'oracle social drafts should use externally grounded social copy');
  for (const item of dailyMessages) {
    const id = Number(item.id);
    const source = oracle[id];
    const copy = ORACLE_CARD_COPY[id];
    assert.ok(source, `oracle source is missing for ${id}`);
    assert.equal(item.name, source.name, `${id} oracle daily name should match ORACLE`);
    assert.ok(copy, `${id} oracle social copy is missing`);
    assert.ok(!seen.has(id), `duplicate oracle daily card: ${id}`);
    seen.add(id);

    for (const field of ['title', 'lead', 'message', 'support']) {
      assert.ok(String(copy[field] || '').trim(), `${id} oracle ${field} is required`);
      assert.doesNotMatch(String(copy[field]), /\r|\n/, `${id} oracle ${field} should not contain manual line breaks`);
    }
    assert.ok([...copy.title].length <= 14, `${id} oracle social title should fit the image headline`);
    assert.ok([...copy.message].length <= 18, `${id} oracle message should fit the image message area`);
    assert.ok([...copy.support].length <= 18, `${id} oracle support should fit the image support area`);
    assert.doesNotMatch(
      `${copy.title}${copy.lead}${copy.message}${copy.support}`,
      SOCIAL_FORCED_TASK_WORDS,
      `${id} oracle social copy should describe the card meaning without assigning work to the reader`
    );

    const combined = [item.title, item.message, item.action, item.share, copy.title, copy.lead, copy.message, copy.support].join('\n');
    assert.doesNotMatch(
      [item.title, item.message, item.action, item.share].join('\n'),
      SOCIAL_FORCED_TASK_WORDS,
      `${id} daily oracle app copy should read as support, not as manual work`
    );
    assertGroundingTerms(combined, ORACLE_GROUNDING_TERMS[id], `oracle ${id} ${item.name}`, 3);
  }
}

function testLenormandOneCardCopyDataQuality() {
  const oldLabel = new RegExp('悩み' + '共感');
  const positiveBlockedWords = /不安|苦し|重い|消耗|注意|無理|壁|曇|削|背負|傷/;
  const cautionStateWords = /曖昧|揺れ|誘惑|嫉妬|警戒|停止|終わり|急|摩擦|口論|消耗|ざわめき|不安|嘘|隠れ|停滞|遅れ|壁|迂回|損失|負担|責任|重く|背負/;
  const divinationSignalWords = /兆し|予兆|気配|運気|運|流れ|サイン|暗示|前触れ|予感|導き|光|風|影|扉|鍵|巡り|転機|山場|祝福|吉報|幸運/;
  const generatorSource = fs.readFileSync(path.join(ROOT, 'scripts', 'social', 'generate-instagram-assets.js'), 'utf8');
  const lenormand = readConstFromFile('app.js', 'LENORMAND', '{', '}');
  const seen = new Set();

  assert.equal(LENORMAND_EMPATHY_POSTS.length, 36, 'Lenormand one-card copy should cover all 36 cards');
  assert.match(generatorSource, /ルノルマンカードメッセージ\.png/, 'Lenormand image generator should use the Lenormand message backdrop');
  assert.doesNotMatch(generatorSource, /羅針カード背景\.png|ルノルマンカード表紙デザイン2\.png/, 'Lenormand image generator should not use the wrong backdrop');
  assert.match(generatorSource, /lenormand-one-card/, 'Lenormand image generator should use the fixed one-card layout');
  for (const item of LENORMAND_EMPATHY_POSTS) {
    const source = lenormand[item.cardNumber];
    assert.ok(source, `Lenormand source is missing for ${item.cardNumber}`);
    assert.equal(item.cardName, source.name, `${item.cardNumber} cardName should match LENORMAND`);
    assert.ok(!seen.has(item.cardNumber), `duplicate Lenormand card: ${item.cardNumber}`);
    seen.add(item.cardNumber);
    assert.ok(['positive', 'neutral', 'caution'].includes(item.tone), `${item.cardNumber} should have a valid tone`);
    assertGroundingTerms(
      `${item.title}\n${item.message}\n${item.action}`,
      LENORMAND_GROUNDING_TERMS[item.cardNumber],
      `Lenormand ${item.cardNumber} ${item.cardName}`,
      2
    );
    for (const field of ['cardName', 'cardNameEn', 'title', 'message', 'action', 'cta']) {
      assert.ok(String(item[field] || '').trim(), `${item.cardNumber} ${field} is required`);
      assert.doesNotMatch(String(item[field]), /\r|\n/, `${item.cardNumber} ${field} should not contain manual line breaks`);
      assert.doesNotMatch(String(item[field]), oldLabel, `${item.cardNumber} should not use the old empathy label`);
    }
    assert.ok([...item.title].length <= 12, `${item.cardNumber} title should fit the image headline`);
    assert.ok([...item.message].length <= 15, `${item.cardNumber} message should fit the image message area without awkward wrapping`);
    assert.ok([...item.action].length <= 15, `${item.cardNumber} action should fit the image action area without awkward wrapping`);
    assert.doesNotMatch(`${item.title}${item.message}${item.action}`, SOCIAL_FORCED_TASK_WORDS, `${item.cardNumber} should not assign manual checking or writing tasks to the reader`);
    assert.match(`${item.title}${item.message}${item.action}`, divinationSignalWords, `${item.cardNumber} should read like divination, not a plain task or office memo`);
    if (item.tone === 'positive') {
      assert.doesNotMatch(`${item.title}${item.message}${item.action}`, positiveBlockedWords, `${item.cardNumber} positive card should not be forced into negative empathy copy`);
    }
    if (item.tone === 'caution') {
      assert.match(`${item.title}${item.message}${item.action}`, cautionStateWords, `${item.cardNumber} caution card should describe a concrete caution state without assigning homework`);
    }
  }
}

function testEmpathyUsesRandomLenormandRotation() {
  const seen = new Set();
  const oldLabel = new RegExp('悩み' + '共感');
  for (const dateKey of scheduledDates('2026-05-27', [1, 2, 3, 4], 36)) {
    const draft = parseDraft(dateKey);
    const cardNumber = draft.empathy.card.cardNumber;
    seen.add(cardNumber);
    assert.ok(draft.empathy.text.startsWith('こんてけ🌸🦦'), `${dateKey} empathy post should start with the friendly Lenormand greeting`);
    assert.match(draft.empathy.text, /今日のルノルマン一枚/, `${dateKey} empathy post should use the public Lenormand one-card label`);
    assert.match(draft.empathy.text, /No\.\d{2}\s*\/\s*.+\s*\/\s*[A-Za-z]/, `${dateKey} empathy post should show card number, Japanese name, and English name`);
    assert.match(draft.empathy.text, /今日の兆し[\s\S]+流れのサイン/, `${dateKey} empathy post should use a natural one-card divination structure`);
    assert.match(draft.empathy.text, /🫶✨[\s\S]+🔮✨/, `${dateKey} empathy post should use the friendly character cues`);
    assert.match(draft.empathy.text, /今の流れと次の判断にそっと寄り添う😌👍/, `${dateKey} empathy post should keep the requested soft Rashin CTA`);
    assert.doesNotMatch(draft.empathy.text, oldLabel, `${dateKey} empathy post should not use the old empathy label`);
    assert.match(draft.empathy.trackedUrl, new RegExp(`utm_content=empathy_${dateKey.replace(/-/g, '')}_card\\d{2}`), `${dateKey} empathy utm_content should include card number`);
    assert.match(draft.empathy.imagePath, new RegExp(`images[\\\\/]social[\\\\/]instagram[\\\\/]lenormand-empathy[\\\\/]${String(cardNumber).padStart(2, '0')}\\.jpg$`), `${dateKey} empathy should use the matching text-added Lenormand image`);
    assert.match(draft.empathy.imageUrl, new RegExp(`/images/social/instagram/lenormand-empathy/${String(cardNumber).padStart(2, '0')}\\.jpg$`), `${dateKey} empathy URL should use the matching text-added Lenormand image`);
  }
  assert.equal(seen.size, 36, 'first empathy rotation cycle should use all 36 Lenormand cards without repeats');
}

function testDifferenceAndFreePaidCompareAxes() {
  const difference = parseDraft('2026-06-02').difference;
  assert.match(difference.text, /AI占い|自由記載|四柱推命|姓名判断|動物タイプ|命・卜・相|総合占術|エンジニア|本質|本音|カード|断定|整理|次に動ける/, 'difference post should explain the Rashin distinction');
  assert.match(difference.trackedUrl, /utm_content=difference_20260602_v\d{2}/, 'difference tracked URL should use versioned utm_content');
  assert.match(difference.imagePath, /images[\\/]social[\\/]instagram[\\/]difference\.jpg$/, 'difference Threads should use the dedicated comparison image');
  assert.match(difference.imageUrl, /\/images\/social\/instagram\/difference\.jpg$/, 'difference Threads image URL should use the public Instagram asset path');

  const compare = parseDraft('2026-05-30').free_paid_compare;
  assert.match(compare.text, /無料版|有料版/, 'free_paid_compare should compare free and paid versions');
  assert.match(compare.text, /ルノルマン|数秘オラクル|鑑定履歴|深掘り|解像度/, 'free_paid_compare should explain the paid value without hard selling');
  assert.match(compare.trackedUrl, /utm_content=freepaid_20260530_v\d{2}/, 'free_paid_compare tracked URL should use versioned utm_content');
  assert.match(compare.imagePath, /images[\\/]social[\\/]instagram[\\/]free-paid-compare\.jpg$/, 'free_paid_compare Threads should use the dedicated comparison image');
  assert.match(compare.imageUrl, /\/images\/social\/instagram\/free-paid-compare\.jpg$/, 'free_paid_compare Threads image URL should use the public Instagram asset path');
}

function testPostsLedgerWriteIsTraceableAndSecretSafe() {
  const ledgerFile = path.join(ROOT, '.tmp-social-posts-test.csv');
  fs.rmSync(ledgerFile, { force: true });

  runNode([
    'scripts/social/daily-oracle-post.js',
    '--write',
    '--date=2026-05-27',
    '--platforms=threads,bluesky,instagram',
    '--kind=all',
  ], {
    env: {
      SOCIAL_POSTS_LEDGER_FILE: ledgerFile,
      THREADS_ACCESS_TOKEN: 'unit-test-threads-token',
      BLUESKY_APP_PASSWORD: 'unit-test-bluesky-password',
      INSTAGRAM_ACCESS_TOKEN: 'unit-test-instagram-token',
    },
  });

  const csv = fs.readFileSync(ledgerFile, 'utf8');
  const rows = csv.trim().split(/\r?\n/);
  assert.equal(rows.length, 13, 'ledger should contain header plus twelve draft rows');
  assert.match(rows[0], /post_key,date,kind,platform,status/, 'ledger header is missing expected columns');
  assert.match(csv, /utm_content=oracle_20260527/, 'oracle tracked URL is missing from ledger');
  assert.match(csv, /utm_content=empathy_20260527_card\d{2}/, 'empathy tracked URL is missing from ledger');
  assert.match(csv, /utm_content=difference_20260527_v\d{2}/, 'difference tracked URL is missing from ledger');
  assert.match(csv, /utm_content=freepaid_20260527_v\d{2}/, 'free_paid_compare tracked URL is missing from ledger');
  assert.doesNotMatch(csv, /unit-test-threads-token|unit-test-bluesky-password|unit-test-instagram-token/, 'ledger must not leak tokens');
  assert.doesNotMatch(csv, /今日の数秘オラクル|ルノルマンカード|無料版 \/ 有料版/, 'ledger should store hashes, URLs, and metadata, not full post copy');

  fs.rmSync(ledgerFile, { force: true });
}

function testRealPostingRequiresExplicitYesOutsideScheduler() {
  const ledgerFile = path.join(ROOT, '.tmp-social-posts-preview-test.csv');
  fs.rmSync(ledgerFile, { force: true });
  const result = runNode([
    'scripts/social/daily-oracle-post.js',
    '--post',
    '--date=2026-05-27',
    '--platforms=threads',
    '--kind=empathy',
  ], {
    expectSuccess: false,
    env: {
      SOCIAL_POSTS_LEDGER_FILE: ledgerFile,
      SOCIAL_AUTOMATED_POSTING_ENABLED: 'false',
      SOCIAL_SCHEDULED_RUN: 'false',
    },
  });

  assert.notEqual(result.status, 0, 'posting without --yes or scheduler context must fail');
  assert.match(result.stderr, /explicit yes|Type yes/, 'failure should explain the required yes confirmation');
  fs.rmSync(ledgerFile, { force: true });
}

function scheduleReport(nowIso, onlyKind = 'all') {
  const stateFile = path.join(ROOT, `.tmp-social-schedule-${onlyKind}-${nowIso.replace(/[^0-9]/g, '')}.json`);
  fs.rmSync(stateFile, { force: true });
  const result = runNode([
    'scripts/social/run-scheduled-posts.js',
    '--once',
    '--dry-run',
    `--only-kind=${onlyKind}`,
  ], {
    env: {
      SOCIAL_STATELESS_MODE: 'true',
      SOCIAL_NOW_ISO: nowIso,
      SOCIAL_SCHEDULE_STATE_FILE: stateFile,
    },
  });
  fs.rmSync(stateFile, { force: true });
  return JSON.parse(result.stdout);
}

function testScheduledPostsRespectJstWeekdays() {
  assert.deepEqual(scheduleReport('2026-05-27T03:01:00.000Z').due, ['empathy'], 'Wed 12:01 JST should post empathy');
  assert.deepEqual(scheduleReport('2026-05-29T03:01:00.000Z').due, [], 'Fri 12:01 JST should not post empathy after the optimized cadence');
  assert.deepEqual(scheduleReport('2026-06-02T03:01:00.000Z').due, ['empathy'], 'Tue 12:01 JST should post empathy');
  assert.deepEqual(scheduleReport('2026-06-04T03:01:00.000Z').due, ['empathy'], 'Thu 12:01 JST should post empathy');
  assert.deepEqual(scheduleReport('2026-06-02T10:01:00.000Z').due, ['difference'], 'Tue 19:01 JST should post difference');
  assert.deepEqual(scheduleReport('2026-06-04T10:01:00.000Z').due, ['free_paid_compare'], 'Thu 19:01 JST should post free_paid_compare');
  assert.deepEqual(scheduleReport('2026-05-30T10:01:00.000Z').due, [], 'Sat 19:01 JST should not post free_paid_compare');
}

function testKpiReviewTemplatePreservesManualMetrics() {
  const outFile = path.join(ROOT, '.tmp-social-kpi-review.csv');
  fs.rmSync(outFile, { force: true });
  runNode([
    'scripts/social/prepare-kpi-review.js',
    '--from=2026-06-02',
    '--to=2026-06-04',
    '--platforms=threads,bluesky,instagram',
    `--out=${path.basename(outFile)}`,
  ]);
  let csv = fs.readFileSync(outFile, 'utf8');
  assert.match(csv, /empathy_20260602_card\d{2}/, 'KPI template should include the Tuesday Lenormand lane');
  assert.match(csv, /empathy_20260604_card\d{2}/, 'KPI template should include the Thursday Lenormand lane');
  assert.match(csv, /paid_deep_reading_starts/, 'KPI template should include paid funnel columns');
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const repliesIndex = header.indexOf('replies');
  const rowIndex = lines.findIndex(line => /^2026-06-02:empathy:threads:/.test(line));
  assert.ok(rowIndex > 0, 'KPI template should contain the Threads empathy row');
  const cells = lines[rowIndex].split(',');
  cells[repliesIndex] = '12';
  lines[rowIndex] = cells.join(',');
  fs.writeFileSync(outFile, `${lines.join('\n')}\n`);
  runNode([
    'scripts/social/prepare-kpi-review.js',
    '--from=2026-06-02',
    '--to=2026-06-04',
    '--platforms=threads,bluesky,instagram',
    `--out=${path.basename(outFile)}`,
  ]);
  const preserved = fs.readFileSync(outFile, 'utf8');
  const preservedLines = preserved.trim().split(/\r?\n/);
  const preservedRow = preservedLines.find(line => /^2026-06-02:empathy:threads:/.test(line));
  assert.equal(preservedRow.split(',')[repliesIndex], '12', 'KPI template should preserve manually filled reply counts');
  fs.rmSync(outFile, { force: true });
}

function testStatelessScheduleCapsWideGraceWindow() {
  const report = scheduleReport('2026-05-18T23:05:00.000Z', 'oracle');
  assert.equal(report.date, '2026-05-19', 'schedule dry-run should use the JST date');
  assert.equal(report.graceMinutes, 2, 'stateless runs should cap the effective grace window');
  assert.equal(report.graceCappedForStateless, false, 'default stateless grace should already be narrow');
  assert.deepEqual(report.due, [], 'a 08:05 stateless repeat tick must not repost the 08:00 oracle');
  assert.deepEqual(report.expired, ['oracle'], 'the repeat tick should be treated as expired after the narrow window');
}

function testBroadSocialAuditPasses() {
  const result = runNode([
    'scripts/social/audit-social-drafts.js',
    '--from=2026-05-13',
    '--to=2026-06-30',
    '--platforms=threads,bluesky,x,instagram',
  ]);
  assert.match(result.stdout, /"errors": 0/, 'audit should report zero errors');
}

function testXDraftExportUsesRandomOracleAndFitsPostingLimit() {
  const outDir = path.join(ROOT, '.tmp-x-drafts-test');
  fs.rmSync(outDir, { recursive: true, force: true });
  const result = runNode([
    'scripts/social/export-x-drafts.js',
    '--date=2026-05-27',
    '--kind=oracle',
    `--out=${path.basename(outDir)}`,
  ], {
    env: {
      SOCIAL_ORACLE_CARD_MODE: 'random',
      SOCIAL_ORACLE_CARD_ID: '1',
    },
  });
  assert.match(result.stdout, /"status": "x_drafts_written"/, 'X draft export should write artifacts');
  const entry = JSON.parse(fs.readFileSync(path.join(outDir, '2026-05-27-oracle.json'), 'utf8'));
  assert.equal(entry.kind, 'oracle', 'exported X draft should be the oracle lane');
  assert.ok(entry.oracleCard.id >= 1 && entry.oracleCard.id <= 33, 'exported X draft should record an oracle card from 1 to 33');
  assert.ok(entry.characterCount <= 280, 'exported X draft should fit the 280 character posting limit');
  assert.ok(entry.text.startsWith('おはてけ🌸🦦'), 'exported X oracle draft should start with the friendly greeting');
  assert.match(entry.text, /今日の数秘オラクルは「[^」]+」🫶✨/, 'exported X oracle draft should use the friendly X title line');
  assert.match(entry.text, /今日の1枚はこちら！👇/, 'exported X oracle draft should use the requested CTA wording');
  fs.rmSync(outDir, { recursive: true, force: true });
}

function testXDraftDueWindowsCreateScheduledDrafts() {
  const outDir = path.join(ROOT, '.tmp-x-drafts-due-test');
  fs.rmSync(outDir, { recursive: true, force: true });
  const cases = [
    { kind: 'oracle', date: '2026-05-28', now: '2026-05-27T22:03:00.000Z' },
  ];
  for (const item of cases) {
    const result = runNode([
      'scripts/social/export-x-drafts.js',
      `--date=${item.date}`,
      '--kind=auto',
      '--due',
      `--out=${path.basename(outDir)}`,
    ], {
      env: {
        SOCIAL_ORACLE_CARD_MODE: 'random',
        SOCIAL_NOW_ISO: item.now,
      },
    });
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'x_drafts_written', `${item.kind} due run should write a draft`);
    assert.equal(report.entries.length, 1, `${item.kind} due run should write only the due lane`);
    assert.equal(report.entries[0].kind, item.kind, `${item.kind} due run should select the correct lane`);
    assert.ok(fs.existsSync(path.join(outDir, `${item.date}-${item.kind}.md`)), `${item.kind} markdown draft should exist`);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

function testXNextCardDraftExportCreatesOnlyAllowedFutureDrafts() {
  const outDir = path.join(ROOT, '.tmp-x-card-drafts-test');
  fs.rmSync(outDir, { recursive: true, force: true });
  const result = runNode([
    'scripts/social/export-x-next-card-drafts.js',
    `--out=${path.basename(outDir)}`,
  ], {
    env: {
      SOCIAL_NOW_ISO: '2026-06-01T00:00:00.000Z',
      SOCIAL_ORACLE_CARD_MODE: 'random',
    },
  });
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'x_card_drafts_written', 'next card X draft export should write artifacts');
  assert.equal(report.from, '2026-06-02', 'next card X draft export should start with tomorrow in JST');
  assert.equal(report.to, '2026-06-03', 'next card X draft export should include the day after tomorrow in JST');
  assert.equal(report.writtenCount, 2, 'fresh next card X draft export should write both missing drafts');
  assert.equal(report.reusedCount, 0, 'fresh next card X draft export should not reuse drafts');
  assert.deepEqual(
    report.entries.map(entry => `${entry.date}:${entry.kind}`).sort(),
    ['2026-06-02:oracle', '2026-06-03:oracle'],
    'next card X draft export should include only daily oracle drafts'
  );
  assert.deepEqual(new Set(report.blockedKinds), new Set(['empathy', 'question', 'difference', 'free_paid_compare', 'midday', 'concept']));
  for (const entry of report.entries) {
    assert.equal(entry.kind, 'oracle', `${entry.date} should not export non-oracle X draft kinds`);
    assert.equal(entry.action, 'written', `${entry.date} fresh X oracle draft should be written`);
    assert.ok(entry.characterCount <= 280, `${entry.date} ${entry.kind} should fit X`);
    assert.ok(fs.existsSync(path.join(ROOT, entry.files.md)), `${entry.date} ${entry.kind} markdown should exist`);
    assert.ok(fs.existsSync(entry.imagePath), `${entry.date} ${entry.kind} image should exist`);
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, entry.files.json), 'utf8'));
    assert.ok(json.text.startsWith('おはてけ🌸🦦'), `${entry.date} morning oracle should start with the morning greeting`);
    assert.match(json.text, /#おはようVtuber/, `${entry.date} morning oracle X draft should include #おはようVtuber`);
    assert.match(json.text, /今日の数秘オラクルは「[^」]+」🫶✨/, `${entry.date} morning oracle X draft should use the friendly X title line`);
    assert.match(json.text, /テーマは「[^」]+」！/, `${entry.date} morning oracle X draft should use the friendly theme line`);
    assert.match(json.text, /🔮✨/, `${entry.date} morning oracle X draft should use the requested oracle emoji cue`);
    assert.match(json.text, /今日の1枚はこちら！👇/, `${entry.date} morning oracle X draft should use the requested CTA wording`);
    assert.doesNotMatch(json.text, /ルノルマン|こんてけ/, `${entry.date} X oracle draft should not include Lenormand wording`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, report.files.md)), 'next card X draft report markdown should exist');
  fs.rmSync(outDir, { recursive: true, force: true });
}

function testXNextCardDraftExportKeepsExistingDateDrafts() {
  const outDir = path.join(ROOT, '.tmp-x-card-drafts-reuse-test');
  fs.rmSync(outDir, { recursive: true, force: true });
  const args = [
    'scripts/social/export-x-next-card-drafts.js',
    '--from=2026-06-02',
    '--to=2026-06-02',
    `--out=${path.basename(outDir)}`,
  ];
  const firstResult = runNode(args, {
    env: {
      SOCIAL_ORACLE_CARD_ID: '11',
      SOCIAL_ORACLE_CARD_MODE: 'random',
    },
  });
  const firstReport = JSON.parse(firstResult.stdout);
  assert.equal(firstReport.writtenCount, 1, 'first run should write the missing date draft');
  assert.equal(firstReport.reusedCount, 0, 'first run should not reuse a missing date draft');
  assert.equal(firstReport.entries[0].action, 'written', 'first run should mark the date as written');
  const jsonPath = path.join(outDir, '2026-06-02-oracle.json');
  const firstDraft = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  const secondResult = runNode(args, {
    env: {
      SOCIAL_ORACLE_CARD_ID: '18',
      SOCIAL_ORACLE_CARD_MODE: 'random',
    },
  });
  const secondReport = JSON.parse(secondResult.stdout);
  const secondDraft = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(secondReport.writtenCount, 0, 'second run should not rewrite an existing date draft');
  assert.equal(secondReport.reusedCount, 1, 'second run should reuse the existing date draft');
  assert.equal(secondReport.entries[0].action, 'reused_existing', 'second run should mark the date as reused');
  assert.equal(secondDraft.oracleCard.id, firstDraft.oracleCard.id, 'existing date draft should keep the original card');
  assert.equal(secondDraft.text, firstDraft.text, 'existing date draft should keep the original text');
  fs.rmSync(outDir, { recursive: true, force: true });
}

function testXSocialDraftWorkflowCreatesVisibleDrafts() {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'x-social-drafts.yml'), 'utf8');
  assert.match(workflow, /cron: '3 22 \* \* \*'/, 'X draft workflow should run at the JST morning slot');
  assert.doesNotMatch(workflow, /cron: '3 3 \* \* 1,3,5'|cron: '3 3 \* \* 2,4'|cron: '3 11 \* \* 2'|cron: '3 11 \* \* 6'/, 'X draft workflow should not schedule non-oracle slots');
  assert.match(workflow, /default: 'oracle'/, 'manual X draft dispatch should default to the oracle draft');
  assert.match(workflow, /"3 22 \* \* \*"\) kind="oracle"/, 'morning schedule should explicitly export the oracle draft');
  assert.doesNotMatch(workflow, /kind="empathy"|kind="question"|kind="difference"|kind="free_paid_compare"|-\s+empathy|-\s+question|-\s+difference|-\s+free_paid_compare/, 'X draft workflow should not expose non-oracle drafts');
  assert.match(workflow, /\$status" != "x_drafts_written"/, 'empty X draft runs should not pass as success');
}

function testXWebDraftWorkflowUsesPlaywrightAndSecrets() {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'x-social-drafts.yml'), 'utf8');
  const webDraftScript = fs.readFileSync(path.join(ROOT, 'scripts', 'social', 'save-x-web-draft.js'), 'utf8');
  const captureScript = fs.readFileSync(path.join(ROOT, 'scripts', 'social', 'capture-x-auth-state.js'), 'utf8');
  assert.match(workflow, /X_AUTH_STORAGE_BASE64: \$\{\{ secrets\.X_AUTH_STORAGE_BASE64 \}\}/, 'workflow should use an encrypted X browser session secret');
  assert.match(workflow, /npx playwright install --with-deps chromium/, 'workflow should install Chromium for Playwright');
  assert.match(workflow, /node scripts\/social\/save-x-web-draft\.js/, 'workflow should save a real X Web draft, not only an artifact');
  assert.match(webDraftScript, /https:\/\/x\.com\/compose\/post/, 'web draft script should open the X compose UI');
  assert.match(webDraftScript, /SOCIAL_POST_KINDS = \['oracle'\]/, 'web draft script should only allow oracle X drafts');
  assert.match(webDraftScript, /Save draft prompt|下書き/, 'web draft script should close the compose box through the draft save UI');
  assert.match(webDraftScript, /CreateTweet\|\\\/2\\\/tweets\|statuses\\\/update/, 'web draft script should block accidental post requests');
  assert.match(captureScript, /storageState/, 'auth capture script should export Playwright storage state');
}

testDraftHasTrackingImagesAndAlt();
testPlatformHashtagPolicy();
testAutomationDocsEnableBlueskyWithThreadsAndInstagram();
testWorkflowPostingPlatformsMatchProductionLane();
testMorningOracleCopyStillKeepsRequiredClosing();
testOracleDailyCopyIsGroundedInAllCardReadings();
testLenormandOneCardCopyDataQuality();
testEmpathyUsesRandomLenormandRotation();
testDifferenceAndFreePaidCompareAxes();
testPostsLedgerWriteIsTraceableAndSecretSafe();
testRealPostingRequiresExplicitYesOutsideScheduler();
testScheduledPostsRespectJstWeekdays();
testStatelessScheduleCapsWideGraceWindow();
testBroadSocialAuditPasses();
testKpiReviewTemplatePreservesManualMetrics();
testXDraftExportUsesRandomOracleAndFitsPostingLimit();
testXDraftDueWindowsCreateScheduledDrafts();
testXNextCardDraftExportCreatesOnlyAllowedFutureDrafts();
testXNextCardDraftExportKeepsExistingDateDrafts();
testXSocialDraftWorkflowCreatesVisibleDrafts();
testXWebDraftWorkflowUsesPlaywrightAndSecrets();

console.log('social-posting tests passed');
