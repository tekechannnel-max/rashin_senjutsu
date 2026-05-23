const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.resolve(rootDir, process.env.RASHIN_VERIFY_OUTPUT_DIR || 'outputs');
const baseUrl = process.env.RASHIN_VERIFY_BASE_URL || 'http://127.0.0.1:3128/?dev&debug=1';
const outputPrefix = process.env.RASHIN_VERIFY_OUTPUT_PREFIX || 'verify-free-local';
const headed = /^(1|true|yes)$/i.test(process.env.RASHIN_VERIFY_HEADED || '');
const startedAt = new Date().toISOString();

fs.mkdirSync(outDir, { recursive: true });

const apiLog = [];
const consoleLog = [];
const stepLog = [];

function envValue(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function envList(name, fallback = []) {
  const value = process.env[name];
  if (!value || !value.trim()) return fallback;
  if (value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean);
    } catch (_error) {}
  }
  return value.split(/\s*[|,]\s*/).map(item => item.trim()).filter(Boolean);
}

const persona = {
  sei: envValue('RASHIN_VERIFY_SEI', '中村'),
  mei: envValue('RASHIN_VERIFY_MEI', '翔太'),
  username: envValue('RASHIN_VERIFY_USERNAME', '翔太'),
  gender: envValue('RASHIN_VERIFY_GENDER', '男性'),
  year: envValue('RASHIN_VERIFY_YEAR', '1991'),
  month: envValue('RASHIN_VERIFY_MONTH', '9'),
  day: envValue('RASHIN_VERIFY_DAY', '18'),
  hour: envValue('RASHIN_VERIFY_HOUR', '8'),
  category: envValue('RASHIN_VERIFY_CATEGORY', '総合'),
  concernType: envValue('RASHIN_VERIFY_CONCERN_TYPE', '総合運'),
  theme: envValue(
    'RASHIN_VERIFY_THEME',
    'ここ数か月、仕事も人間関係も大きく崩れてはいないが、気力が続かず、この先一年で何を優先すればいいか迷っている。転職や恋愛のような一つの悩みではなく、生活リズム、健康、将来の準備、人との距離感を整えたい。いまの運気の流れと、注意点、動き出すタイミングを知りたい。'
  ),
};

const reactionChoices = envList('RASHIN_VERIFY_REACTION_CHOICES', [
  '雰囲気や仕事が楽しい',
  '多くの人と関わって楽しみたい',
]);
const expectedTerms = envList('RASHIN_VERIFY_EXPECT_TERMS', ['総合', '生活リズム', '健康', '将来', '仕事', '人間関係']);
const forbiddenTerms = envList('RASHIN_VERIFY_FORBID_TERMS', ['結婚', '復縁', '好きな気持ち', '相手の気持ち', '転職先', '制作会社']);
const requireAllExpectedTerms = /^(1|true|yes)$/i.test(process.env.RASHIN_VERIFY_REQUIRE_ALL_EXPECT_TERMS || '');

function outputName(name) {
  return name.startsWith('verify-free-local') ? `${outputPrefix}${name.slice('verify-free-local'.length)}` : name;
}

function outputPath(name) {
  return path.join(outDir, outputName(name));
}

function artifactPath(name) {
  return path.relative(rootDir, outputPath(name)).replace(/\\/g, '/');
}

function log(step, data = {}) {
  const entry = { at: new Date().toISOString(), step, ...data };
  stepLog.push(entry);
  console.log(`[verify-free-flow] ${step}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ''}`);
}

async function screenshot(page, name, fullPage = true) {
  await page.screenshot({ path: outputPath(name), fullPage });
  log('screenshot', { name: outputName(name) });
}

async function activeScreens(page) {
  return page.evaluate(() => [...document.querySelectorAll('.screen.active')].map(node => node.id));
}

async function visibleText(page, selector = 'body') {
  return page.locator(selector).innerText({ timeout: 3000 }).catch(() => '');
}

async function waitForActive(page, id, timeout = 60000) {
  await page.waitForFunction(
    screenId => document.querySelector(`#${screenId}.screen.active`),
    id,
    { timeout }
  );
  log('active-screen', { id, active: await activeScreens(page) });
}

async function clickByText(page, selector, text, timeout = 30000) {
  const target = page.locator(selector).filter({ hasText: text }).first();
  await target.waitFor({ state: 'visible', timeout });
  await target.click({ timeout });
  log('click', { selector, text });
}

