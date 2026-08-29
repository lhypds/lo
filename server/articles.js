// The reading behind a headline, fetched once and kept, so a row on the
// dashboard opens into the story instead of into somebody else's website.
//
// This exists because the obvious way — framing the page — is not available.
// Newspapers send X-Frame-Options and frame-ancestors, and lo cannot ask a
// cross-origin frame whether it came up empty, so a sheet built on an iframe
// shows the browser's apology about as often as it shows an article. What is
// left is to take the words out of the page on the server and render them here,
// which also means the sheet opens at lo's speed rather than at a news site's,
// and carries none of its trackers.
//
// Nothing here happens until a reader presses a row. A list of twenty headlines
// is twenty stories nineteen of which nobody will open, and reading them all on
// the chance would spend sixty requests on somebody else's newspapers, every
// half hour, for every corner of the map anyone stands in — to fill a store
// mostly with things never read. So a story is fetched when it is asked for and
// kept once it has been: the first reader waits a second for it, everyone after
// that does not.
//
// Two things are stored, in two places, because they are asked for in two very
// different ways. The whole reading is a document — read once, whole, by exactly
// one reader who opened one row — so it is a file, one JSON per article. What a
// list needs is four short columns: that is a database row (see db.js). The row
// carries a preview and the file name; nothing ever selects a body out of SQLite.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rememberArticle, findArticle } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const articlesDir = path.resolve(__dirname, "..", "data", "articles");

// A real browser's, not lo's own. This is the one place in the server that asks
// a publisher rather than an API for something, and a good many of them answer a
// bare script with a consent wall or a 403 — the same page a person would be
// shown is the page being asked for.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const FETCH_TIMEOUT_MS = 12000;
// Below this a "successful" extraction is a cookie banner or a paywall's lede,
// not an article. Stored all the same — a paragraph of a story is worth more
// than an empty sheet — but marked, so the reader is offered the original.
const THIN_CHARS = 600;
const PREVIEW_CHARS = 280;

async function getPage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en,ja;q=0.9,zh;q=0.8,fr;q=0.7,es;q=0.6,de;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${new URL(url).host} returned HTTP ${response.status}`);
  return response.text();
}

/* ------------------------------------------------- resolving a Google link -- */

// Google News hands out its own address for every story — news.google.com/rss/
// articles/CBMi… — and will not redirect it to the publisher. The id inside is
// not an encoded URL either; since 2024 it is an opaque handle, and the only way
// back to the article is to ask Google to translate it.
//
// That translation is a signed call: the article page carries a signature and a
// timestamp, and the pair is spent on one batchexecute request. Fragile by
// nature — it is Google's own internal call, and nothing promises it will keep
// working — so every failure here is soft. A story whose address will not
// resolve is a story lo has no content for, which is a row that opens the
// original in a tab, not an error.
const GOOGLE_NEWS_HOST = "news.google.com";
const BATCH_URL = "https://news.google.com/_/DotsSplashUi/data/batchexecute";

export function isGoogleNewsLink(url) {
  try {
    return new URL(url).hostname === GOOGLE_NEWS_HOST;
  } catch {
    return false;
  }
}

// The request Google's own front end makes. Every "X" and every bare number is
// a field the answer does not depend on — the three that matter are the article
// id and the signature pair the page was served with.
function garturlreq(id, timestamp, signature) {
  const envelope = [
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id,
    timestamp,
    signature,
  ];
  return new URLSearchParams({
    "f.req": JSON.stringify([[["Fbv4je", JSON.stringify(envelope), null, "generic"]]]),
  });
}

export async function resolveGoogleNews(link) {
  // The id is the last segment of the address lo already has. Read from there
  // rather than from the page, because the attribute that repeats it is missing
  // on a good half of them while the signature pair is always present.
  const id = new URL(link).pathname.replace(/\/$/, "").split("/").pop();
  if (!id) return null;

  const page = await getPage(link);
  const signature = /data-n-a-sg="([^"]+)"/.exec(page)?.[1];
  const timestamp = /data-n-a-ts="([^"]+)"/.exec(page)?.[1];
  if (!signature || !timestamp) return null;

  const response = await fetch(BATCH_URL, {
    method: "POST",
    headers: {
      "User-Agent": BROWSER_UA,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: garturlreq(id, Number(timestamp), signature),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  // The body opens with an anti-hijacking prelude — )]}' and a length — before
  // the JSON, and the payload inside is itself a JSON string.
  const body = await response.text();
  const start = body.indexOf("[");
  if (start < 0) return null;
  try {
    for (const row of JSON.parse(body.slice(start))) {
      if (row[0] !== "wrb.fr" || typeof row[2] !== "string") continue;
      const payload = JSON.parse(row[2]);
      if (typeof payload[1] === "string" && /^https?:\/\//.test(payload[1])) return payload[1];
    }
  } catch {
    return null;
  }
  return null;
}

/* -------------------------------------------------------------- extraction -- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (whole, name) => ENTITIES[name] ?? whole);
}

function textOf(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

// Everything that is on the page but is not the page: navigation, the masthead,
// the share rail, the "more from us" gutter. Taken out before the paragraphs are
// counted, so a story is not judged long because the footer is.
function stripFurniture(html) {
  return html
    .replace(/<(script|style|noscript|svg|iframe|form|aside|nav|header|footer|figure)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function metaContent(html, names) {
  for (const name of names) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*content=["']([^"']*)`,
      "i",
    );
    const match = pattern.exec(html);
    if (match?.[1]) return decodeEntities(match[1]).trim();
    // Half the web writes the two attributes the other way round.
    const reversed = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${name}["']`,
      "i",
    );
    const back = reversed.exec(html);
    if (back?.[1]) return decodeEntities(back[1]).trim();
  }
  return null;
}

