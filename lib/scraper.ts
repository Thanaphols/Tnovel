import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import os from 'os';
import path from 'path';
import puppeteer from 'puppeteer-core';

export interface ScrapedNovelData {
  title: string;
  authorName: string;
  paragraphs: string[];
  sourceUrl: string;
  coverUrl?: string;
  chapterNumber?: number;
}

export interface ChapterLinkItem {
  chapterNumber: number;
  title: string;
  url: string;
}

export interface ScrapedNovelIndexData {
  title: string;
  authorName: string;
  coverUrl?: string;
  description?: string;
  chapters: ChapterLinkItem[];
}

export interface NovelSiteConfig {
  domain: string;
  titleSelector?: string[];
  authorSelector?: string[];
  contentSelectors: string[];
  tocSelectors: string[];
  usePuppeteer?: boolean;
}

export const NOVEL_SITE_CONFIGS: NovelSiteConfig[] = [
  {
    domain: 'webnovel.com',
    titleSelector: ['h1', '.cha-tit'],
    authorSelector: ['.author-name'],
    contentSelectors: ['.cha-words p', '.chapter-content p'],
    tocSelectors: ['.content-list a', 'a[href*="/chapter-"]', '.volume-item a', 'a[href*="/book/"]'],
    usePuppeteer: true,
  },
  {
    domain: 'royalroad.com',
    titleSelector: ['h1'],
    authorSelector: ['.author-name'],
    contentSelectors: ['.chapter-content p'],
    tocSelectors: ['#chapters-list a', 'table#chapters a', '.chapter-row a'],
  },
  {
    domain: 'wuxiaworld.com',
    titleSelector: ['h1', '.chapter-title'],
    authorSelector: ['.author'],
    contentSelectors: ['.chapter-content p', '#chapter-content p'],
    tocSelectors: ['.chapter-item a', '.chapter-list a'],
    usePuppeteer: true,
  },
  {
    domain: 'scribblehub.com',
    titleSelector: ['h1', '.chapter-title'],
    authorSelector: ['.author-name'],
    contentSelectors: ['#chp_raw p', '.chp_raw p'],
    tocSelectors: ['.toc_a', '.chapter-link'],
  },
];

function getSystemBrowserExecutablePaths(): string[] {
  // Chrome first: puppeteer targets it directly, and headless Edge fails to start outright on
  // some machines — picking Edge just because it exists left the scraper permanently broken.
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH || '',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ];
  return possiblePaths.filter((p) => p && fs.existsSync(p));
}

// What "the page finished rendering" means, per page type. Both lists are paragraph/link
// level on purpose: the wrappers around them ship in the initial HTML, so waiting on a
// wrapper returns immediately and hands back an empty page.
const CONTENT_WAIT_SELECTOR =
  '.cha-words p, .cha-content p, .cha-paragraph, .chapter-content p, #chapter-content p, .entry-content p, .reading-content p, article p';
const TOC_WAIT_SELECTOR =
  '.volume-item li a, .content-list a, .chapter-list a, #chapters-list a, .toc a, table.chapters a';

interface WaitTarget {
  selector: string;
  minCount: number;
}

let sharedBrowser: any = null;
let scraperProfileDir: string | null = null;
let browserIdleTimeout: NodeJS.Timeout | null = null;

function resetBrowserIdleTimer() {
  if (browserIdleTimeout) clearTimeout(browserIdleTimeout);
  // Auto-close browser after 2 minutes of inactivity to save RAM
  browserIdleTimeout = setTimeout(async () => {
    if (sharedBrowser) {
      try {
        await sharedBrowser.close();
      } catch {}
      sharedBrowser = null;
    }
  }, 120000);
}

if (typeof process !== 'undefined') {
  process.on('exit', () => {
    if (sharedBrowser) sharedBrowser.close().catch(() => {});
  });
  process.on('SIGINT', () => {
    if (sharedBrowser) sharedBrowser.close().catch(() => {});
  });
}

