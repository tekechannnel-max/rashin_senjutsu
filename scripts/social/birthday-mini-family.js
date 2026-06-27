const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const BIRTHDAY_MINI_ASSET_DIR = path.join(ROOT, 'images', 'social', 'instagram', 'birthday-mini');

const BIRTHDAY_MINI_FAMILY_DAYS = Object.freeze({
  1: Object.freeze([1, 10, 19, 28]),
  2: Object.freeze([2, 11, 20, 29]),
  3: Object.freeze([3, 12, 21, 30]),
  4: Object.freeze([4, 13, 22, 31]),
  5: Object.freeze([5, 14, 23]),
  6: Object.freeze([6, 15, 24]),
  7: Object.freeze([7, 16, 25]),
  8: Object.freeze([8, 17, 26]),
  9: Object.freeze([9, 18, 27]),
});

function birthdayMiniFamilyForDay(day) {
  const value = Number(day);
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`Birth day must be an integer from 1 to 31: ${day}`);
  }
  let family = value;
  while (family > 9) {
    family = String(family).split('').reduce((sum, digit) => sum + Number(digit), 0);
  }
  return family;
}

function birthdayMiniAssetNameForDay(day) {
  return `birthday-family-${birthdayMiniFamilyForDay(day)}-chibi.png`;
}

function birthdayMiniAssetPathForDay(day, options = {}) {
  const relativePath = path.join(
    'images',
    'social',
    'instagram',
    'birthday-mini',
    birthdayMiniAssetNameForDay(day)
  ).replace(/\\/g, '/');
  return options.absolute ? path.join(ROOT, relativePath) : relativePath;
}

module.exports = {
  BIRTHDAY_MINI_ASSET_DIR,
  BIRTHDAY_MINI_FAMILY_DAYS,
  birthdayMiniAssetNameForDay,
  birthdayMiniAssetPathForDay,
  birthdayMiniFamilyForDay,
};