async function selectConsultationTag(page, value) {
  await page.waitForSelector('#consultation-tag-modal:not([hidden])', { timeout: 60000 });
  const ok = await page.evaluate(tagValue => {
    const buttons = [...document.querySelectorAll('[data-consultation-tag]')];
    const button = buttons.find(el => {
      const rawValue = el.getAttribute('data-consultation-tag') || '';
      const text = el.textContent || '';
      return rawValue.includes(tagValue) || text.includes(tagValue);
    });
    if (!button) return false;
    button.click();
    document.querySelector('#consultation-tag-go')?.click();
    return true;
  }, value);
  if (!ok) {
    const available = await page.evaluate(() =>
      [...document.querySelectorAll('[data-consultation-tag]')].map(el => ({
        value: el.getAttribute('data-consultation-tag'),
        text: el.textContent.trim(),
      }))
    );
    throw new Error(`consultation tag not found: ${value}; available=${JSON.stringify(available)}`);
  }
  log('consultation-tag-selected', { value });
}

async function startFreeFlow(page) {
  const ok = await page.evaluate(async () => {
    if (typeof window.startFlow === 'function') {
      await window.startFlow('free');
      return true;
    }
    const button = document.querySelector('#s-top .btn-top.btn-free, [data-flow-target="free"]');
    if (!button) return false;
    button.click();
    return true;
  });
  if (!ok) throw new Error('free flow start button not found');
  log('free-flow-started');
}

async function fillPersona(page) {
  await waitForActive(page, 's-input', 60000);
  await page.fill('#f-sei', persona.sei);
  await page.fill('#f-mei', persona.mei);
  await page.fill('#f-username', persona.username);
  await page.click(/^(male|男性|男)$/i.test(persona.gender) ? '#gb-male' : '#gb-female');
  await page.selectOption('#f-year', persona.year);
  await page.selectOption('#f-month', persona.month);
  await page.selectOption('#f-day', persona.day);
  await page.selectOption('#f-hour', persona.hour);
  await page.fill('#f-theme', persona.theme);

  const chosen = [];
  async function clickReaction(text) {
    await page.waitForSelector('.reaction-choice', { timeout: 30000 });
    const result = await page.evaluate(needle => {
      const normalize = value => String(value || '').replace(/\s+/g, '');
      const choices = [...document.querySelectorAll('.reaction-choice')];
      const target = choices.find(el => normalize(el.textContent).includes(normalize(needle)));
      if (!target) return { ok: false, choices: choices.map(el => el.textContent.trim()) };
      target.click();
      return { ok: true, text: target.textContent.trim() };
    }, text);
    if (!result.ok) {
      throw new Error(`reaction choice not found: ${text}; choices=${JSON.stringify(result.choices)}`);
    }
    chosen.push(result.text);
    await page.waitForTimeout(500);
  }

  for (const choice of reactionChoices) {
    await clickReaction(choice);
  }
  log('persona-filled', {
    persona: {
      name: `${persona.sei} ${persona.mei}`,
      username: persona.username,
      birthDate: `${persona.year}-${persona.month.padStart(2, '0')}-${persona.day.padStart(2, '0')}`,
      gender: persona.gender,
      category: persona.category,
      concernType: persona.concernType,
    },
    reactionChoices: chosen,
  });
  await screenshot(page, 'verify-free-local-input-filled.png');
}

async function runCardFlow(page) {
  await page.locator('#s-input .btn-main').click();
  await waitForActive(page, 's-len', 60000);
  await page.waitForTimeout(1200);
  await page.click('#len-stop-btn');
  await page.waitForSelector('#len-cards-full.on', { timeout: 60000 });
  await screenshot(page, 'verify-free-local-lenormand-cards.png');
  await clickByText(page, '#len-cards-full button', 'オラクル');

  await waitForActive(page, 's-orc', 60000);
  await page.waitForTimeout(1000);
  await page.click('#orc-stop-btn');
  await page.waitForSelector('#orc-select-area.on .orc-sel-card', { timeout: 60000 });
  const selectCount = await page.evaluate(() => {
    const max = Number.parseInt(document.querySelector('#orc-sel-max')?.textContent || '1', 10);
    return Number.isFinite(max) && max > 0 ? max : 1;
  });
  await page.evaluate(count => {
    [...document.querySelectorAll('#orc-card-grid .orc-sel-card')]
      .slice(0, count)
      .forEach(el => el.click());
  }, selectCount);
  await page.waitForSelector('#orc-confirm-btn:not([style*="display: none"])', { timeout: 30000 });
  await page.click('#orc-confirm-btn');
  await page.waitForSelector('#orc-cards-full.on', { timeout: 60000 });
  await screenshot(page, 'verify-free-local-oracle-cards.png');
  await clickByText(page, '#orc-cards-full button', '結果');
}

