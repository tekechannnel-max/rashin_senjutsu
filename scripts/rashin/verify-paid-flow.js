const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.resolve(rootDir, process.env.RASHIN_VERIFY_OUTPUT_DIR || 'outputs');
const baseUrl = process.env.RASHIN_VERIFY_BASE_URL || 'http://127.0.0.1:3128/?dev&debug=1';
const outputPrefix = process.env.RASHIN_VERIFY_OUTPUT_PREFIX || 'verify-local';
const rashinCode = process.env.RASHIN_VERIFY_CODE || '';
const developerEmail = process.env.RASHIN_VERIFY_DEV_EMAIL || 'codex-local@rashin.test';
const headed = /^(1|true|yes)$/i.test(process.env.RASHIN_VERIFY_HEADED || '');
const startedAt = new Date().toISOString();

if (!/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(rashinCode)) {
  throw new Error('RASHIN_VERIFY_CODE must be set to the paid Rashin code to verify, for example ABCD-1234-WXYZ.');
}

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

function envJsonArray(name, fallback = []) {
  const value = process.env[name];
  if (!value || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim()).filter(Boolean);
  } catch (_error) {}
  return fallback;
}

const persona = {
  sei: envValue('RASHIN_VERIFY_SEI', '佐藤'),
  mei: envValue('RASHIN_VERIFY_MEI', '美咲'),
  username: envValue('RASHIN_VERIFY_USERNAME', '美咲'),
  gender: envValue('RASHIN_VERIFY_GENDER', '女性'),
  year: envValue('RASHIN_VERIFY_YEAR', '1996'),
  month: envValue('RASHIN_VERIFY_MONTH', '8'),
  day: envValue('RASHIN_VERIFY_DAY', '17'),
  hour: envValue('RASHIN_VERIFY_HOUR', '12'),
  category: envValue('RASHIN_VERIFY_CATEGORY', '恋愛'),
  concernType: envValue('RASHIN_VERIFY_CONCERN_TYPE', '結婚'),
  theme: envValue(
    'RASHIN_VERIFY_THEME',
    '交際中の相手と、このまま結婚に進んでよいか迷っている。相手のことは好きだが、生活リズムやお金の感覚が少し違い、この先うまくやっていけるのか不安。将来の話をすると相手が少し曖昧になるので、本当に信じてよいのか、いま決めてよいのかが腑に落ちていない。'
  ),
};

const reactionChoices = envList('RASHIN_VERIFY_REACTION_CHOICES', [
  '雰囲気や仕事が楽しい',
  '量より質。大事な人をじっくりつくっていきたい',
]);

const clarifyAnswers = envJsonArray('RASHIN_VERIFY_CLARIFY_ANSWERS_JSON', [
  '相手のことは好きだけど、結婚後のお金の使い方や生活リズムの違いを本当に話し合える相手なのか、まだ確信が持てない。好きという気持ちだけで進めると、あとから自分が無理を重ねそうな不安がある。',
  'この人と一緒にいる安心感を失うこと。別れたあとに、やっぱりこの人以上に落ち着ける相手はいなかったと思うのが怖い。ここまで積み上げてきた時間も簡単には手放せない。',
  '普段は優しいのに、将来の話になると少し曖昧になるところ。結婚を本気で考えているのか、今の関係が心地いいから先延ばしにしているだけなのかが読めない。',
  '具体的な時期やお金のことを避けずに話してくれて、言ったことを小さくても行動に移してくれるなら前に進めると思う。言葉だけではなく、生活の話を一緒に扱う姿勢が見たい。',
  '不安を責める形ではなく、結婚後の生活をどう考えているのかを一度ちゃんと伝えたい。すぐに決めるより、相手の答えを聞いてから自分の気持ちを整理したい。',
]);

const expectedTerms = envList('RASHIN_VERIFY_EXPECT_TERMS', ['結婚', '生活リズム', 'お金', '曖昧', '信じ']);
const forbiddenTerms = envList('RASHIN_VERIFY_FORBID_TERMS', []);
const requireAllExpectedTerms = /^(1|true|yes)$/i.test(process.env.RASHIN_VERIFY_REQUIRE_ALL_EXPECT_TERMS || '');

