#!/usr/bin/env node
'use strict';

const crypto = require('crypto');

function normalizeBoothOrderReference(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

const references = process.argv.slice(2)
  .map(normalizeBoothOrderReference)
  .filter(Boolean);

if (!references.length) {
  console.error('Usage: node scripts/rashin/hash-booth-order-reference.js <booth-order-number> [more-order-numbers]');
  process.exit(1);
}

references.forEach(reference => {
  const hash = crypto
    .createHash('sha256')
    .update(`booth_order_reference:${reference.toLowerCase()}`)
    .digest('hex');
  console.log(hash);
});