async function getSharedBrowser() {
  resetBrowserIdleTimer();

  const isAlive =
    sharedBrowser &&
    (typeof sharedBrowser.isConnected === 'function' ? sharedBrowser.isConnected() : sharedBrowser.connected);
  if (isAlive) {
    return sharedBrowser;
  }
  const candidates = getSystemBrowserExecutablePaths();
  if (candidates.length === 0) {
    throw new Error('ไม่พบ Browser ในเครื่องสำหรับดึงข้อมูลเว็บที่มีระบบป้องกัน');
  }

  // Its own profile, so the scraper never collides with or touches the user's real browser data.
  if (!scraperProfileDir) {
    scraperProfileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noveltrans-scraper-'));
  }

  const failures: string[] = [];
  for (const executablePath of candidates) {
    try {
      sharedBrowser = await puppeteer.launch({
        executablePath,
        headless: 'new' as any,
        userDataDir: scraperProfileDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--no-default-browser-check',
        ],
        defaultViewport: { width: 1920, height: 1080 },
      });
      return sharedBrowser;
    } catch (err: any) {
      failures.push(`${executablePath}: ${String(err.message).split('\n')[0]}`);
      console.warn(`[Puppeteer] could not launch ${executablePath}, trying next browser`);
    }
  }

  throw new Error(`เปิด Browser สำหรับดึงข้อมูลไม่สำเร็จ\n${failures.join('\n')}`);
}

async function fetchHtmlWithPuppeteer(url: string, waitFor?: WaitTarget): Promise<string> {
  resetBrowserIdleTimer();
  const browser = await getSharedBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
    });

    await page.evaluateOnNewDocument(() => {
      (window as any).chrome = { runtime: {} };
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for Cloudflare Turnstile verification if present
    for (let i = 0; i < 15; i++) {
      const isChallenge = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const hasTurnstile = Boolean(
          document.querySelector(
            '#challenge-stage, #challenge-error-text, [name="cf-turnstile-response"], .cf-turnstile, iframe[src*="challenges.cloudflare.com"]'
          )
        );
        const hasBotText =
          bodyText.includes('verifies you are not a bot') ||
          bodyText.includes('Security verification') ||
          bodyText.includes('Just a moment...') ||
          bodyText.includes('Checking your browser');
        return hasTurnstile || hasBotText;
      });

      if (!isChallenge) {
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Wait for what this page type is supposed to render. A chapter page never grows a
    // table of contents and a catalog page never grows paragraphs, so waiting on the wrong
    // one burns the whole timeout and then returns a half-rendered page.
    const target = waitFor || { selector: CONTENT_WAIT_SELECTOR, minCount: 3 };
    try {
      await page.waitForFunction(
        (sel: string, min: number) => document.querySelectorAll(sel).length >= min,
        { timeout: 15000 },
        target.selector,
        target.minCount
      );
    } catch {
      console.warn(`[Puppeteer] "${target.selector}" never reached ${target.minCount} match(es) on ${url}`);
    }

    return await page.content();
  } catch (err: any) {
    console.error(`[Puppeteer Error] ${url}:`, err.message);
    throw err;
  } finally {
    await page.close().catch(() => {});
  }
}

async function fetchHtml(url: string, waitFor?: WaitTarget): Promise<string> {
  const hostname = new URL(url).hostname.toLowerCase();
  const matchedConfig = NOVEL_SITE_CONFIGS.find((cfg) => hostname.includes(cfg.domain));

  if (matchedConfig?.usePuppeteer) {
    return await fetchHtmlWithPuppeteer(url, waitFor);
  }

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
      },
      timeout: 8000,
    });
    return response.data;
  } catch (err: any) {
    if (err.response?.status === 403 || err.response?.status === 503 || err.code === 'ECONNABORTED') {
      return await fetchHtmlWithPuppeteer(url, waitFor);
    }
    throw err;
  }
}