async function waitForResult(page) {
  await waitForActive(page, 's-result', 60000);
  let lastText = '';
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(5000);
    lastText = await visibleText(page);
    const state = await page.evaluate(() => {
      const getText = selector => document.querySelector(selector)?.innerText || '';
      return {
        activeScreens: [...document.querySelectorAll('.screen.active')].map(node => node.id),
        foundationText: getText('#rs-foundation-mini'),
        lenText: getText('#r-len-block'),
        orcText: getText('#r-orc-block'),
        integrationText: getText('#r-integration'),
        progressDisplay: getComputedStyle(document.querySelector('#result-progress-card') || document.body).display,
        bodyText: document.body.innerText || '',
      };
    });
    log('result-poll', {
      foundationChars: state.foundationText.length,
      lenChars: state.lenText.length,
      orcChars: state.orcText.length,
      integrationChars: state.integrationText.length,
      progressDisplay: state.progressDisplay,
    });
    if (
      state.integrationText.length > 250 &&
      state.lenText.length > 350 &&
      state.orcText.length > 220 &&
      state.progressDisplay === 'none' &&
      !state.bodyText.includes('整理しています')
    ) {
      return { ok: true };
    }
    if (state.progressDisplay === 'none' && state.integrationText.length > 160 && state.orcText.length > 160) {
      return {
        ok: true,
        completeButShort: true,
        reason: state.lenText.length <= 220 ? 'lenormand section completed too short' : 'result completed short',
      };
    }
  }
  return {
    ok: false,
    reason: 'timeout waiting for complete free result',
    lastText: lastText.slice(0, 2000),
  };
}