function publishedAt(html) {
  const meta = metaContent(html, [
    "article:published_time",
    "og:article:published_time",
    "datePublished",
    "parsely-pub-date",
    "pubdate",
  ]);
  const raw = meta ?? /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

// Whether the publisher says outright that this is not free to read. Worth
// asking, because a paywalled page still serves its opening paragraph and would
// otherwise look like a short article rather than a locked one.
function paywalled(html) {
  return /"isAccessibleForFree"\s*:\s*"?false/i.test(html);
}

// A paragraph that is really a link — a related story, "follow us on", the
// next headline down the rail. Papers set these as <p> like any other, long
// enough to pass the length filter, and they arrive at the end of the story
// where they read as the last thing the article had to say.
//
// What separates them from prose is not their words but their markup: a
// paragraph of writing may contain a link, and one of these is a link. So the
// test is what is left when the anchors are taken out — nearly nothing.
function mostlyLink(inner) {
  const whole = textOf(inner).length;
  if (whole === 0) return true;
  const unlinked = textOf(inner.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " ")).length;
  return unlinked / whole < 0.3;
}

// The story, as paragraphs. Deliberately not a DOM parse and not a scoring
// engine: <p> elements with real sentences in them are what a news article is
// made of, and everything that is not one — bylines, captions, "read more",
// cookie notices — is short, which is most of the filter. It gets the body of a
// straightforward news page and does not pretend to more than that.
function paragraphs(html) {
  const body = stripFurniture(html);
  return [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .filter(([, inner]) => !mostlyLink(inner))
    .map(([, inner]) => textOf(inner))
    .filter((line) => line.length > 40);
}

export function extractArticle(html, url) {
  const lines = paragraphs(html);
  const chars = lines.reduce((total, line) => total + line.length, 0);
  const heading =
    metaContent(html, ["og:title", "twitter:title"]) ??
    textOf(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "") ??
    null;
  return {
    url,
    title: heading || null,
    published: publishedAt(html),
    // The masthead as the publisher writes it, falling back to the hostname.
    site: metaContent(html, ["og:site_name"]) || new URL(url).hostname.replace(/^www\./, ""),
    paragraphs: lines,
    chars,
    paywalled: paywalled(html),
    // The reader is told when what arrived is only the top of the story, so the
    // sheet can say so and point at the original rather than trailing off.
    partial: chars < THIN_CHARS,
  };
}

/* ----------------------------------------------------------------- storage -- */

// Named after the address the *feed* gave, not the publisher's — see the note
// on the table in db.js. The card is holding the feed link and nothing else, so
// this is the one digest it can work out for itself, which is what lets a row
// say "there is a reading for this" without asking the server first.
export function articleId(link) {
  return crypto.createHash("sha256").update(link).digest("hex").slice(0, 32);
}

const ID_RE = /^[0-9a-f]{32}$/;

export function isArticleId(value) {
  return typeof value === "string" && ID_RE.test(value);
}

function articleFile(id) {
  return path.join(articlesDir, `${id}.json`);
}

// The first stretch of the story, which is all a list needs. Kept in the row so
// the card can show a line under a headline without opening the file.
function previewOf(lines) {
  const opening = lines.join(" ");
  if (opening.length <= PREVIEW_CHARS) return opening;
  return `${opening.slice(0, PREVIEW_CHARS).trimEnd()}…`;
}

export async function readStoredArticle(id) {
  if (!isArticleId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(articleFile(id), "utf8"));
  } catch {
    return null;
  }
}

