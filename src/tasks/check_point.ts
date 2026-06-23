import path from 'path';
import fs from 'fs/promises';
import type { BrowserContext, Page } from 'playwright';
import type { PlaywrightRunArgs } from '../types';
import { safeGoto, ensureLoggedIn } from '../modules/utils';
import * as logger from '../services/logger';

interface PointHistoryRow {
  date: string;      // "2026.06.23"
  site: string;      // "닥터빌"
  desc: string;      // "6/12 설문 포인트 5311"
  type: '적립' | '사용';
  amount: string;   // "(+) 4,000P" / "(-) 5,000P"
  expires?: string; // "2027.06.30" (적립만)
}

function parseRow(cells: string[]): PointHistoryRow | null {
  if (cells.length < 4) return null;
  const amount = cells[4] || '';
  const type = cells[3]?.trim() as '적립' | '사용';
  if (type !== '적립' && type !== '사용') return null;
  return {
    date: cells[0]?.trim() || '',
    site: cells[1]?.trim() || '',
    desc: cells[2]?.trim() || '',
    type,
    amount,
    expires: type === '적립' && cells[5] ? cells[5].trim() : undefined,
  };
}

function formatHistory(rows: PointHistoryRow[]): string {
  if (rows.length === 0) return '내역 없음';
  const deposits = rows.filter(r => r.type === '적립').slice(0, 5);
  const spends   = rows.filter(r => r.type === '사용').slice(0, 5);

  const parts: string[] = [];

  if (deposits.length > 0) {
    parts.push('📥 적립 내역');
    for (const r of deposits) {
      const expires = r.expires ? ` (만료 ${r.expires})` : '';
      parts.push(`  ${r.date}  ${r.desc}  ${r.amount}${expires}`);
    }
  }

  if (spends.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push('📤 사용 내역');
    for (const r of spends) {
      parts.push(`  ${r.date}  ${r.desc}  ${r.amount}`);
    }
  }

  return parts.join('\n');
}

async function extractCurrentPoint(page: Page): Promise<string> {
  const raw = (await page.locator('.member_point').first().textContent()) || '';
  return raw.replace(/\s+/g, '').trim(); // "85,400P"
}

async function extractHistory(page: Page, limitRows = 10): Promise<PointHistoryRow[]> {
  // 테이블 tbody의 tr만 추출 (마지막tr=합계행 제외)
  const rows: PointHistoryRow[] = [];
  const tableRows = page.locator('table tbody tr');
  const count = await tableRows.count();

  for (let i = 0; i < count && rows.length < limitRows; i++) {
    const cells = tableRows.nth(i).locator('td');
    const cellCount = await cells.count();
    // 적립행은 6개td, 사용행은 5개td (마지막td에 만료일 없음)
    const cellTexts: string[] = [];
    for (let j = 0; j < cellCount; j++) {
      cellTexts.push((await cells.nth(j).textContent() || '').replace(/\s+/g, ' ').trim());
    }
    const parsed = parseRow(cellTexts);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

async function getPoint(context: BrowserContext): Promise<string> {
  const page = await context.newPage();
  try {
    const MAIN_PAGE = 'https://www.doctorville.co.kr/main';
    await safeGoto(page, MAIN_PAGE, { waitUntil: 'load', timeout: 30000 }, 1);
    await page.waitForSelector('.member_point', { timeout: 10000 });
    return (await page.locator('.member_point').first().textContent()) || '';
  } catch (error) {
    logger.error(
      'getPoint error',
      error && typeof error === 'object' && 'stack' in error ? (error as Error).stack : error,
    );
    return '조회 실패';
  } finally {
    await page.close().catch(() => {});
  }
}

async function run({ page, context }: PlaywrightRunArgs) {
  let screenshotPath: string | null = null;
  const ctx = context || page.context();

  try {
    // 상세 조회: 포인트 텍스트 클릭 → 내역 페이지 → 내역 파싱
    const tempPage = await ctx.newPage();
    try {
      const MAIN_PAGE = 'https://www.doctorville.co.kr/main';
      await safeGoto(tempPage, MAIN_PAGE, { waitUntil: 'load', timeout: 30000 }, 1);
      await tempPage.waitForSelector('.member_point', { timeout: 10000 });
      const current = await extractCurrentPoint(tempPage);

      await tempPage.locator('.member_point').first().click();
      await tempPage.waitForURL('**/pointUseHistoryList', { timeout: 10000 });
      await tempPage.waitForSelector('table tbody tr', { timeout: 10000 });
      const history = await extractHistory(tempPage, 10);

      const historyText = formatHistory(history);
      return {
        success: true,
        message: `현재 포인트: ${current}\n\n${historyText}`,
      };
    } finally {
      await tempPage.close().catch(() => {});
    }
  } catch (error) {
    logger.error(
      'check_point task error',
      error && typeof error === 'object' && 'stack' in error ? (error as Error).stack : error,
    );
    const baseScreenshotDir = path.join(process.cwd(), 'screenshot');
    await fs.mkdir(baseScreenshotDir, { recursive: true });
    screenshotPath = path.join(baseScreenshotDir, `check_point_error.png`);
    await page
      .screenshot({ path: screenshotPath, fullPage: false })
      .catch((err: unknown) => logger.error('screenshot error:', err));

    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `포인트 조회 중 오류 발생: ${message}`,
      imagePath: screenshotPath,
    };
  }
}

export { run, getPoint, PointHistoryRow };