async function extractResult(page) {
  const data = await page.evaluate(() => {
    const getText = selector => {
      const el = document.querySelector(selector);
      return el ? (el.innerText || el.textContent || '').replace(/\n{3,}/g, '\n\n').trim() : '';
    };
    const getHtml = selector => document.querySelector(selector)?.innerHTML || '';
    const readRuntime = name => {
      try {
        if (name === 'SEL_LEN') return typeof SEL_LEN !== 'undefined' ? SEL_LEN : null;
        if (name === 'SEL_ORC') return typeof SEL_ORC !== 'undefined' ? SEL_ORC : null;
        if (name === 'PLAN') return typeof PLAN !== 'undefined' ? PLAN : null;
        if (name === 'CURRENT_READING_ID') return typeof CURRENT_READING_ID !== 'undefined' ? CURRENT_READING_ID : null;
      } catch (_) {
        return window[name] || null;
      }
      return window[name] || null;
    };
    return {
      activeScreens: [...document.querySelectorAll('.screen.active')].map(node => node.id),
      animal: getText('#rs-animal-reveal'),
      foundationMini: getText('#rs-foundation-mini'),
      basis: getText('#rs-basis'),
      len: getText('#rs-len'),
      orc: getText('#rs-orc'),
      integration: getText('#rs-integration'),
      dossierSection: getText('#rs-dossier'),
      resultActions: getText('#result-actions'),
      selectedLen: Array.isArray(readRuntime('SEL_LEN')) ? readRuntime('SEL_LEN') : null,
      selectedOrc: Array.isArray(readRuntime('SEL_ORC')) ? readRuntime('SEL_ORC') : null,
      plan: readRuntime('PLAN'),
      currentReadingId: readRuntime('CURRENT_READING_ID'),
      htmlSnippets: {
        len: getHtml('#r-len-block'),
        orc: getHtml('#r-orc-block'),
        integration: getHtml('#r-integration'),
      },
    };
  });
  fs.writeFileSync(
    outputPath('verify-free-local-result-text.txt'),
    [
      '# STRUCTURE',
      `activeScreens: ${JSON.stringify(data.activeScreens)}`,
      `plan: ${data.plan}`,
      `currentReadingId: ${data.currentReadingId}`,
      '',
      '# ANIMAL',
      data.animal,
      '',
      '# FOUNDATION',
      data.foundationMini,
      '',
      '# BASIS',
      data.basis,
      '',
      '# LENORMAND',
      data.len,
      '',
      '# ORACLE',
      data.orc,
      '',
      '# INTEGRATION',
      data.integration,
      '',
      '# DOSSIER SECTION',
      data.dossierSection,
      '',
      '# ACTIONS',
      data.resultActions,
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(outputPath('verify-free-local-result-structured.json'), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function sectionEndsCleanly(text) {
  const value = String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !['根拠を見る', '詳しく見る', '詳しく読む'].includes(line))
    .join('\n')
    .trim();
  if (!value) return false;
  return /[。！？）」』】]$/.test(value);
}

function evaluateContent(result) {
  const combined = [result.animal, result.foundationMini, result.len, result.orc, result.integration].join('\n');
  const matchedExpectedTerms = expectedTerms.filter(term => combined.includes(term));
  const missingExpectedTerms = expectedTerms.filter(term => !combined.includes(term));
  const matchedForbiddenTerms = forbiddenTerms.filter(term => combined.includes(term));
  const displayNameBase = String(persona.username || persona.mei || '').replace(/\s+/g, '').trim();
  const mismatchedDisplayNames = [...new Set(
    [...combined.matchAll(/[一-龯ぁ-んァ-ヶ]{2,6}さん/g)]
      .map(match => match[0])
      .filter(name => displayNameBase && !name.startsWith(displayNameBase))
  )];
  const checks = {
    resultScreenVisible: result.activeScreens.includes('s-result'),
    freePlan: result.plan === 'free',
    hasFoundationSummary: result.foundationMini.length > 80,
    hasAnimalProfile: result.animal.length > 60,
    hasLenormandSection: result.len.includes('ルノルマンカード鑑定') && result.len.length > 350,
    hasOracleSection: result.orc.includes('オラクルカード鑑定') && result.orc.length > 220,
    hasIntegrationSection: result.integration.includes('いまの答え') && result.integration.length > 250,
    usesExpectedConcernTerms: requireAllExpectedTerms
      ? missingExpectedTerms.length === 0
      : matchedExpectedTerms.length >= Math.min(3, expectedTerms.length),
    avoidsForbiddenConcernTerms: matchedForbiddenTerms.length === 0,
    noObviousPlaceholder: !combined.includes('作れませんでした') &&
      !combined.includes('fallback') &&
      !combined.includes('TODO') &&
      !combined.includes('undefined') &&
      !combined.includes('null'),
    noAwkwardFinalPhrase: !/無視しないほうがいい羅針になります|続ける意味場所|です。です。|ます。ます。|、。|。、/.test(combined),
    sectionsEndCleanly: [result.foundationMini, result.len, result.orc, result.integration].every(sectionEndsCleanly),
    noMismatchedDisplayName: mismatchedDisplayNames.length === 0,
  };
  const failed = Object.entries(checks)
    .filter(([, value]) => typeof value === 'boolean' && !value)
    .map(([key]) => key);
  return {
    checks,
    failed,
    passed: failed.length === 0,
    expectedTerms,
    matchedExpectedTerms,
    missingExpectedTerms,
    requireAllExpectedTerms,
    forbiddenTerms,
    matchedForbiddenTerms,
    mismatchedDisplayNames,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('console', message => {
    consoleLog.push({ type: message.type(), text: message.text().slice(0, 1000) });
  });
  page.on('pageerror', error => {
    consoleLog.push({ type: 'pageerror', text: error.message, stack: error.stack });
  });
  page.on('response', async response => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const item = {
      at: new Date().toISOString(),
      status: response.status(),
      method: response.request().method(),
      url: url.replace(/^https?:\/\/127\.0\.0\.1:3128/, ''),
    };
    try {
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('application/json')) {
        item.body = (await response.text()).slice(0, 1200);
      }
    } catch (_error) {
      item.body = '[unreadable]';
    }
    apiLog.push(item);
  });

  try {
    log('goto', { baseUrl });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#s-top', { timeout: 60000 });
    await screenshot(page, 'verify-free-local-initial.png');
    await startFreeFlow(page);
    await selectConsultationTag(page, persona.category);
    await fillPersona(page);
    await runCardFlow(page);
    const resultState = await waitForResult(page);
    await screenshot(page, 'verify-free-local-result-full.png');
    if (!resultState.ok) throw new Error(`result incomplete: ${JSON.stringify(resultState)}`);

    const result = await extractResult(page);
    const evaluation = evaluateContent(result);
    const artifactNames = [
      'verify-free-local-initial.png',
      'verify-free-local-input-filled.png',
      'verify-free-local-lenormand-cards.png',
      'verify-free-local-oracle-cards.png',
      'verify-free-local-result-full.png',
      'verify-free-local-result-text.txt',
      'verify-free-local-result-structured.json',
    ];
    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      baseUrl,
      outputPrefix,
      persona: {
        name: `${persona.sei} ${persona.mei}`,
        username: persona.username,
        birthDate: `${persona.year}-${persona.month.padStart(2, '0')}-${persona.day.padStart(2, '0')}`,
        gender: persona.gender,
        category: persona.category,
        concernType: persona.concernType,
      },
      resultState,
      evaluation,
      apiLog,
      consoleLog,
      stepLog,
      artifacts: artifactNames.map(artifactPath),
    };
    fs.writeFileSync(outputPath('verify-free-local-flow-report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ ok: true, evaluation, report: artifactPath('verify-free-local-flow-report.json') }, null, 2));
    await browser.close();
    process.exit(evaluation.passed ? 0 : 2);
  } catch (error) {
    try {
      await screenshot(page, 'verify-free-local-failure.png');
    } catch (_screenshotError) {}
    const failure = {
      startedAt,
      failedAt: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      apiLog,
      consoleLog,
      stepLog,
      body: await visibleText(page).catch(() => ''),
    };
    fs.writeFileSync(outputPath('verify-free-local-flow-failure.json'), JSON.stringify(failure, null, 2), 'utf8');
    console.error(error);
    await browser.close();
    process.exit(1);
  }
}

main();
