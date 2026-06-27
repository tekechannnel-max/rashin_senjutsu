const DAILY_BIRTHDAY_REEL_RULE_EFFECTIVE_DATE = '2026-06-27';

const LEGACY_DAILY_BIRTHDAY_REEL_TIMES = ['20:00', '21:00', '22:00'];
const LEGACY_THURSDAY_DAILY_BIRTHDAY_REEL_TIMES = ['21:00', '22:00'];

const DAILY_BIRTHDAY_REEL_TIMES = ['20:00', '21:00', '23:00'];
const THURSDAY_DAILY_BIRTHDAY_REEL_TIMES = ['21:00', '23:00'];

const BIRTHDAY_MONTHLY_TIMES = ['20:00', '21:00', '22:00', '23:00'];
const THURSDAY_COMPARISON_TIME = '20:00';
const THURSDAY = 4;

function dayOfWeek(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function isThursday(dateKey) {
  return dayOfWeek(dateKey) === THURSDAY;
}

function dailyBirthdayReelTimesForDate(dateKey) {
  const useLatestRule = !dateKey || dateKey >= DAILY_BIRTHDAY_REEL_RULE_EFFECTIVE_DATE;
  if (!useLatestRule) {
    return isThursday(dateKey)
      ? LEGACY_THURSDAY_DAILY_BIRTHDAY_REEL_TIMES
      : LEGACY_DAILY_BIRTHDAY_REEL_TIMES;
  }
  return isThursday(dateKey)
    ? THURSDAY_DAILY_BIRTHDAY_REEL_TIMES
    : DAILY_BIRTHDAY_REEL_TIMES;
}

function dailyBirthdayReelTimesLabel(dateKey) {
  return dailyBirthdayReelTimesForDate(dateKey).join(' / ');
}

function isDailyBirthdayReelTimeAllowed(dateKey, time) {
  return dailyBirthdayReelTimesForDate(dateKey).includes(String(time || '').trim());
}

function timeToIdFragment(time) {
  return String(time || '').replace(':', '');
}

function postIdIncludesScheduledTime(post = {}) {
  const expected = timeToIdFragment(post.time);
  return Boolean(expected && String(post.id || '').includes(`_${expected}_`));
}

function validateDailyBirthdayReelSchedule(post = {}, label = 'post') {
  const errors = [];
  if ((post.kind || 'birthday_reel') !== 'birthday_reel') return errors;
  const date = String(post.date || '').trim();
  const time = String(post.time || '').trim();
  if (!date || !time) return errors;
  const allowed = dailyBirthdayReelTimesForDate(date);
  if (!allowed.includes(time)) {
    errors.push(`${label} time ${time} is not allowed for ${date}. Allowed daily birthday reel times: ${allowed.join(', ')}.`);
  }
  if (!postIdIncludesScheduledTime(post)) {
    errors.push(`${label} id must include scheduled time fragment _${timeToIdFragment(time)}_.`);
  }
  return errors;
}

module.exports = {
  BIRTHDAY_MONTHLY_TIMES,
  DAILY_BIRTHDAY_REEL_RULE_EFFECTIVE_DATE,
  DAILY_BIRTHDAY_REEL_TIMES,
  LEGACY_DAILY_BIRTHDAY_REEL_TIMES,
  THURSDAY,
  THURSDAY_COMPARISON_TIME,
  THURSDAY_DAILY_BIRTHDAY_REEL_TIMES,
  dailyBirthdayReelTimesForDate,
  dailyBirthdayReelTimesLabel,
  dayOfWeek,
  isDailyBirthdayReelTimeAllowed,
  isThursday,
  timeToIdFragment,
  validateDailyBirthdayReelSchedule,
};
