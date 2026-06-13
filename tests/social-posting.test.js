const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const ACTIVE_KINDS = ['oracle'];
const THREADS_MATCHED_PLATFORM_KINDS = ['oracle'];
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
  const kind = options.kind || 'all';
  const platforms = options.platforms || 'threads,instagram';
  const extraArgs = [
    ...(options.birthdayDays ? [`--birthday-days=${options.birthdayDays}`] : []),
    ...(options.birthdayRankingSlug ? [`--birthday-ranking-slug=${options.birthdayRankingSlug}`] : []),
  ];
  const result = runNode([
    'scripts/social/daily-oracle-post.js',
    '--dry-run',
    `--date=${date}`,
    `--platforms=${platforms}`,
    `--kind=${kind}`,
    ...extraArgs,
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
    .replace(/utm_source=(threads|instagram)/g, 'utm_source=<platform>');
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
    assertTracked(draft[kind].instagramText, draft[kind].instagramTrackedUrl, `instagram ${kind}`, {
      visibleUrl: false,
      profileLink: true,
    });
    assertImageAndAlt(draft[kind].imagePath, draft[kind].altText, `threads ${kind}`);
    assertImageAndAlt(draft[kind].instagramImagePath, draft[kind].altText, `instagram ${kind}`);
    assert.match(draft[kind].instagramImageUrl, /\.jpg$/i, `${kind} Instagram image must be JPEG`);
    if (kind === 'oracle') {
      assert.match(draft[kind].imagePath, /images[\\/]social[\\/]instagram[\\/]oracle[\\/]\d{2}\.jpg$/, 'oracle Threads should use the text-added generated image');
      assert.match(draft[kind].imageUrl, /\/images\/social\/instagram\/oracle\/\d{2}\.jpg$/, 'oracle Threads URL should use the generated image');
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]oracle[\\/]\d{2}\.jpg$/, 'oracle Instagram should use the text-added generated image');
      assert.match(draft[kind].instagramImageUrl, /\/images\/social\/instagram\/oracle\/\d{2}\.jpg$/, 'oracle Instagram URL should use the generated image');
    } else if (kind === 'birthday_monthly') {
      assert.match(draft[kind].imagePath, /images[\\/]social[\\/]instagram[\\/]generated-birthday[\\/]2026-06[\\/]monthly[\\/]\d{2}-\d{2}[\\/]\d{2}-birth-\d{2}\.jpg$/, 'birthday_monthly Threads should use the generated birthday image');
      assert.match(draft[kind].imageUrl, /\/images\/social\/instagram\/generated-birthday\/2026-06\/monthly\/\d{2}-\d{2}\/\d{2}-birth-\d{2}\.jpg$/, 'birthday_monthly Threads URL should use the generated birthday image');
      assert.match(draft[kind].instagramImagePath, /images[\\/]social[\\/]instagram[\\/]generated-birthday[\\/]2026-06[\\/]monthly[\\/]\d{2}-\d{2}[\\/]\d{2}-birth-\d{2}\.jpg$/, 'birthday_monthly Instagram should use the generated birthday image');
      assert.match(draft[kind].instagramImageUrl, /\/images\/social\/instagram\/generated-birthday\/2026-06\/monthly\/\d{2}-\d{2}\/\d{2}-birth-\d{2}\.jpg$/, 'birthday_monthly Instagram URL should use the generated birthday image');
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
  const instagramKindTags = {
    oracle: ['#おはようvtuber', '#今日の占い', '#オラクルカード'],
    birthday_monthly: ['#ルノルマンカード', '#カード占い'],
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

function testAutomationDocsUseThreadsInstagramProductionLane() {
  const expectedPlatforms = 'SOCIAL_PLATFORMS=threads,instagram';
  for (const relativeFile of ['.env.example', '.env.example.txt', path.join('docs', 'sns-runbook.md'), path.join('scripts', 'social', 'README.md')]) {
    const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
    assert.match(source, new RegExp(expectedPlatforms), `${relativeFile} should configure Threads and Instagram as the production lane`);
    assert.doesNotMatch(source, /SOCIAL_PLATFORMS=threads,bluesky,instagram/, `${relativeFile} should not keep Bluesky in the default production lane`);
  }
  const absoluteRules = fs.readFileSync(path.join(ROOT, 'docs', 'sns-posting-absolute-rules.md'), 'utf8');
  const agentRules = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  const runbook = fs.readFileSync(path.join(ROOT, 'docs', 'sns-runbook.md'), 'utf8');
  assert.match(absoluteRules, /## 投稿前承認ゲート/, 'absolute SNS rules should require a posting approval gate');
  assert.match(absoluteRules, /## 絶対停止条件/, 'absolute SNS rules should define hard stop conditions');
  assert.match(absoluteRules, /#誕生日占い[\s\S]*#数秘/, 'absolute SNS rules should preserve birthday Instagram required tags');
  assert.match(agentRules, /docs\/sns-posting-absolute-rules\.md/, 'AGENTS.md should force SNS workers to read the absolute rules first');
  assert.match(runbook, /docs\/sns-posting-absolute-rules\.md/, 'runbook should point to the absolute SNS rules before operational steps');
  assert.doesNotMatch(runbook, /Bluesky|BLUESKY/, 'runbook should not keep Bluesky operation notes');
  assert.doesNotMatch(runbook, /X下書き|social:x:/, 'runbook should not keep X draft operation notes');
}

function testWorkflowPostingPlatformsMatchProductionLane() {
  for (const relativeFile of [path.join('.github', 'workflows', 'sns-automation.yml'), path.join('.github', 'workflows', 'threads-social.yml')]) {
    const source = fs.readFileSync(path.join(ROOT, relativeFile), 'utf8');
    assert.match(source, /SOCIAL_PLATFORMS:\s*threads,instagram/, `${relativeFile} should post to Threads and Instagram together`);
    assert.doesNotMatch(source, /BLUESKY_APP_PASSWORD/, `${relativeFile} should not require Bluesky credentials`);
    assert.match(source, /INSTAGRAM_ACCESS_TOKEN/, `${relativeFile} should require Instagram credentials`);
    assert.match(source, /npm run instagram:doctor/, `${relativeFile} should verify Instagram before posting`);
    assert.doesNotMatch(source, /npm run bluesky:doctor/, `${relativeFile} should not verify Bluesky before posting`);
    assert.doesNotMatch(source, /threads,bluesky,instagram/, `${relativeFile} should not keep Bluesky in the production platforms`);
    assert.doesNotMatch(source, /SOCIAL_PLATFORMS:\s*threads\s*$/m, `${relativeFile} should not keep a Threads-only posting lane`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, '.github', 'workflows', 'x-social-drafts.yml')), 'X draft workflow should be removed');
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
  for (const dateKey of scheduledDates('2026-05-27', [0, 1, 3, 5, 6], 36)) {
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

function testBirthdayMonthlyUsesGeneratedSlides() {
  const first = parseDraft('2026-06-05', { kind: 'birthday_monthly', platforms: 'instagram' }).birthday_monthly;
  assert.equal(first.content.day, 1, '2026-06-05 should start with the 1st birthday slide');
  assert.match(first.text, /1日生まれ/, 'birthday_monthly text should show the target birthday');
  assert.match(first.instagramText, /^\\無料占いはプロフィールURLから\//, 'birthday_monthly Instagram copy should use the approved short profile hook');
  assert.match(first.instagramText, /🌸自分の誕生日を画像でチェック/, 'birthday_monthly Instagram copy should use the approved flower line');
  assert.match(first.instagramText, /#誕生日占い/, 'birthday_monthly Instagram copy should include #誕生日占い');
  assert.match(first.instagramText, /#数秘/, 'birthday_monthly Instagram copy should include #数秘');
  assert.doesNotMatch(first.instagramText, /保存しておいてください|羅針占術の鑑定へ/, 'birthday_monthly Instagram copy should not use the rejected long CTA');
  assert.match(first.trackedUrl, /utm_content=birthdaymonthly_20260605_birth01/, 'birthday_monthly tracked URL should include birthday day');
  assert.match(first.imagePath, /images[\\/]social[\\/]instagram[\\/]誕生日数×ルノルマン[\\/]2026-06[\\/]monthly[\\/]01-10[\\/]01-birth-01\.jpg$/, 'birthday_monthly should use day 1 generated slide from the current monthly folder');

  const next = parseDraft('2026-06-06', { kind: 'birthday_monthly', platforms: 'instagram' }).birthday_monthly;
  assert.equal(next.content.day, 2, '2026-06-06 should use the 2nd birthday slide');
  assert.match(next.trackedUrl, /utm_content=birthdaymonthly_20260606_birth02/, 'birthday_monthly should advance daily');

  const group = parseDraft('2026-06-05', { kind: 'birthday_monthly', platforms: 'instagram', birthdayDays: '1-8' }).birthday_monthly;
  assert.deepEqual(group.content.days, [1, 2, 3, 4, 5, 6, 7, 8], '20:00 birthday monthly group should cover days 1-8');
  assert.equal(group.imagePaths.length, 9, '20:00 birthday monthly group should publish cover plus eight birthday slides');
  assert.equal(group.instagramImageUrls.length, 9, 'Instagram birthday monthly group should publish cover plus eight birthday slides');
  assert.equal(group.altTexts.length, 9, 'birthday monthly group should provide alt text for the cover and every slide');
  assert.match(group.text, /1-8日生まれの6月運勢/, 'birthday monthly group text should show the target day range');
  assert.match(group.instagramText, /🦦周りの人の誕生日も見てみて/, 'birthday monthly group should use the approved otter line');
  assert.match(group.trackedUrl, /utm_content=birthdaymonthly_20260605_birth01_08/, 'birthday monthly group UTM should include the day range');
  assert.match(group.imagePath, /images[\\/]social[\\/]instagram[\\/]誕生日数×ルノルマン[\\/]2026-06[\\/]monthly[\\/]cover-01-08\.jpg$/, 'birthday monthly group should use the approved cover as the first image');
  assert.match(group.imagePaths[0], /images[\\/]social[\\/]instagram[\\/]誕生日数×ルノルマン[\\/]2026-06[\\/]monthly[\\/]cover-01-08\.jpg$/, 'birthday monthly carousel should start with the matching cover');
  assert.match(group.imagePaths[1], /images[\\/]social[\\/]instagram[\\/]誕生日数×ルノルマン[\\/]2026-06[\\/]monthly[\\/]01-10[\\/]01-birth-01\.jpg$/, 'birthday monthly group should place day 1 after the cover');
  assert.match(group.imagePaths[8], /images[\\/]social[\\/]instagram[\\/]誕生日数×ルノルマン[\\/]2026-06[\\/]monthly[\\/]01-10[\\/]08-birth-08\.jpg$/, 'birthday monthly group should end with day 8');

  assert.throws(
    () => parseDraft('2026-06-05', { kind: 'birthday_monthly', platforms: 'instagram', birthdayDays: '1-10' }),
    /10 or fewer media items including the cover/,
    '1-10 must never be generated with a cover because it exceeds the 10-media limit',
  );

  const recoveryBlock = parseDraft('2026-06-06', { kind: 'birthday_monthly', platforms: 'instagram', birthdayDays: '17-24' }).birthday_monthly;
  assert.deepEqual(recoveryBlock.content.days, [17, 18, 19, 20, 21, 22, 23, 24], 'birthday monthly should split 17-24 into a cover plus eight-slide carousel');
  assert.equal(recoveryBlock.instagramImageUrls.length, 9, '17-24 recovery should stay within the Instagram carousel limit');
  assert.match(recoveryBlock.trackedUrl, /utm_content=birthdaymonthly_20260606_birth17_24/, '17-24 recovery UTM should include the split day range');
  assert.match(recoveryBlock.imagePaths[0], /images[\\/]social[\\/]instagram[\\/]誕生日数×ルノルマン[\\/]2026-06[\\/]monthly[\\/]cover-17-24\.jpg$/, '17-24 should use the matching recreated cover');

  const finalBlock = parseDraft('2026-06-06', { kind: 'birthday_monthly', platforms: 'instagram', birthdayDays: '25-31' }).birthday_monthly;
  assert.deepEqual(finalBlock.content.days, [25, 26, 27, 28, 29, 30, 31], 'birthday monthly should publish 25-31 as the final cover carousel');
  assert.equal(finalBlock.instagramImageUrls.length, 8, '25-31 recovery should use one cover plus seven birthday slides');
  assert.match(finalBlock.trackedUrl, /utm_content=birthdaymonthly_20260606_birth25_31/, '25-31 recovery UTM should include the range');
  assert.match(finalBlock.imagePaths[0], /images[\\/]social[\\/]instagram[\\/]誕生日数×ルノルマン[\\/]2026-06[\\/]monthly[\\/]cover-25-31\.jpg$/, '25-31 should use the matching recreated cover');
  assert.match(finalBlock.imagePaths[7], /images[\\/]social[\\/]instagram[\\/]誕生日数×ルノルマン[\\/]2026-06[\\/]monthly[\\/]21-31[\\/]31-birth-31\.jpg$/, '25-31 should end with day 31 from the approved monthly folder');
}
function testRashinPointOneOffCarouselDraft() {
  const draft = parseDraft('2026-06-04', { kind: 'rashin_point', platforms: 'threads,instagram' });
  const entry = draft.rashin_point;
  assert.ok(entry, 'rashin_point draft should be generated when explicitly requested');
  assert.deepEqual(
    entry.imagePaths.map(file => path.basename(file)),
    ['difference.jpg', 'rashin_point.jpg', 'free-paid-compare.jpg'],
    'rashin_point should publish the three trust carousel slides in the intended order'
  );
  assert.deepEqual(
    entry.instagramImageUrls.map(url => url.split('/').pop()),
    ['difference.jpg', 'rashin_point.jpg', 'free-paid-compare.jpg'],
    'rashin_point Instagram carousel should use public image URLs for all three slides'
  );
  assert.match(entry.text, /AI占いで物足りなかった人へ/, 'rashin_point Threads copy should start with the trust hook');
  assert.match(entry.text, /#占い師$/, 'rashin_point Threads copy should end with #占い師');
  assert.equal(countHashtags(entry.text), 1, 'rashin_point Threads copy should use exactly one hashtag');
  assert.doesNotMatch(entry.text, /#羅針占術|#占い師のつぶやき/, 'rashin_point Threads copy should not use extra Threads hashtags');
  assert.match(entry.instagramText, /プロフィールのリンクから/, 'rashin_point Instagram copy should point to the profile link');
  assert.match(entry.instagramText, /#羅針占術/, 'rashin_point Instagram copy should include the brand hashtag');
  assert.equal(countHashtags(entry.instagramText), 5, 'rashin_point Instagram copy should use five focused hashtags');
  assert.match(entry.trackedUrl, /utm_content=rashinpoint_20260604/, 'rashin_point Threads URL should use one-off UTM content');
  assert.match(entry.instagramTrackedUrl, /utm_source=instagram/, 'rashin_point Instagram URL should use Instagram UTM source');
}

function testBirthdayRankingInstagramDrafts() {
  const expected = [
    ['2026-06-08', 'love-at-first-sight-top5.jpg', '一目惚れしやすい生まれ日TOP5', 'love_at_first_sight'],
    ['2026-06-08', 'money-luck-top5.jpg', '金運が強い生まれ日TOP5', 'money_luck'],
    ['2026-06-08', 'horror-resistance-top5.jpg', 'ホラー耐性のある生まれ日TOP5', 'horror_resistance'],
    ['2026-06-08', 'weird-top5.jpg', '変人に見られやすい生まれ日TOP5', 'weird'],
    ['2026-06-09', 'idol-style-4class.jpg', 'アイドルになったら大体こんな感じ', 'idol_style'],
    ['2026-06-09', 'love-style-4class.jpg', '恋愛スタイル4分類', 'love_style'],
    ['2026-06-09', 'amae-jouzu-top5.jpg', '甘え上手ランキングtop5', 'amae_jouzu'],
    ['2026-06-09', 'buchigire-kowai-top5.jpg', 'ブチギレると怖い生まれ日TOP5はこちらです。', 'buchigire_kowai'],
  ];
  for (const [date, imageName, title, slug] of expected) {
    const entry = parseDraft(date, { kind: 'birthday_ranking', platforms: 'threads,instagram', birthdayRankingSlug: slug }).birthday_ranking;
    assert.ok(entry, `${date} birthday_ranking draft should be generated`);
    assert.equal(entry.content.title, title, `${date} birthday_ranking should use the intended title`);
    assert.match(entry.instagramImagePath, new RegExp(`images[\\\\/]social[\\\\/]instagram[\\\\/]【インスタ】あるある・ランキング系[\\\\/]${imageName}$`), `${date} birthday_ranking should use the intended image`);
    assert.equal(entry.imageUrls.length, 1, `${date} birthday_ranking should use only the approved ranking image`);
    assert.equal(entry.instagramImageUrls.length, 1, `${date} Instagram birthday_ranking should use only the approved ranking image`);
    assert.match(entry.imagePaths[0], new RegExp(`images[\\\\/]social[\\\\/]instagram[\\\\/]【インスタ】あるある・ランキング系[\\\\/]${imageName}$`), `${date} media should stay inside the approved ranking folder`);
    assert.doesNotMatch(entry.imagePaths.join('\n'), /videos[\\/]/, `${date} birthday_ranking must not use the videos folder`);
    assert.match(entry.instagramText, new RegExp(title), `${date} Instagram copy should include the ranking title`);
    assert.match(entry.instagramText, /^\\無料占いはプロフィールURLから\//, `${date} Instagram copy should use the short profile URL hook`);
    assert.match(entry.text, /^\\無料占いはプロフィールURLから\//, `${date} Threads copy should use the same profile URL hook`);
    assert.match(entry.text, new RegExp(title), `${date} Threads copy should include the ranking title`);
    assert.match(entry.text, /#占い師のつぶやき/, `${date} Threads copy should use the Threads hashtag`);
    assert.doesNotMatch(entry.text, /#誕生日占い|#数秘/, `${date} Threads copy should not use Instagram hashtags`);
    assert.equal(
      entry.text.replace(/#占い師のつぶやき/g, '#<tags>'),
      entry.instagramText.replace(/#羅針占術 #誕生日占い #数秘 #誕生日数 #占い好きな人と繋がりたい/g, '#<tags>'),
      `${date} Threads and Instagram copy should differ only by hashtag line`
    );
    assert.match(entry.instagramText, /当てはまったら保存/, `${date} Instagram copy should ask for saves`);
    assert.match(entry.instagramText, /🌸当てはまったら保存/, `${date} Instagram copy should use the flower save icon`);
    assert.match(entry.instagramText, /🦦周りの人の誕生日も見てみて/, `${date} Instagram copy should use the otter birthday check icon`);
    assert.match(entry.instagramText, /何日生まれかコメントで教えてね/, `${date} Instagram copy should invite comments`);
    assert.match(entry.instagramText, /🪭何日生まれかコメントで教えてね/, `${date} Instagram copy should use the fan comment icon`);
    assert.match(entry.instagramText, /#誕生日占い/, `${date} Instagram copy should include #誕生日占い`);
    assert.match(entry.instagramText, /#数秘/, `${date} Instagram copy should include #数秘`);
    assert.equal(countHashtags(entry.instagramText), 5, `${date} Instagram copy should use five focused hashtags`);
    assert.match(entry.instagramTrackedUrl, new RegExp(`utm_content=birthdayranking_${date.replace(/-/g, '')}_${slug}`), `${date} birthday_ranking should use date and slug UTM content`);
  }
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
    '--platforms=threads,instagram',
    '--kind=all',
  ], {
    env: {
      SOCIAL_POSTS_LEDGER_FILE: ledgerFile,
      THREADS_ACCESS_TOKEN: 'unit-test-threads-token',
      INSTAGRAM_ACCESS_TOKEN: 'unit-test-instagram-token',
    },
  });

  const csv = fs.readFileSync(ledgerFile, 'utf8');
  const rows = csv.trim().split(/\r?\n/);
  assert.equal(rows.length, 3, 'ledger should contain header plus two active oracle draft rows');
  assert.match(rows[0], /post_key,date,kind,platform,status/, 'ledger header is missing expected columns');
  assert.match(csv, /utm_content=oracle_20260527/, 'oracle tracked URL is missing from ledger');
  assert.doesNotMatch(csv, /utm_content=birthdaymonthly_20260527_birth\d{2}|utm_content=empathy_20260527_card\d{2}|utm_content=difference_20260527_v\d{2}|utm_content=freepaid_20260527_v\d{2}/, 'manual/held lanes should not be recorded by --kind=all');
  assert.doesNotMatch(csv, /unit-test-threads-token|unit-test-instagram-token/, 'ledger must not leak tokens');
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
  assert.deepEqual(scheduleReport('2026-06-13T11:01:00.000Z').due, [], '20:01 JST should not publish a scheduled image post');
  assert.deepEqual(scheduleReport('2026-06-13T12:01:00.000Z').due, [], '21:01 JST should not publish a scheduled image post');
  assert.deepEqual(scheduleReport('2026-06-13T13:01:00.000Z').due, [], '22:01 JST should not publish a scheduled image post');
  assert.deepEqual(scheduleReport('2026-06-13T14:01:00.000Z').due, [], '23:01 JST should not publish a scheduled image post');
  assert.deepEqual(scheduleReport('2026-06-13T23:01:00.000Z').due, ['oracle'], '08:01 JST should still publish the morning oracle');

  const oldNightKind = runNode([
    'scripts/social/run-scheduled-posts.js',
    '--once',
    '--dry-run',
    '--only-kind=birthday_monthly',
  ], { expectSuccess: false });
  assert.notEqual(oldNightKind.status, 0, 'birthday_monthly should no longer be accepted by scheduled image posting');
  assert.match(oldNightKind.stderr, /Invalid --only-kind: birthday_monthly/, 'old night image kinds should be rejected by the scheduler');
}

function testKpiReviewTemplatePreservesManualMetrics() {
  const outFile = path.join(ROOT, '.tmp-social-kpi-review.csv');
  fs.rmSync(outFile, { force: true });
  runNode([
    'scripts/social/prepare-kpi-review.js',
    '--from=2026-06-01',
    '--to=2026-06-11',
    '--platforms=threads,instagram',
    `--out=${path.basename(outFile)}`,
  ]);
  let csv = fs.readFileSync(outFile, 'utf8');
  assert.match(csv, /utm_content=oracle_20260601/, 'KPI template should include the daily oracle lane');
  assert.match(csv, /utm_content=rashinpoint_20260604/, 'KPI template should include the one-off trust carousel lane');
  assert.match(csv, /utm_content=birthdaymonthly_20260605_birth01_08/, 'KPI template should include the 20:00 birthday monthly carousel lane');
  assert.match(csv, /utm_content=birthdaymonthly_20260605_birth09_16/, 'KPI template should include the 21:00 birthday monthly carousel lane');
  assert.match(csv, /utm_content=birthdaymonthly_20260605_birth17_24/, 'KPI template should include the 22:00 birthday monthly carousel lane');
  assert.match(csv, /utm_content=birthdaymonthly_20260605_birth25_31/, 'KPI template should include the 23:00 birthday monthly carousel lane');
  assert.match(csv, /utm_content=birthdaymonthly_20260607_birth17_24/, 'KPI template should include the 2026-06-07 22:00 birthday monthly recovery split');
  assert.match(csv, /utm_content=birthdaymonthly_20260607_birth25_31/, 'KPI template should include the 2026-06-07 23:00 birthday monthly recovery split');
  assert.match(csv, /utm_content=birthdayranking_20260608_love_at_first_sight/, 'KPI template should include the 2026-06-08 birthday ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260608_money_luck/, 'KPI template should include the 2026-06-08 21:00 birthday ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260608_horror_resistance/, 'KPI template should include the 2026-06-08 22:00 birthday ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260608_weird/, 'KPI template should include the 2026-06-08 23:00 birthday ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260609_idol_style/, 'KPI template should include the 2026-06-09 20:00 idol ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260609_love_style/, 'KPI template should include the 2026-06-09 21:00 love style ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260609_amae_jouzu/, 'KPI template should include the 2026-06-09 22:00 amae ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260609_buchigire_kowai/, 'KPI template should include the 2026-06-09 23:00 anger ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260610_akisho_level/, 'KPI template should include the 2026-06-10 20:00 akisho ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260610_majime/, 'KPI template should include the 2026-06-10 21:00 majime ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260610_uwaki_rate/, 'KPI template should include the 2026-06-10 22:00 uwaki ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260610_nenimotsu_wasureru/, 'KPI template should include the 2026-06-10 23:00 nenimotsu ranking lane');
  assert.match(csv, /utm_content=birthdayranking_20260611_chuunibyou/, 'KPI template should include the 2026-06-11 21:00 chuunibyou ranking lane');
  assert.doesNotMatch(csv, /empathy_20260601_card\d{2}|difference_20260602_v\d{2}|freepaid_20260604_v\d{2}/, 'KPI template should not include held manual/comparison lanes');
  assert.match(csv, /paid_deep_reading_starts/, 'KPI template should include paid funnel columns');
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  const repliesIndex = header.indexOf('replies');
  const rowIndex = lines.findIndex(line => /^2026-06-03:oracle:threads:/.test(line));
  assert.ok(rowIndex > 0, 'KPI template should contain the Threads oracle row');
  const cells = lines[rowIndex].split(',');
  cells[repliesIndex] = '12';
  lines[rowIndex] = cells.join(',');
  fs.writeFileSync(outFile, `${lines.join('\n')}\n`);
  runNode([
    'scripts/social/prepare-kpi-review.js',
    '--from=2026-06-01',
    '--to=2026-06-11',
    '--platforms=threads,instagram',
    `--out=${path.basename(outFile)}`,
  ]);
  const preserved = fs.readFileSync(outFile, 'utf8');
  const preservedLines = preserved.trim().split(/\r?\n/);
  const preservedRow = preservedLines.find(line => /^2026-06-03:oracle:threads:/.test(line));
  assert.equal(preservedRow.split(',')[repliesIndex], '12', 'KPI template should preserve manually filled reply counts');
  fs.rmSync(outFile, { force: true });
}

function testStatelessScheduleKeepsRecoveryGraceWindow() {
  const delayed = scheduleReport('2026-05-18T23:05:00.000Z', 'oracle');
  assert.equal(delayed.date, '2026-05-19', 'schedule dry-run should use the JST date');
  assert.equal(delayed.graceMinutes, 59, 'stateless runs should keep enough grace for delayed schedulers');
  assert.equal(delayed.graceCappedForStateless, false, 'default stateless grace should not be capped below the recovery window');
  assert.deepEqual(delayed.due, ['oracle'], 'an 08:05 delayed scheduler tick must still post the 08:00 oracle');

  const expired = scheduleReport('2026-05-19T00:05:00.000Z', 'oracle');
  assert.deepEqual(expired.due, [], 'a 09:05 scheduler tick should not post the 08:00 oracle');
  assert.deepEqual(expired.expired, ['oracle'], 'the 08:00 oracle should expire after the recovery window');
}

function reelScheduleReport(iso, env = {}) {
  const result = runNode(['scripts/social/post-daily-birthday-reels.js', '--dry-run', '--platforms=threads,instagram'], {
    env: {
      SOCIAL_NOW_ISO: iso,
      SOCIAL_REEL_PUBLIC_ORIGIN: 'https://raw.githubusercontent.com/tekechannnel-max/rashin_senjutsu/main',
      ...env,
    },
  });
  return JSON.parse(result.stdout);
}

function dueReelIds(report) {
  return report.reels.filter(reel => reel.due).map(reel => reel.id);
}

function cloudScheduleReport(iso, env = {}) {
  const result = runNode(['scripts/social/run-cloud-scheduled-posts.js', '--dry-run'], {
    env: {
      SOCIAL_NOW_ISO: iso,
      SOCIAL_REEL_PUBLIC_ORIGIN: 'https://raw.githubusercontent.com/tekechannnel-max/rashin_senjutsu/main',
      ...env,
    },
  });
  return JSON.parse(result.stdout);
}

function testWorkflowHasScheduledPostingBackup() {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'threads-social.yml'), 'utf8');
  const instagramReelsBackupWorkflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'instagram-reels-backup.yml'), 'utf8');
  const imageBackupWorkflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'sns-image-backup.yml'), 'utf8');
  const automationWorkflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'sns-automation.yml'), 'utf8');
  const packageJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  const runbook = fs.readFileSync(path.join(ROOT, 'docs', 'sns-runbook.md'), 'utf8');
  const scriptsReadme = fs.readFileSync(path.join(ROOT, 'scripts', 'social', 'README.md'), 'utf8');
  assert.match(workflow, /cron: '5,20,35,50 23,11,12,13,14 \* \* \*'/, 'Threads workflow should run off-hour retries for 08:00, 20:00-22:00, and 23:00 recovery');
  assert.match(instagramReelsBackupWorkflow, /cron: '7,17,27,37,47,57 11,12,13,14 \* \* \*'/, 'Reels backup should run frequent off-hour retry and recovery ticks');
  assert.match(workflow, /SOCIAL_ORACLE_TIME: '08:00'/, 'Threads workflow should use the 08:00 JST oracle time');
  assert.match(workflow, /SOCIAL_CLOUD_SCHEDULER: 'true'/, 'Threads workflow should mark cloud scheduled runs explicitly');
  assert.match(instagramReelsBackupWorkflow, /SOCIAL_CLOUD_SCHEDULER: 'true'/, 'Reels backup should mark cloud scheduled runs explicitly');
  assert.doesNotMatch(workflow, /birthday_monthly_recovery_25_31/, 'workflow dispatch should not expose old 23:00 birthday monthly image slots');
  assert.match(workflow, /github\.event_name \}\}" = "push"[\s\S]*echo "ready=false"[\s\S]*exit 0/, 'Threads workflow push validation should not fail only because posting secrets are unavailable');
  assert.match(automationWorkflow, /github\.event_name \}\}" = "push"[\s\S]*echo "ready=false"[\s\S]*exit 0/, 'SNS automation push validation should not fail only because posting secrets are unavailable');
  assert.match(workflow, /if: steps\.secrets\.outputs\.ready == 'true' && github\.event_name != 'push'/, 'workflow push events should validate without publishing due posts');
  assert.match(automationWorkflow, /if: steps\.secrets\.outputs\.ready == 'true' && github\.event_name != 'push'/, 'automation workflow push events should validate without publishing due posts');
  assert.match(workflow, /SOCIAL_POST_GRACE_MINUTES: '59'/, 'workflow should allow delayed scheduled runs to recover within the hour');
  assert.match(workflow, /SOCIAL_REEL_CATCHUP_HOURS: '8'/, 'Threads workflow should let a later run recover missed same-night reels');
  assert.match(workflow, /post-daily-birthday-reels\.js --post --platforms=threads,instagram/, 'Threads workflow should publish daily reels to both Threads and Instagram');
  assert.match(workflow, /only-kind=oracle/, 'scheduled SNS image step should only allow the morning oracle lane');
  assert.match(automationWorkflow, /npm run social:cloud-run-due/, 'SNS automation should use the combined cloud due runner');
  assert.match(packageJson, /"social:cloud-run-due": "node scripts\/social\/run-cloud-scheduled-posts\.js"/, 'package scripts should expose the combined cloud runner');
  assert.match(packageJson, /"social:run-due": "node scripts\/social\/run-cloud-scheduled-posts\.js"/, 'legacy Render run-due command should use the combined cloud runner');
  assert.match(runbook, /Render Cron Job `rashin-threads-scheduler` のコマンドが `npm run social:run-due`/, 'runbook should make the combined runner the Render cron command');
  assert.match(scriptsReadme, /npm run social:run-due/, 'social README should document the combined cloud runner');
  assert.match(instagramReelsBackupWorkflow, /SOCIAL_REEL_CATCHUP_HOURS: '8'/, 'Reels backup workflow should recover missed same-night reels');
  assert.match(instagramReelsBackupWorkflow, /THREADS_ACCESS_TOKEN/, 'Reels backup workflow should also validate and post Threads videos');
  assert.match(instagramReelsBackupWorkflow, /post-daily-birthday-reels\.js --post --platforms=threads,instagram/, 'Reels backup should publish to both Threads and Instagram');
  assert.doesNotMatch(imageBackupWorkflow, /^\s+schedule:/m, 'night image backup should not have a scheduled trigger');
  assert.match(imageBackupWorkflow, /Night image posting is disabled/, 'image backup workflow should not publish night image posts');
  assert.doesNotMatch(workflow, /birthday_monthly_01_08/, 'workflow dispatch should not expose old 20:00 birthday monthly image slots');
  assert.doesNotMatch(workflow, /birthday_ranking_love_at_first_sight/, 'workflow dispatch should not expose old birthday ranking image slots');
  assert.doesNotMatch(workflow, /birthday_ranking_buchigire_kowai/, 'workflow dispatch should not expose old birthday ranking image slots');
  assert.match(workflow, /- validate_only/, 'workflow dispatch should support credential validation without publishing');
  assert.match(workflow, /github\.event\.inputs\.kind != 'validate_only'/, 'validate_only dispatch should run checks and doctors without publishing');
}

function testReelCatchupRecoversMissedSameNightSlots() {
  const normal = reelScheduleReport('2026-06-13T13:47:00.000Z');
  assert.deepEqual(dueReelIds(normal), ['daily_reel_20260613_22_creator_type'], 'without catchup, 22:47 JST should only post the 22:00 reel');

  const catchup = reelScheduleReport('2026-06-13T13:47:00.000Z', { SOCIAL_REEL_CATCHUP_HOURS: '8' });
  assert.deepEqual(dueReelIds(catchup), [
    'daily_reel_20260613_20_himitsu_mamorenai',
    'daily_reel_20260613_21_mood_maker',
    'daily_reel_20260613_22_creator_type',
  ], 'catchup should recover every missed same-night reel at a later backup tick');

  const oldNightSlot = reelScheduleReport('2026-06-13T14:01:00.000Z', { SOCIAL_REEL_CATCHUP_HOURS: '0' });
  assert.deepEqual(dueReelIds(oldNightSlot), [], '23:01 JST should not publish a reel under the new 20:00-22:00 rule');
}

function testCloudRunnerRecoversNightReelsAndBlocksLocalPosting() {
  const report = cloudScheduleReport('2026-06-13T14:05:00.000Z');
  assert.equal(report.dryRun, true, 'cloud runner dry-run should not publish');
  assert.deepEqual(report.steps.map(step => step.id), ['oracle', 'daily_birthday_reels'], 'cloud runner should check oracle and reels together');
  const reelsStep = report.steps.find(step => step.id === 'daily_birthday_reels');
  assert.deepEqual(dueReelIds(reelsStep.report), [
    'daily_reel_20260613_20_himitsu_mamorenai',
    'daily_reel_20260613_21_mood_maker',
    'daily_reel_20260613_22_creator_type',
  ], '23:05 JST cloud recovery should catch every missed same-night reel');

  const blocked = runNode(['scripts/social/run-cloud-scheduled-posts.js'], {
    expectSuccess: false,
    env: {
      SOCIAL_AUTOMATED_POSTING_ENABLED: 'true',
      SOCIAL_CLOUD_SCHEDULER: 'false',
      SOCIAL_SCHEDULED_RUN: 'false',
      GITHUB_ACTIONS: 'false',
      RENDER: 'false',
      RENDER_SERVICE_ID: '',
    },
  });
  assert.notEqual(blocked.status, 0, 'local cloud runner without --dry-run or --yes must not post');
  assert.match(blocked.stderr, /Real scheduled posting requires/, 'local posting block should explain the scheduler requirement');
}

function testBroadSocialAuditPasses() {
  const result = runNode([
    'scripts/social/audit-social-drafts.js',
    '--from=2026-05-13',
    '--to=2026-06-30',
    '--platforms=threads,instagram',
  ]);
  assert.match(result.stdout, /"errors": 0/, 'audit should report zero errors');
}

testDraftHasTrackingImagesAndAlt();
testPlatformHashtagPolicy();
testAutomationDocsUseThreadsInstagramProductionLane();
testWorkflowPostingPlatformsMatchProductionLane();
testMorningOracleCopyStillKeepsRequiredClosing();
testOracleDailyCopyIsGroundedInAllCardReadings();
testLenormandOneCardCopyDataQuality();
testEmpathyUsesRandomLenormandRotation();
testBirthdayMonthlyUsesGeneratedSlides();
testRashinPointOneOffCarouselDraft();
testBirthdayRankingInstagramDrafts();
testDifferenceAndFreePaidCompareAxes();
testPostsLedgerWriteIsTraceableAndSecretSafe();
testRealPostingRequiresExplicitYesOutsideScheduler();
testScheduledPostsRespectJstWeekdays();
testStatelessScheduleKeepsRecoveryGraceWindow();
testWorkflowHasScheduledPostingBackup();
testReelCatchupRecoversMissedSameNightSlots();
testCloudRunnerRecoversNightReelsAndBlocksLocalPosting();
testBroadSocialAuditPasses();
testKpiReviewTemplatePreservesManualMetrics();

console.log('social-posting tests passed');
