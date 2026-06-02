import * as fs from 'fs/promises';
import * as path from 'path';
import type { PlaywrightRunArgs } from '../types';
import { safeGoto } from '../modules/utils';

async function run({ page }: PlaywrightRunArgs) {
  let screenshotPath: string | null = null;
  try {
    const ATTENDANCE_PAGE = 'https://www.doctorville.co.kr/event/attend';
    await safeGoto(page, ATTENDANCE_PAGE, { waitUntil: 'load', timeout: 30000 }, 1);

    const baseScreenshotDir = path.join(process.cwd(), 'screenshot');
    await fs.mkdir(baseScreenshotDir, { recursive: true });
    screenshotPath = path.join(baseScreenshotDir, `attendance_result.png`);

    const checkedCount = await page.locator('.tit_box button.complete', { hasText: '출석완료' }).count();
    if (checkedCount > 0) {
      const loc = page.locator('.tit_box button.complete', { hasText: '출석완료' }).first();
      if (await loc.isVisible()) {
        await page.screenshot({ path: screenshotPath, fullPage: false });
        return { success: true, message: '출석체크: 이미 출석체크되어있습니다.', imagePath: screenshotPath };
      }
    }
    const loc = await page.locator('.tit_box button.point_down', { hasText: '출석하기' }).first();
    if (await loc.isVisible()) {
      await loc.click();
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { success: true, message: '출석체크 완료!', imagePath: screenshotPath };
    }

    await page.screenshot({ path: screenshotPath, fullPage: false });
    const html = await page.locator('.tit_box').first().innerHTML();
    console.log('tit_box innerHTML:', html);
    return { success: false, message: '출석체크 버튼을 찾지 못함!', imagePath: screenshotPath };
  } catch (error) {
    console.error('attendance task error', error);
    if (!screenshotPath) {
      const baseScreenshotDir = path.join(process.cwd(), 'screenshot');
      await fs.mkdir(baseScreenshotDir, { recursive: true });
      screenshotPath = path.join(baseScreenshotDir, `attendance_error.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    }
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `출석체크 작업 오류: ${message}`, imagePath: screenshotPath };
  }
}

export { run };