export async function scrapeNovelChapter(url: string): Promise<ScrapedNovelData> {
  const chapterHost = new URL(url).hostname.toLowerCase();
  const chapterConfig = NOVEL_SITE_CONFIGS.find((cfg) => chapterHost.includes(cfg.domain));

  const html = await fetchHtml(url, {
    selector: chapterConfig ? chapterConfig.contentSelectors.join(', ') : CONTENT_WAIT_SELECTOR,
    minCount: 3,
  });
  const $ = cheerio.load(html);

  $(
    'script, style, iframe, nav, header, footer, noscript, .ads, .ad, .social-share, .comments, .sidebar, #sidebar, .nav-links, .j_report_btn, .btn-report, #challenge-stage, #challenge-error-text'
  ).remove();

  const hostname = new URL(url).hostname.toLowerCase();
  const matchedConfig = NOVEL_SITE_CONFIGS.find((cfg) => hostname.includes(cfg.domain));

  let title = '';
  let authorName = '';
  const paragraphs: string[] = [];

  const titleSelectors = matchedConfig?.titleSelector || [
    'h1',
    'h1.chapter-title',
    'h1.entry-title',
    '.chapter-title',
    'title',
  ];
  for (const sel of titleSelectors) {
    const text = $(sel).first().text().trim();
    if (text && !text.includes('Just a moment') && !text.includes('www.webnovel.com') && !text.includes('Security verification')) {
      title = text;
      break;
    }
  }

  const authorSelectors = matchedConfig?.authorSelector || [
    '.author-name',
    'meta[name="author"]',
    '.author',
  ];
  for (const sel of authorSelectors) {
    const text = sel.startsWith('meta') ? $(sel).attr('content')?.trim() : $(sel).first().text().trim();
    if (text) {
      authorName = text;
      break;
    }
  }

  if (!authorName || authorName === 'Unknown Author') {
    const descMeta = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
    const authorMatch = descMeta.match(/written by the author\s+([^,]+)/i) || descMeta.match(/author:\s*([^,\n]+)/i);
    if (authorMatch) {
      authorName = authorMatch[1].trim();
    }
  }

  const contentSelectors = matchedConfig?.contentSelectors || [
    '.cha-words p',
    '.cha-content p',
    '.chapter-content p',
    '.cha-paragraph',
    'p.cha-paragraph',
    '.content-body p',
    '.chapter-content',
    '.entry-content',
    '.reading-content',
    '#chapter-content',
    '#content',
    '.cha-words',
    '.text-left',
    'article',
    '.post-content',
  ];

  const isBotText = (t: string) =>
    /verifies you are not a bot|security service to protect|malicious bots|cloudflare|turnstile|just a moment|enable javascript and cookies/i.test(
      t
    );

  let foundBySelector = false;
  for (const selector of contentSelectors) {
    const els = $(selector);
    if (els.length > 0) {
      els.each((_: number, element: any) => {
        const text = $(element).text().trim();
        if (
          text.length > 3 &&
          !/^next chapter$/i.test(text) &&
          !/^previous chapter$/i.test(text) &&
          !/webnovel/i.test(text) &&
          !/download app/i.test(text) &&
          !isBotText(text)
        ) {
          paragraphs.push(text);
        }
      });
      if (paragraphs.length > 0) {
        foundBySelector = true;
        break;
      }
    }
  }

  if (!foundBySelector || paragraphs.length === 0) {
    $('p').each((_: number, element: any) => {
      const text = $(element).text().trim();
      if (
        text.length > 3 &&
        !/^next chapter$/i.test(text) &&
        !/^previous chapter$/i.test(text) &&
        !/webnovel/i.test(text) &&
        !/download app/i.test(text) &&
        !isBotText(text)
      ) {
        paragraphs.push(text);
      }
    });
  }

  title = title.replace(/\s+/g, ' ').replace(/(Read|Online|Free|Webnovel|Royal Road)/gi, '').trim();
  const chapterMatch = title.match(/chapter\s*(\d+)/i) || url.match(/chapter-?(\d+)/i);
  const chapterNumber = chapterMatch ? parseInt(chapterMatch[1], 10) : 1;

  if (!title || isBotText(title) || title.includes('webnovel.com')) {
    title = `Chapter ${chapterNumber}`;
  }

  authorName = authorName.replace(/^(Author|By):?/i, '').trim() || 'Unknown Author';

  const cleanParagraphs = paragraphs.filter((p) => !isBotText(p));

  return {
    title,
    authorName,
    paragraphs: cleanParagraphs,
    sourceUrl: url,
    chapterNumber,
  };
}

