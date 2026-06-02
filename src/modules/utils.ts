import * as fs from 'fs/promises';
import * as path from 'path';
import type { BrowserContext, Page } from 'playwright';

export async function saveCookies(context: BrowserContext) {
  const cookies = await context.cookies();
  await fs.writeFile(path.join(process.cwd(), 'cookies.json'), JSON.stringify(cookies, null, 2));
}

export async function loadCookies(context: BrowserContext) {
  const cookiePath = path.join(process.cwd(), 'cookies.json');
  if (await fs.access(cookiePath).catch(() => false)) {
    const cookies = JSON.parse(await fs.readFile(cookiePath, 'utf8'));
    await context.addCookies(cookies);
  }
}

export async function saveLocalStorage(page: Page) {
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  await fs.writeFile(path.join(process.cwd(), 'localstorage.json'), storage);
}

export async function loadLocalStorage(page: Page) {
  const storagePath = path.join(process.cwd(), 'localstorage.json');
  if (await fs.access(storagePath).catch(() => false)) {
    const storage = JSON.parse(await fs.readFile(storagePath, 'utf8'));
    await page.evaluate((s) => {
      for (const [key, value] of Object.entries(s)) {
        localStorage.setItem(key, value as string);
      }
    }, storage);
  }
}

export async function safeGoto(page: Page, url: string, options = { waitUntil: 'load' as const, timeout: 30000 }, retryCount = 0): Promise<void> {
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      await page.goto(url, options);
      return;
    } catch (e) {
      if (attempt === retryCount) throw e;
      console.warn(`[safeGoto] Retry ${attempt + 1}/${retryCount} for ${url}`);
      await page.waitForTimeout(1000);
    }
  }
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function maskToken(token: string) {
  return token.replace(/.(?=.{4})/g, '*');
}

export async function ensureLoggedIn({ page, context }: { page: Page; context: BrowserContext }): Promise<void> {
  // launchPersistentContext 사용 시 브라우저가 자동으로 세션 관리
  // 수동 쿠키 로드 불필요
}

export async function sendTelegram(text: string, imagePath: string | null = null) {
  console.log('[Telegram Stub] ' + text);
}

export async function sendNotificationToChannel(text: string, imagePath: string | null = null) {
  console.log('[Telegram Channel Stub] ' + text);
}

export function escapeMarkdownV2(text: string) {
  return text.replace(/([\_\*\[\]\(\)\~\`\>\#\+\-=｜\{\}\.]\s*)/g, '\\$1');
}
