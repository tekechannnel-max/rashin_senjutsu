const fs = require('node:fs');
const path = require('node:path');

const {
  birthdayMiniAssetNameForDay,
  birthdayMiniAssetPathForDay,
  birthdayMiniFamilyForDay,
} = require('./birthday-mini-family');

const ROOT = path.resolve(__dirname, '..', '..');
const TOP5_UNIQUE_FAMILY_RULE_EFFECTIVE_DATE = '2026-06-27';

function normalizeBirthDay(value) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function uniqueDays(days) {
  const out = [];
  const seen = new Set();
  for (const value of days) {
    const day = normalizeBirthDay(value);
    if (!day || seen.has(day)) continue;
    seen.add(day);
    out.push(day);
  }
  return out;
}

function topicText(post = {}) {
  return [
    post.topicType,
    post.researchTarget,
    post.slug,
    post.id,
    post.title,
  ].map(value => String(value || '')).join(' ').toLowerCase();
}

function topicKind(post = {}) {
  const raw = topicText(post);
  if (/birthday_graph_1_31|birthday_graph_all_days|graph|グラフ/.test(raw)) return 'graph';
  if (/birthday_day_manual|manual|取説/.test(raw)) return 'single_day';
  if (/birthday_day_aruaru|aruaru|あるある/.test(raw)) return 'single_day';
  if (/birthday_top5|top5|top\s*5|top５|ｔｏｐ５/.test(raw)) return 'top5';
  return '';
}

function daysFromEntries(entries = []) {
  return entries.map(entry => normalizeBirthDay(entry?.day)).filter(Boolean);
}

function daysFromRows(post = {}) {
  return Array.isArray(post.rows) ? uniqueDays(post.rows.map(row => row?.day)) : [];
}

function daysFromGraph(post = {}) {
  return Array.isArray(post.graphDays) ? uniqueDays(post.graphDays.map(item => item?.day)) : [];
}

function daysFromExplicitContent(post = {}) {
  if (Array.isArray(post.contentDays)) return uniqueDays(post.contentDays);
  if (Array.isArray(post.expectedMiniCharacterDays)) return uniqueDays(post.expectedMiniCharacterDays);
  return [];
}

function parseSingleDay(post = {}) {
  const explicit = normalizeBirthDay(post.day);
  if (explicit) return explicit;
  const text = [post.title, post.slug, post.id].map(value => String(value || '')).join(' ');
  const japanese = text.match(/(\d{1,2})\s*日\s*生まれ/);
  if (japanese) return normalizeBirthDay(japanese[1]);
  const idMatch = text.match(/(?:^|[_-])(?:birthday[_-]day[_-])?(?:aruaru|manual|torisetsu|取説)?[_-]?(0?[1-9]|[12]\d|3[01])(?:[_-]|\b)/i);
  return idMatch ? normalizeBirthDay(idMatch[1]) : null;
}

function graphDays() {
  return Array.from({ length: 31 }, (_value, index) => index + 1);
}