function outputName(name) {
  return name.startsWith('verify-local') ? `${outputPrefix}${name.slice('verify-local'.length)}` : name;
}

function outputPath(name) {
  return path.join(outDir, outputName(name));
}

function artifactPath(name) {
  return path.relative(rootDir, outputPath(name)).replace(/\\/g, '/');
}

function maskRashinCode(code) {
  const normalized = String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (normalized.length !== 12) return '';
  return '[redacted]';
}

async function redactSensitiveInputs(page) {
  await page.evaluate(() => {
    const codeInput = document.querySelector('#rashin-code-input');
    if (codeInput) {
      codeInput.value = '[redacted]';
      codeInput.setAttribute('value', '[redacted]');
    }
  }).catch(() => {});
}

function log(step, data = {}) {
  const entry = { at: new Date().toISOString(), step, ...data };
  stepLog.push(entry);
  console.log(`[verify-paid-flow] ${step}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ''}`);
}

async function screenshot(page, name, fullPage = true) {
  await redactSensitiveInputs(page);
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

async function startPaidFlowAfterCode(page) {
  const ok = await page.evaluate(async () => {
    if (typeof window.startFlow === 'function') {
      await window.startFlow('paid');
      return true;
    }
    const button = document.querySelector('#s-top .btn-top.btn-paid, [data-flow-target="paid"]');
    if (!button) return false;
    button.click();
    return true;
  });
  if (!ok) throw new Error('paid flow start button not found after Rashin code submission');
  log('paid-flow-started', { source: 'rashin-code' });
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
  await screenshot(page, 'verify-local-input-filled.png');
}

async function runCardFlow(page) {
  await page.locator('#s-input .btn-main').click();
  await waitForActive(page, 's-len', 60000);
  await page.waitForTimeout(1200);
  await page.click('#len-stop-btn');
  await page.waitForSelector('#len-cards-full.on', { timeout: 60000 });
  await screenshot(page, 'verify-local-lenormand-cards.png');
  await clickByText(page, '#len-cards-full button', 'オラクル');

  await waitForActive(page, 's-orc', 60000);
  await page.waitForTimeout(1000);
  await page.click('#orc-stop-btn');
  await page.waitForSelector('#orc-select-area.on .orc-sel-card', { timeout: 60000 });
  await page.evaluate(() => {
    [...document.querySelectorAll('#orc-card-grid .orc-sel-card')]
      .slice(0, 3)
      .forEach(el => el.click());
  });
  await page.waitForSelector('#orc-confirm-btn:not([style*="display: none"])', { timeout: 30000 });
  await page.click('#orc-confirm-btn');
  await page.waitForSelector('#orc-cards-full.on', { timeout: 60000 });
  await screenshot(page, 'verify-local-oracle-cards.png');
  await clickByText(page, '#orc-cards-full button', '結果を見る');
}

async function fillClarify(page) {
  await waitForActive(page, 's-clarify', 60000);
  await page.waitForSelector('.clarify-textarea', { timeout: 30000 });
  const questions = await page.evaluate(() =>
    [...document.querySelectorAll('.clarify-q')].map((block, index) => ({
      index: index + 1,
      id: block.dataset.qid || '',
      badge: block.querySelector('.clarify-q-badge')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      question: block.querySelector('.clarify-q-text')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      templates: [...block.querySelectorAll('.tmpl-btn')].map(button => button.textContent.trim()),
    }))
  );
  const count = await page.locator('.clarify-textarea').count();
  for (let index = 0; index < count; index += 1) {
    await page.locator('.clarify-textarea').nth(index).fill(
      clarifyAnswers[index] || clarifyAnswers[clarifyAnswers.length - 1] || persona.theme
    );
  }
  log('clarify-filled', { count, questions });
  await screenshot(page, 'verify-local-clarify-filled.png');
  await page.locator('#s-clarify .clarify-btns .btn-main').click();
  return { questions, answers: clarifyAnswers.slice(0, count) };
}

async function waitForResult(page) {
  await waitForActive(page, 's-result', 60000);
  let retryCount = 0;
  let lastText = '';
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(8000);
    lastText = await visibleText(page);
    const state = await page.evaluate(() => {
      const getText = selector => document.querySelector(selector)?.innerText || '';
      const isVisible = selector => {
        const el = document.querySelector(selector);
        return !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
      };
      return {
        activeScreens: [...document.querySelectorAll('.screen.active')].map(node => node.id),
        lenText: getText('#r-len-block'),
        orcText: getText('#r-orc-block'),
        integrationText: getText('#r-integration'),
        progressDisplay: getComputedStyle(document.querySelector('#result-progress-card') || document.body).display,
        retryVisible: [...document.querySelectorAll('button')].some(button => {
          return (button.textContent || '').includes('同じチケットで再試行') &&
            getComputedStyle(button).display !== 'none';
        }),
        ticketUnused: document.body.innerText.includes('チケットは使用していません'),
        hasDossierCta: document.body.innerText.includes('羅針カードを発行できます') ||
          document.body.innerText.includes('羅針カードを発行する'),
        integrationVisible: isVisible('#r-integration'),
      };
    });
    log('result-poll', {
      lenChars: state.lenText.length,
      orcChars: state.orcText.length,
      integrationChars: state.integrationText.length,
      progressDisplay: state.progressDisplay,
      hasDossierCta: state.hasDossierCta,
      ticketUnused: state.ticketUnused,
      retryVisible: state.retryVisible,
    });
    if (state.retryVisible && retryCount < 3) {
      retryCount += 1;
      await screenshot(page, `verify-local-result-stopped-retry-${retryCount}.png`);
      await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')]
          .find(node => (node.textContent || '').includes('同じチケットで再試行'));
        button?.click();
      });
      log('retry-clicked', { retryCount });
      continue;
    }
    if (state.retryVisible && retryCount >= 3) {
      return {
        ok: false,
        retryCount,
        reason: 'quality stop after retries',
        lastText: lastText.slice(0, 2000),
      };
    }
    if (
      state.integrationText.length > 220 &&
      state.lenText.length > 600 &&
      state.orcText.length > 120 &&
      state.hasDossierCta &&
      !state.ticketUnused
    ) {
      return { ok: true, retryCount };
    }
    if (
      state.hasDossierCta &&
      state.progressDisplay === 'none' &&
      state.integrationText.length > 100 &&
      state.lenText.length > 100 &&
      state.orcText.length > 0 &&
      !state.ticketUnused
    ) {
      return { ok: true, retryCount, completeButShort: true };
    }
    if (state.ticketUnused && !state.retryVisible && retryCount >= 3) {
      return {
        ok: false,
        retryCount,
        reason: 'quality stop after retries',
        lastText: lastText.slice(0, 2000),
      };
    }
  }
  return {
    ok: false,
    retryCount,
    reason: 'timeout waiting for complete result',
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
        if (name === 'PAID_DEBUG_LOG') return typeof PAID_DEBUG_LOG !== 'undefined' ? PAID_DEBUG_LOG : null;
        if (name === 'SEL_LEN') return typeof SEL_LEN !== 'undefined' ? SEL_LEN : null;
        if (name === 'SEL_ORC') return typeof SEL_ORC !== 'undefined' ? SEL_ORC : null;
        if (name === 'PLAN') return typeof PLAN !== 'undefined' ? PLAN : null;
        if (name === 'CURRENT_READING_ID') return typeof CURRENT_READING_ID !== 'undefined' ? CURRENT_READING_ID : null;
        if (name === 'ACTIVE_PAID_READING_TICKET') return typeof ACTIVE_PAID_READING_TICKET !== 'undefined' ? ACTIVE_PAID_READING_TICKET : null;
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
      paidDebug: readRuntime('PAID_DEBUG_LOG'),
      selectedLen: Array.isArray(readRuntime('SEL_LEN')) ? readRuntime('SEL_LEN') : null,
      selectedOrc: Array.isArray(readRuntime('SEL_ORC')) ? readRuntime('SEL_ORC') : null,
      plan: readRuntime('PLAN'),
      currentReadingId: readRuntime('CURRENT_READING_ID'),
      activeTicket: readRuntime('ACTIVE_PAID_READING_TICKET'),
      htmlSnippets: {
        len: getHtml('#r-len-block'),
        orc: getHtml('#r-orc-block'),
        integration: getHtml('#r-integration'),
        dossier: getHtml('#rs-dossier'),
      },
    };
  });
  fs.writeFileSync(
    outputPath('verify-local-result-text.txt'),
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
  fs.writeFileSync(outputPath('verify-local-result-structured.json'), JSON.stringify(data, null, 2), 'utf8');
  if (data.paidDebug) {
    fs.writeFileSync(outputPath('verify-local-paid-debug.json'), JSON.stringify(data.paidDebug, null, 2), 'utf8');
  }
  return data;
}