export async function scrapeNovelIndex(url: string): Promise<ScrapedNovelIndexData> {
  const hostname = new URL(url).hostname.toLowerCase();
  let targetIndexUrl = url;

  if (hostname.includes('webnovel.com') && url.includes('/book/')) {
    const bookIdMatch = url.match(/(?:book)\/(?:[^\/]+_)?(\d+)/i);
    if (bookIdMatch) {
      targetIndexUrl = `https://www.webnovel.com/book/${bookIdMatch[1]}/catalog`;
    } else if (!url.includes('/catalog')) {
      targetIndexUrl = url.endsWith('/') ? `${url}catalog` : `${url}/catalog`;
    }
  }

  const indexConfig = NOVEL_SITE_CONFIGS.find((cfg) => hostname.includes(cfg.domain));

  const html = await fetchHtml(targetIndexUrl, {
    selector: indexConfig ? indexConfig.tocSelectors.join(', ') : TOC_WAIT_SELECTOR,
    minCount: 1,
  });
  const $ = cheerio.load(html);

  let title =
    $('h1.novel-title').text().trim() ||
    $('h1.entry-title').text().trim() ||
    $('h1').first().text().trim() ||
    $('title').text().trim();

  title = title
    .replace(/[-|•]?\s*Webnovel.*$/i, '')
    .replace(/\b(Read|Online|Free|Fanfic|Royal Road)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  let authorName =
    $('.author-name').text().trim() ||
    $('meta[name="author"]').attr('content')?.trim() ||
    $('.author').text().trim() ||
    'Unknown Author';
  authorName = authorName.replace(/^(Author|By):?/i, '').trim() || 'Unknown Author';

  if (!authorName || authorName === 'Unknown Author') {
    const descMeta = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
    const authorMatch = descMeta.match(/written by the author\s+([^,]+)/i) || descMeta.match(/author:\s*([^,\n]+)/i);
    if (authorMatch) {
      authorName = authorMatch[1].trim();
    }
  }

  let coverUrl =
    $('meta[property="og:image"]').attr('content') ||
    $('.novel-cover img').attr('src') ||
    $('.cover-art img').attr('src') ||
    $('.g_thumb img').attr('src') ||
    $('img[src*="bookcover"]').attr('src') ||
    $('img[src*="cover"]').attr('src');

  if (coverUrl && !coverUrl.startsWith('http')) {
    try {
      coverUrl = new URL(coverUrl, new URL(url).origin).toString();
    } catch {
      coverUrl = undefined;
    }
  }

  const description =
    $('.description').text().trim() ||
    $('.summary').text().trim() ||
    $('meta[name="description"]').attr('content')?.trim();

  const chapters: ChapterLinkItem[] = [];
  const seenUrls = new Set<string>();
  const parsedOrigin = new URL(url).origin;

  // Specific catalog container selectors first to avoid grabbing header preview / latest chapter duplicates out of order
  const tocSelectors = [
    '.volume-item li a',
    '.chapter-list li a',
    '.contents-item li a',
    '.content-list a',
    '.volume-list a',
    '.volume-item a',
    '#chapters-list a',
    '.chapter-list a',
    '#chapter-list a',
    '.toc a',
    'table.chapters a',
    '.chapters a',
    '.entry-content a',
  ];

  let $links: any = null;
  for (const selector of tocSelectors) {
    const found = $(selector);
    if (found.length > 0) {
      $links = found;
      break;
    }
  }

  if (!$links || $links.length === 0) {
    $links = $('a').filter((_: number, el: any) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text() || '';
      return /\d+_\d+/.test(href) || /chapter/i.test(href) || /chapter\s*\d+/i.test(text);
    });
  }

  $links.each((idx: number, el: any) => {
    let href = $(el).attr('href');
    if (!href) return;

    if (!href.startsWith('http')) {
      try {
        href = new URL(href, parsedOrigin).toString();
      } catch {
        return;
      }
    }

    const rawText = $(el).text().trim();
    if (
      seenUrls.has(href) ||
      href.includes('/catalog') ||
      href.endsWith('/book/' + url.split('/book/')[1]) ||
      /^read$/i.test(rawText) ||
      /^read now$/i.test(rawText) ||
      /^อ่าน$/i.test(rawText) ||
      /^สารบัญ$/i.test(rawText)
    ) {
      return;
    }

    // Clean up timestamps and multiline strings like "1\nThe Hero's Trash Son\n11 months ago"
    let chapTitle = rawText
      .replace(/\s+/g, ' ')
      .replace(/\b\d+\s+(month|day|year|hour|min|sec)s?(\s+ago|\.{2,})?/gi, '')
      .replace(/\b(READ|Read now)\b/gi, '')
      .trim();

    if (!chapTitle) chapTitle = `Chapter ${chapters.length + 1}`;

    seenUrls.add(href);
    chapters.push({
      chapterNumber: chapters.length + 1,
      title: chapTitle,
      url: href,
    });
  });

  return {
    title,
    authorName,
    coverUrl: coverUrl || undefined,
    description: description || undefined,
    chapters,
  };
}