// The document to disk, the four columns to SQLite. Written in that order on
// purpose: a row promising a file that is not there yet is the one failure this
// cannot recover from by trying again.
export async function storeArticle(article, { kind, link, headline, source, time }) {
  const id = articleId(link);
  const document = {
    id,
    kind,
    link,
    url: article.url,
    // The publisher's own headline where there is one; the feed's where there
    // is not. They differ more often than you would think, and the page's is
    // the one that matches the words underneath it.
    title: article.title || headline || null,
    source: source || article.site,
    published: article.published || time || null,
    paragraphs: article.paragraphs,
    paywalled: article.paywalled,
    partial: article.partial,
    fetchedAt: new Date().toISOString(),
  };

  await fs.mkdir(articlesDir, { recursive: true });
  await fs.writeFile(articleFile(id), JSON.stringify(document, null, 2));

  rememberArticle({
    id,
    kind,
    link,
    url: document.url,
    title: document.title,
    source: document.source,
    preview: previewOf(article.paragraphs),
    published_at: document.published,
    chars: article.chars,
    partial: document.partial ? 1 : 0,
  });

  return document;
}

/* ------------------------------------------------------------------ harvest -- */

// A feed row to a stored article: resolve Google's address to the publisher's,
// fetch the page, take the words out, keep both halves. Called from the endpoint
// when a row is pressed, so a reader is waiting on it — which is why the first
// thing it does is look for one already kept. Every step is allowed to fail and
// the failure is the same answer — null, meaning lo has no reading for this row
// and the sheet should offer the original instead.
export async function harvest({ url, title, source, time, kind = "news" }) {
  // Only ever a Google News address, which every row on both cards is. This is
  // the gate rather than a nicety: the endpoint in front of this takes a link
  // from the query string, and a harvester that fetched whatever it was handed
  // would make lo a proxy for anything anyone could name — a metadata service on
  // the machine it runs on included. What comes back from Google is fetched too,
  // but that address is Google's answer rather than the caller's.
  if (!isGoogleNewsLink(url)) return null;

  const known = findArticle(articleId(url));
  if (known) return known;

  try {
    const target = await resolveGoogleNews(url);
    if (!target || !/^https?:$/.test(new URL(target).protocol)) return null;

    // Google appends its own campaign tags to the address it hands back, and
    // they are not part of the article. The gaa_ pair is deliberately left on:
    // those look like tracking and are not — they are Showcase access tokens,
    // and on a publisher that takes them they are the difference between the
    // article and its first paragraph.
    const clean = new URL(target);
    for (const key of [...clean.searchParams.keys()]) {
      if (/^(utm_|ns_)/.test(key)) clean.searchParams.delete(key);
    }

    const html = await getPage(clean.href);
    const article = extractArticle(html, clean.href);
    if (article.paragraphs.length === 0) return null;
    await storeArticle(article, { kind, link: url, headline: title, source, time });
    return findArticle(articleId(url));
  } catch {
    return null;
  }
}