async function issueDossier(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await screenshot(page, 'verify-local-result-full.png');
  const opened = await page.evaluate(async () => {
    if (typeof openDossierViewer === 'function') {
      await openDossierViewer('card');
      return true;
    }
    const button = [...document.querySelectorAll('button')]
      .find(node => (node.textContent || '').includes('羅針カードを発行'));
    if (!button) return false;
    button.click();
    return true;
  });
  if (!opened) throw new Error('dossier viewer could not be opened');

  const deadline = Date.now() + 6 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(4000);
    const state = await page.evaluate(() => ({
      open: !!document.querySelector('#dossier-viewer') && !document.querySelector('#dossier-viewer').hidden,
      text: document.querySelector('#dossier-viewer-content')?.innerText || '',
      sectionText: document.querySelector('#rs-dossier')?.innerText || '',
    }));
    log('dossier-poll', {
      open: state.open,
      viewerChars: state.text.length,
      sectionChars: state.sectionText.length,
    });
    if (state.open && state.text.length > 150) break;
  }

  const dossier = await page.evaluate(() => ({
    viewerOpen: !!document.querySelector('#dossier-viewer') && !document.querySelector('#dossier-viewer').hidden,
    viewerTitle: document.querySelector('#dossier-viewer-title')?.textContent?.trim() || '',
    viewerText: document.querySelector('#dossier-viewer-content')?.innerText?.replace(/\n{3,}/g, '\n\n').trim() || '',
    viewerHtml: document.querySelector('#dossier-viewer-content')?.innerHTML || '',
    cardData: typeof getCurrentDossierCardData === 'function' ? getCurrentDossierCardData() : null,
    hasPayload: typeof hasDossierCardPayload === 'function' ? hasDossierCardPayload() : null,
    paidDebug: (() => {
      try {
        return typeof PAID_DEBUG_LOG !== 'undefined' ? PAID_DEBUG_LOG : null;
      } catch (_) {
        return window.PAID_DEBUG_LOG || null;
      }
    })(),
  }));
  fs.writeFileSync(outputPath('verify-local-dossier-text.txt'), dossier.viewerText, 'utf8');
  fs.writeFileSync(outputPath('verify-local-dossier-structured.json'), JSON.stringify(dossier, null, 2), 'utf8');
  await screenshot(page, 'verify-local-dossier-card.png', false);
  return dossier;
}

