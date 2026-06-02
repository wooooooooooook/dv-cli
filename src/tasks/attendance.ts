import * as fs from 'fs/promises';
import * as path from 'path';
import type { PlaywrightRunArgs } from '../types';
import { safeGoto, ensureLoggedIn } from '../modules/utils';

async function run({ page, context }: PlaywrightRunArgs) {
  let screenshotPath: string | null = null;
  try {
    await ensureLoggedIn({ page, context });
    const ATTENDANCE_PAGE = 'https://www.doctorville.co.kr/event/attend';
    await safeGoto(page, ATTENDANCE_PAGE, { waitUntil: 'load', timeout: 30000 }, 1);

    const baseScreenshotDir = path.join(process.cwd(), 'screenshot');
    await fs.mkdir(baseScreenshotDir, { recursive: true });
    screenshotPath = path.join(baseScreenshotDir, 'attendance_result.png');

    // 로그인 페이지로 리다이렉트되었는지 확인
    if (page.url().includes('/login') || page.url().includes('mims-account')) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { success: false, message: '로그인이 필요합니다. 먼저 "npx tsx src/cli.ts login" 명령을 실행하세요.', imagePath: screenshotPath };
    }

    // 출석 완료 버튼 확인
    const completeBtn = page.locator('button.btn.complete', { hasText: '출석완료' });
    if (await completeBtn.count() > 0 && await completeBtn.first().isVisible()) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { success: true, message: '출석체크: 이미 출석체크되어있습니다.', imagePath: screenshotPath };
    }

    // 출석하기 버튼 클릭
    const attendBtn = page.locator('button.btn.point_down', { hasText: '출석하기' });
    if (await attendBtn.count() > 0 && await attendBtn.first().isVisible()) {
      await attendBtn.first().click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { success: true, message: '출석체크 완료!', imagePath: screenshotPath };
    }

    // 버튼을 찾지 못한 경우 - HTML 디버깅
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const bodyText = await page.locator('body').innerText();
    console.log('Body text:', bodyText.substring(0, 800));
    const allButtons = await page.locator('button').all();
    let buttonInfo = '';
    for (const btn of allButtons) {
      const text = await btn.innerText().catch(() => '');
      const cls = await btn.getAttribute('class').catch(() => '');
      const visible = await btn.isVisible().catch(() => false);
      buttonInfo += `\n  text="${text.trim()}", class="${cls}", visible=${visible}`;
    }
    console.log('Available buttons:', buttonInfo);
    
    return { success: false, message: '출석체크 버튼을 찾지 못함!' + buttonInfo, imagePath: screenshotPath };
  } catch (error) {
    console.error('attendance task error', error);
    if (!screenshotPath) {
      const baseScreenshotDir = path.join(process.cwd(), 'screenshot');
      await fs.mkdir(baseScreenshotDir, { recursive: true });
      screenshotPath = path.join(baseScreenshotDir, 'attendance_error.png');
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    }
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `출석체크 작업 오류: ${message}`, imagePath: screenshotPath };
  }
}

export { run };