const fsSync = require('fs');

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_API_VERSION = 'v23.0';
const DEFAULT_GRAPH_HOST = 'https://graph.instagram.com';
const INSTAGRAM_CHARACTER_LIMIT = 2200;
const LOCAL_MEDIA_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function loadLocalEnv() {
  const file = path.join(ROOT, '.env');
  if (!fsSync.existsSync(file)) return;
  const source = fsSync.readFileSync(file, 'utf8');
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadLocalEnv();

function requireValue(name, value) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizeUsername(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function getInstagramGraphBase() {
  const configured = String(process.env.INSTAGRAM_GRAPH_BASE || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  const version = String(process.env.INSTAGRAM_API_VERSION || DEFAULT_API_VERSION).trim().replace(/^\/+/, '');
  return `${DEFAULT_GRAPH_HOST}/${version}`;
}

function getInstagramCredentials() {
  return {
    graphBase: getInstagramGraphBase(),
    accessToken: String(process.env.INSTAGRAM_ACCESS_TOKEN || '').trim(),
    userId: String(process.env.INSTAGRAM_USER_ID || 'me').trim() || 'me',
    expectedUsername: normalizeUsername(process.env.INSTAGRAM_EXPECTED_USERNAME || ''),
  };
}

function canUsePathUserId(value) {
  const normalized = String(value || '').trim();
  return normalized === 'me' || /^\d+$/.test(normalized);
}

function requireInstagramEnabled() {
  if (process.env.INSTAGRAM_ENABLED !== 'true') {
    throw new Error('Instagram posting is disabled. Set INSTAGRAM_ENABLED=true before real Instagram posting.');
  }
}

function requireInstagramCredentials(credentials) {
  requireValue('INSTAGRAM_ACCESS_TOKEN', credentials.accessToken);
  requireValue('INSTAGRAM_USER_ID', credentials.userId);
}

function ensureInstagramCaption(text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Instagram caption is empty.');
  const length = [...value].length;
  if (length > INSTAGRAM_CHARACTER_LIMIT) {
    throw new Error(`Instagram caption is too long: ${length}/${INSTAGRAM_CHARACTER_LIMIT} characters`);
  }
  return value;
}

function ensurePublicImageUrl(imageUrl) {
  const value = String(imageUrl || '').trim();
  if (!value) throw new Error('Instagram image_url is empty.');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Instagram image_url must be http or https: ${value}`);
  }
  if (LOCAL_MEDIA_HOSTS.has(parsed.hostname)) {
    throw new Error(`Instagram cannot fetch local image URLs. Set PUBLIC_ORIGIN to a public HTTPS site: ${value}`);
  }
  if (!/\.(jpe?g)$/i.test(parsed.pathname) && process.env.INSTAGRAM_ALLOW_NON_JPEG !== 'true') {
    throw new Error(`Instagram feed image publishing expects a JPEG image_url: ${value}`);
  }
  return value;
}

function ensurePublicVideoUrl(videoUrl) {
  const value = String(videoUrl || '').trim();
  if (!value) throw new Error('Instagram video_url is empty.');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Instagram video_url must be http or https: ${value}`);
  }
  if (LOCAL_MEDIA_HOSTS.has(parsed.hostname)) {
    throw new Error(`Instagram cannot fetch local video URLs. Set PUBLIC_ORIGIN to a public HTTPS site: ${value}`);
  }
  if (!/\.(mp4|mov)$/i.test(parsed.pathname) && process.env.INSTAGRAM_ALLOW_UNKNOWN_VIDEO_EXT !== 'true') {
    throw new Error(`Instagram video publishing expects an mp4 or mov video_url: ${value}`);
  }
  return value;
}

function normalizeAltText(altText) {
  return String(altText || '').trim();
}

function inferMediaTypeFromUrl(url) {
  const pathname = new URL(String(url || '').trim()).pathname;
  if (/\.(mp4|mov)$/i.test(pathname)) return 'VIDEO';
  return 'IMAGE';
}

function normalizeCarouselMediaItems(mediaItems, altTexts = []) {
  if (Array.isArray(mediaItems) && mediaItems.length) {
    return mediaItems.map((item, index) => {
      if (typeof item === 'string') {
        return {
          type: inferMediaTypeFromUrl(item),
          url: item,
          altText: Array.isArray(altTexts) ? altTexts[index] || '' : '',
        };
      }
      const url = item.url || item.imageUrl || item.videoUrl || '';
      return {
        type: String(item.type || item.mediaType || inferMediaTypeFromUrl(url)).toUpperCase(),
        url,
        altText: item.altText || (Array.isArray(altTexts) ? altTexts[index] || '' : ''),
      };
    });
  }
  return [];
}

function ensureCarouselMediaItems(mediaItems, altTexts = []) {
  const items = normalizeCarouselMediaItems(mediaItems, altTexts);
  if (items.length < 2 || items.length > 10) {
    throw new Error(`Instagram carousel requires 2-10 media items: ${items.length}`);
  }
  return items.map(item => {
    if (item.type === 'IMAGE') {
      return { ...item, url: ensurePublicImageUrl(item.url) };
    }
    if (item.type === 'VIDEO') {
      return { ...item, url: ensurePublicVideoUrl(item.url) };
    }
    throw new Error(`Unsupported Instagram carousel media type: ${item.type}`);
  });
}

function ensureCarouselImageUrls(imageUrls) {
  return ensureCarouselMediaItems(imageUrls).map(item => item.url);
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || json?.message || JSON.stringify(json);
    throw new Error(`Instagram API request failed: ${res.status} ${message}`);
  }
  return json;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getInstagramMe(credentials = null) {
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  const params = new URLSearchParams({
    fields: 'id,username,account_type,media_count',
    access_token: creds.accessToken,
  });
  return requestJson(`${creds.graphBase}/me?${params.toString()}`);
}

async function resolveInstagramUserId(credentials = null) {
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  if (canUsePathUserId(creds.userId)) return creds.userId;
  const me = await getInstagramMe(creds);
  return requireValue('Instagram user id from /me', me.id);
}

async function listInstagramMedia({ limit = 25, credentials = null } = {}) {
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  const userId = await resolveInstagramUserId(creds);
  const params = new URLSearchParams({
    fields: 'id,caption,permalink,timestamp,media_type',
    limit: String(limit),
    access_token: creds.accessToken,
  });
  return requestJson(`${creds.graphBase}/${encodeURIComponent(userId)}/media?${params.toString()}`);
}

async function getInstagramMedia(mediaId, credentials = null) {
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  const params = new URLSearchParams({
    fields: 'id,caption,permalink,timestamp,media_type',
    access_token: creds.accessToken,
  });
  return requestJson(`${creds.graphBase}/${encodeURIComponent(mediaId)}?${params.toString()}`);
}

async function getInstagramContainerStatus(containerId, credentials = null) {
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  const params = new URLSearchParams({
    fields: 'status_code,status',
    access_token: creds.accessToken,
  });
  return requestJson(`${creds.graphBase}/${encodeURIComponent(containerId)}?${params.toString()}`);
}

async function waitForInstagramContainer(containerId, { credentials = null, timeoutMs = 300000, intervalMs = 60000 } = {}) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started <= timeoutMs) {
    last = await getInstagramContainerStatus(containerId, credentials);
    const status = String(last.status_code || last.status || '').toUpperCase();
    if (['FINISHED', 'PUBLISHED'].includes(status)) return last;
    if (['ERROR', 'EXPIRED'].includes(status)) {
      throw new Error(`Instagram media container ${containerId} failed with status ${status}: ${last.status || 'no status detail'}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Instagram media container ${containerId} was not ready within ${timeoutMs}ms. Last status: ${JSON.stringify(last)}`);
}

async function assertExpectedInstagramAccount(credentials = null) {
  const creds = credentials || getInstagramCredentials();
  const expected = normalizeUsername(creds.expectedUsername);
  if (!expected) {
    if (process.env.INSTAGRAM_ALLOW_ANY_ACCOUNT === 'true') return getInstagramMe(creds);
    throw new Error('Set INSTAGRAM_EXPECTED_USERNAME=sensai_teke before real Instagram posting.');
  }
  const me = await getInstagramMe(creds);
  const actual = normalizeUsername(me.username);
  if (actual !== expected) {
    throw new Error(`Instagram token belongs to @${actual || 'unknown'}, expected @${expected}.`);
  }
  if (canUsePathUserId(creds.userId) && creds.userId !== 'me' && me.id && String(me.id) !== String(creds.userId)) {
    throw new Error(`INSTAGRAM_USER_ID is ${creds.userId}, but the token reports ${me.id}.`);
  }
  return me;
}

async function createInstagramImageContainer({ text, imageUrl, altText = '', credentials = null }) {
  requireInstagramEnabled();
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  const userId = await resolveInstagramUserId(creds);
  const body = new URLSearchParams({
    image_url: ensurePublicImageUrl(imageUrl),
    caption: ensureInstagramCaption(text),
    access_token: creds.accessToken,
  });
  const normalizedAltText = normalizeAltText(altText);
  if (normalizedAltText) body.set('alt_text', normalizedAltText);
  return requestJson(`${creds.graphBase}/${encodeURIComponent(userId)}/media`, { method: 'POST', body });
}

async function createInstagramCarouselItemContainer({ imageUrl, videoUrl = '', mediaType = '', altText = '', credentials = null }) {
  requireInstagramEnabled();
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  const userId = await resolveInstagramUserId(creds);
  const type = String(mediaType || (videoUrl ? 'VIDEO' : 'IMAGE')).toUpperCase();
  const body = new URLSearchParams({
    is_carousel_item: 'true',
    access_token: creds.accessToken,
  });
  if (type === 'IMAGE') {
    body.set('image_url', ensurePublicImageUrl(imageUrl));
  } else if (type === 'VIDEO') {
    body.set('media_type', 'VIDEO');
    body.set('video_url', ensurePublicVideoUrl(videoUrl || imageUrl));
  } else {
    throw new Error(`Unsupported Instagram carousel item media_type: ${type}`);
  }
  const normalizedAltText = normalizeAltText(altText);
  if (normalizedAltText) body.set('alt_text', normalizedAltText);
  return requestJson(`${creds.graphBase}/${encodeURIComponent(userId)}/media`, { method: 'POST', body });
}

async function createInstagramCarouselContainer({ text, children, credentials = null }) {
  requireInstagramEnabled();
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  const userId = await resolveInstagramUserId(creds);
  const childIds = Array.isArray(children) ? children.map(String).filter(Boolean) : [];
  if (childIds.length < 2 || childIds.length > 10) {
    throw new Error(`Instagram carousel container requires 2-10 child containers: ${childIds.length}`);
  }
  const body = new URLSearchParams({
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption: ensureInstagramCaption(text),
    access_token: creds.accessToken,
  });
  return requestJson(`${creds.graphBase}/${encodeURIComponent(userId)}/media`, { method: 'POST', body });
}

async function createInstagramReelContainer({ text, videoUrl, shareToFeed = true, credentials = null }) {
  requireInstagramEnabled();
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  const userId = await resolveInstagramUserId(creds);
  const body = new URLSearchParams({
    media_type: 'REELS',
    video_url: ensurePublicVideoUrl(videoUrl),
    caption: ensureInstagramCaption(text),
    share_to_feed: shareToFeed ? 'true' : 'false',
    access_token: creds.accessToken,
  });
  return requestJson(`${creds.graphBase}/${encodeURIComponent(userId)}/media`, { method: 'POST', body });
}

async function publishInstagramContainer(creationId, credentials = null) {
  requireInstagramEnabled();
  const creds = credentials || getInstagramCredentials();
  requireInstagramCredentials(creds);
  const userId = await resolveInstagramUserId(creds);
  const body = new URLSearchParams({
    creation_id: requireValue('Instagram creation_id', creationId),
    access_token: creds.accessToken,
  });
  return requestJson(`${creds.graphBase}/${encodeURIComponent(userId)}/media_publish`, { method: 'POST', body });
}

async function postImageToInstagram({ text, imageUrl, altText = '', waitMs = null, credentials = null }) {
  const creds = credentials || getInstagramCredentials();
  requireInstagramEnabled();
  await assertExpectedInstagramAccount(creds);
  const created = await createInstagramImageContainer({ text, imageUrl, altText, credentials: creds });
  await waitForInstagramContainer(created.id, {
    credentials: creds,
    timeoutMs: waitMs === null ? Number(process.env.INSTAGRAM_CONTAINER_TIMEOUT_MS || 300000) : Number(waitMs),
    intervalMs: Number(process.env.INSTAGRAM_CONTAINER_POLL_MS || 60000),
  });
  const published = await publishInstagramContainer(created.id, creds);
  const media = await getInstagramMedia(published.id, creds);
  return { ...published, permalink: media.permalink, verified: Boolean(media.id), media };
}

async function postCarouselToInstagram({ text, imageUrls, mediaItems = [], altTexts = [], waitMs = null, credentials = null }) {
  const creds = credentials || getInstagramCredentials();
  requireInstagramEnabled();
  await assertExpectedInstagramAccount(creds);
  const items = ensureCarouselMediaItems(mediaItems.length ? mediaItems : imageUrls, altTexts);
  const timeoutMs = waitMs === null ? Number(process.env.INSTAGRAM_CONTAINER_TIMEOUT_MS || 300000) : Number(waitMs);
  const intervalMs = Number(process.env.INSTAGRAM_CONTAINER_POLL_MS || 60000);
  const children = [];
  for (let index = 0; index < items.length; index += 1) {
    const created = await createInstagramCarouselItemContainer({
      mediaType: items[index].type,
      imageUrl: items[index].type === 'IMAGE' ? items[index].url : '',
      videoUrl: items[index].type === 'VIDEO' ? items[index].url : '',
      altText: items[index].altText || '',
      credentials: creds,
    });
    await waitForInstagramContainer(created.id, { credentials: creds, timeoutMs, intervalMs });
    children.push(created.id);
  }
  const carousel = await createInstagramCarouselContainer({ text, children, credentials: creds });
  await waitForInstagramContainer(carousel.id, { credentials: creds, timeoutMs, intervalMs });
  const published = await publishInstagramContainer(carousel.id, creds);
  const media = await getInstagramMedia(published.id, creds);
  return { ...published, permalink: media.permalink, verified: Boolean(media.id), media, carouselChildren: children };
}

async function postReelToInstagram({ text, videoUrl, shareToFeed = true, waitMs = null, credentials = null }) {
  const creds = credentials || getInstagramCredentials();
  requireInstagramEnabled();
  await assertExpectedInstagramAccount(creds);
  const timeoutMs = waitMs === null ? Number(process.env.INSTAGRAM_CONTAINER_TIMEOUT_MS || 300000) : Number(waitMs);
  const intervalMs = Number(process.env.INSTAGRAM_CONTAINER_POLL_MS || 60000);
  const created = await createInstagramReelContainer({ text, videoUrl, shareToFeed, credentials: creds });
  await waitForInstagramContainer(created.id, { credentials: creds, timeoutMs, intervalMs });
  const published = await publishInstagramContainer(created.id, creds);
  const media = await getInstagramMedia(published.id, creds);
  return { ...published, permalink: media.permalink, verified: Boolean(media.id), media, reelContainer: created.id };
}

module.exports = {
  INSTAGRAM_CHARACTER_LIMIT,
  getInstagramCredentials,
  getInstagramGraphBase,
  normalizeUsername,
  resolveInstagramUserId,
  ensureInstagramCaption,
  ensurePublicImageUrl,
  ensurePublicVideoUrl,
  normalizeAltText,
  ensureCarouselImageUrls,
  ensureCarouselMediaItems,
  getInstagramMe,
  listInstagramMedia,
  getInstagramMedia,
  getInstagramContainerStatus,
  waitForInstagramContainer,
  assertExpectedInstagramAccount,
  createInstagramImageContainer,
  createInstagramCarouselItemContainer,
  createInstagramCarouselContainer,
  createInstagramReelContainer,
  publishInstagramContainer,
  postImageToInstagram,
  postCarouselToInstagram,
  postReelToInstagram,
};