function postDateKey(post = {}) {
  const raw = String(post.date || post.scheduledDate || post.approvedDate || '').trim();
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (direct) return direct[0];
  const text = [post.id, post.slug, post.videoPath].map(value => String(value || '')).join(' ');
  const compact = text.match(/(20\d{2})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return '';
}

function top5UniqueFamilyRuleApplies(post = {}) {
  const dateKey = postDateKey(post);
  return !dateKey || dateKey >= TOP5_UNIQUE_FAMILY_RULE_EFFECTIVE_DATE;
}

function expectedMiniCharacterDaysForPost(post = {}) {
  const explicit = daysFromExplicitContent(post);
  if (explicit.length) return { days: explicit, exact: true, source: 'contentDays' };

  const kind = topicKind(post);
  if (kind === 'graph') return { days: graphDays(), exact: true, source: 'birthday_graph_1_31' };

  const rowDays = daysFromRows(post);
  if (rowDays.length) return { days: rowDays, exact: true, source: 'rows' };

  const graph = daysFromGraph(post);
  if (graph.length) return { days: graph, exact: true, source: 'graphDays' };

  if (kind === 'single_day') {
    const day = parseSingleDay(post);
    return day
      ? { days: [day], exact: true, source: 'single_day' }
      : { days: null, exact: false, requiredCount: 1, source: 'single_day_missing_day' };
  }

  if (kind === 'top5') {
    return { days: null, exact: false, requiredCount: 5, source: 'birthday_top5' };
  }

  return { days: null, exact: false, requiredCount: null, source: 'unknown' };
}

function validateMiniCharactersForPost(post, entries, label = 'post') {
  const errors = [];
  if ((post.kind || 'birthday_reel') !== 'birthday_reel') return errors;
  if (!Array.isArray(entries) || !entries.length) {
    errors.push(`${label} designReview.miniCharacters must list rank, day, family, and asset for every mini character.`);
    return errors;
  }

  const seenDays = new Set();
  entries.forEach((entry, index) => {
    const entryLabel = `${label} designReview.miniCharacters[${index}]`;
    const day = normalizeBirthDay(entry?.day);
    if (!day) {
      errors.push(`${entryLabel}.day must be an integer from 1 to 31.`);
      return;
    }
    if (seenDays.has(day)) errors.push(`${entryLabel}.day duplicates ${day}.`);
    seenDays.add(day);
    const expectedFamily = birthdayMiniFamilyForDay(day);
    const expectedAsset = birthdayMiniAssetNameForDay(day);
    const expectedAssetPath = birthdayMiniAssetPathForDay(day);
    if (Number(entry.family) !== expectedFamily) {
      errors.push(`${entryLabel}.family must be ${expectedFamily} for ${day}日生まれ.`);
    }
    if (String(entry.asset || '').trim() !== expectedAsset) {
      errors.push(`${entryLabel}.asset must be ${expectedAsset} for ${day}日生まれ.`);
    }
    if (String(entry.assetPath || '').trim() !== expectedAssetPath) {
      errors.push(`${entryLabel}.assetPath must be ${expectedAssetPath} for ${day}日生まれ.`);
    }
    if (!fs.existsSync(path.resolve(ROOT, expectedAssetPath))) {
      errors.push(`${entryLabel}.assetPath does not exist: ${expectedAssetPath}.`);
    }
  });

  const expected = expectedMiniCharacterDaysForPost(post);
  const actualDays = daysFromEntries(entries);
  if (expected.days) {
    if (actualDays.length !== expected.days.length) {
      errors.push(`${label} designReview.miniCharacters must list exactly ${expected.days.length} entries for ${expected.source}.`);
    }
    expected.days.forEach((day, index) => {
      if (actualDays[index] !== day) {
        errors.push(`${label} designReview.miniCharacters[${index}].day must be ${day} for ${expected.source}.`);
      }
    });
  } else if (expected.requiredCount && entries.length !== expected.requiredCount) {
    errors.push(`${label} designReview.miniCharacters must list exactly ${expected.requiredCount} entries for ${expected.source}.`);
  }

  if (topicKind(post) === 'top5' && top5UniqueFamilyRuleApplies(post)) {
    const seenFamilies = new Set();
    entries.forEach((entry, index) => {
      const day = normalizeBirthDay(entry?.day);
      if (!day) return;
      const family = birthdayMiniFamilyForDay(day);
      if (seenFamilies.has(family)) {
        errors.push(`${label} designReview.miniCharacters[${index}].family duplicates ${family}; TOP5 mini character families must be unique.`);
      }
      seenFamilies.add(family);
    });
  }

  return errors;
}

function contentDaysForPost(post = {}) {
  const expected = expectedMiniCharacterDaysForPost(post);
  return expected.days || daysFromEntries(post.designReview?.miniCharacters || post.miniCharacters || []);
}

module.exports = {
  contentDaysForPost,
  expectedMiniCharacterDaysForPost,
  normalizeBirthDay,
  topicKind,
  validateMiniCharactersForPost,
};
