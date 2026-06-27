const assert = require('node:assert/strict');

const {
  BIRTHDAY_MONTHLY_TIMES,
  DAILY_BIRTHDAY_REEL_RULE_EFFECTIVE_DATE,
  dailyBirthdayReelTimesForDate,
  isDailyBirthdayReelTimeAllowed,
  validateDailyBirthdayReelSchedule,
} = require('../scripts/social/social-schedule-rules');
const { run: runOpsAudit } = require('../scripts/social/audit-social-operations');

function birthdayReel(date, time, idTime = time.replace(':', '')) {
  return {
    id: `birthday_reel_${date.replaceAll('-', '')}_${idTime}_fixture`,
    kind: 'birthday_reel',
    date,
    time,
  };
}

assert.equal(DAILY_BIRTHDAY_REEL_RULE_EFFECTIVE_DATE, '2026-06-27');

assert.deepEqual(
  dailyBirthdayReelTimesForDate('2026-06-26'),
  ['20:00', '21:00', '22:00'],
  'dates before the explicit rule switch must keep legacy approved manifests valid'
);

assert.deepEqual(
  dailyBirthdayReelTimesForDate('2026-06-27'),
  ['20:00', '21:00', '22:00'],
  'daily birthday reels must use 20:00, 21:00, and 22:00 from 2026-06-27'
);
assert.equal(isDailyBirthdayReelTimeAllowed('2026-06-27', '22:00'), true, '22:00 daily reels must be allowed');
assert.equal(isDailyBirthdayReelTimeAllowed('2026-06-27', '23:00'), false, '23:00 daily reels must be rejected');

assert.deepEqual(
  dailyBirthdayReelTimesForDate('2026-07-02'),
  ['21:00', '22:00'],
  'Thursday 20:00 must stay reserved for comparison carousel'
);
assert.equal(isDailyBirthdayReelTimeAllowed('2026-07-02', '20:00'), false, 'Thursday 20:00 daily reel must be rejected');
assert.equal(isDailyBirthdayReelTimeAllowed('2026-07-02', '22:00'), true, 'Thursday 22:00 daily reel must be allowed');

assert.deepEqual(
  BIRTHDAY_MONTHLY_TIMES,
  ['20:00', '21:00', '22:00', '23:00'],
  'monthly birthday carousel must keep 22:00 separate from daily reels'
);

assert.deepEqual(validateDailyBirthdayReelSchedule(birthdayReel('2026-06-27', '20:00')), []);
assert.deepEqual(validateDailyBirthdayReelSchedule(birthdayReel('2026-06-27', '21:00')), []);
assert.deepEqual(validateDailyBirthdayReelSchedule(birthdayReel('2026-06-27', '22:00')), []);

assert.match(
  validateDailyBirthdayReelSchedule(birthdayReel('2026-06-27', '23:00'))[0],
  /time 23:00 is not allowed/,
  '23:00 daily reel manifests must fail schedule validation'
);
assert.match(
  validateDailyBirthdayReelSchedule(birthdayReel('2026-06-27', '22:00', '2300'))[0],
  /id must include scheduled time fragment _2200_/,
  'post ids must match their scheduled time'
);

async function main() {
  const report = await runOpsAudit(['--from=2026-06-27', '--to=2026-06-28']);
  assert.equal(report.ok, true, 'operations audit must pass for current approved daily reels');
  assert.equal(report.issueCount, 0, 'operations audit must find no current approved daily reel issues');
  assert.deepEqual(report.expectedDailyTimes, ['20:00', '21:00', '22:00']);
  console.log('social-schedule-rules tests passed');
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