function evaluateContent(result, dossier, clarify) {
  const combined = [result.len, result.orc, result.integration, dossier.viewerText].join('\n');
  const includesAny = words => words.some(word => combined.includes(word));
  const matchedExpectedTerms = expectedTerms.filter(term => combined.includes(term));
  const missingExpectedTerms = expectedTerms.filter(term => !combined.includes(term));
  const matchedForbiddenTerms = forbiddenTerms.filter(term => combined.includes(term));
  const dossierQualityIssues = dossier.paidDebug?.dossier?.qualityIssues || [];
  const displayNameBase = String(persona.username || persona.mei || '').replace(/\s+/g, '').trim();
  const mismatchedDisplayNames = [...new Set(
    [...combined.matchAll(/[一-龯ぁ-んァ-ヶ]{2,6}さん/g)]
      .map(match => match[0])
      .filter(name => displayNameBase && !name.startsWith(displayNameBase))
  )];
  const checks = {
    resultScreenVisible: result.activeScreens.includes('s-result'),
    paidPlan: result.plan === 'paid' || !!result.activeTicket,
    hasLenormandSection: result.len.includes('ルノルマンカード鑑定') && result.len.length > 600,
    hasOracleSection: result.orc.includes('オラクルカード鑑定') && result.orc.length > 120,
    hasIntegrationSection: result.integration.includes('いまの答え') && result.integration.length > 250,
    usesExpectedConcernTerms: requireAllExpectedTerms
      ? missingExpectedTerms.length === 0
      : matchedExpectedTerms.length >= Math.min(2, expectedTerms.length),
    avoidsForbiddenConcernTerms: matchedForbiddenTerms.length === 0,
    noTicketStop: !combined.includes('チケットは使用していません') && !combined.includes('品質確認で停止'),
    noObviousPlaceholder: !combined.includes('作れませんでした') &&
      !combined.includes('fallback') &&
      !combined.includes('TODO') &&
      !combined.includes('undefined') &&
      !combined.includes('null'),
    noAwkwardFinalPhrase: !/無視しないほうがいい羅針になります|続ける意味場所|残る意味は、期待ではなく評価、収入(?:\r?\n|$)|残る意味は評価・収入(?:\r?\n|$)|です。です。|ます。ます。|、。|。、/.test(combined),
    dossierViewerOpen: dossier.viewerOpen && dossier.viewerText.length > 150,
    dossierHasRashinCard: includesAny(['羅針カード', 'RASHIN CARD', 'いまの答え', '判断']),
    noDossierQualityIssues: dossierQualityIssues.length === 0,
    noMismatchedDisplayName: mismatchedDisplayNames.length === 0,
    clarifyQuestionsCaptured: Array.isArray(clarify.questions) && clarify.questions.length >= 1,
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
    debugQualityIssues: result.paidDebug?.qualityIssues || [],
    dossierQualityIssues,
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
    await page.waitForSelector('#rashin-code-input', { timeout: 60000 });
    const developerSession = await page.evaluate(async email => {
      const response = await fetch('/api/member/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'developer', email, name: '確認者' }),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    }, developerEmail);
    log('developer-session', {
      status: developerSession.status,
      active: developerSession.body?.active,
      authLoggedIn: developerSession.body?.authLoggedIn,
      source: developerSession.body?.source,
    });
    if (!developerSession.body?.authLoggedIn) {
      throw new Error(`developer auth failed: ${JSON.stringify(developerSession)}`);
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#rashin-code-input', { timeout: 60000 });
    await screenshot(page, 'verify-local-initial.png');
    await page.fill('#rashin-code-input', rashinCode);
    await page.click('#rashin-code-submit');
    log('rashin-code-submitted', { codeMasked: maskRashinCode(rashinCode) });
    await page.waitForTimeout(2500);
    await screenshot(page, 'verify-local-after-code.png');
    await startPaidFlowAfterCode(page);
    await selectConsultationTag(page, persona.category);
    await fillPersona(page);
    await runCardFlow(page);
    const clarify = await fillClarify(page);
    const resultState = await waitForResult(page);
    await screenshot(page, 'verify-local-result-before-dossier.png');
    if (!resultState.ok) throw new Error(`result incomplete: ${JSON.stringify(resultState)}`);

    const result = await extractResult(page);
    const dossier = await issueDossier(page);
    const evaluation = evaluateContent(result, dossier, clarify);
    const artifactNames = [
      'verify-local-initial.png',
      'verify-local-after-code.png',
      'verify-local-input-filled.png',
      'verify-local-lenormand-cards.png',
      'verify-local-oracle-cards.png',
      'verify-local-clarify-filled.png',
      'verify-local-result-before-dossier.png',
      'verify-local-result-full.png',
      'verify-local-dossier-card.png',
      'verify-local-result-text.txt',
      'verify-local-dossier-text.txt',
      'verify-local-result-structured.json',
      'verify-local-dossier-structured.json',
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
        codeMasked: maskRashinCode(rashinCode),
      },
      resultState,
      clarify,
      evaluation,
      apiLog,
      consoleLog,
      stepLog,
      artifacts: artifactNames.map(artifactPath),
    };
    fs.writeFileSync(outputPath('verify-local-paid-flow-report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ ok: true, evaluation, report: artifactPath('verify-local-paid-flow-report.json') }, null, 2));
    await browser.close();
    process.exit(evaluation.passed ? 0 : 2);
  } catch (error) {
    try {
      await screenshot(page, 'verify-local-failure.png');
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
    fs.writeFileSync(outputPath('verify-local-paid-flow-failure.json'), JSON.stringify(failure, null, 2), 'utf8');
    console.error(error);
    await browser.close();
    process.exit(1);
  }
}

main();
