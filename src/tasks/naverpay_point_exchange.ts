import path from 'path';
import fs from 'fs/promises';
import type { PlaywrightRunArgs, TaskResult } from '../types';
import { ensureLoggedIn, safeGoto, sendTelegram, sleep } from '../modules/utils';
import { getPoint } from './check_point';

const TARGET_URL = 'https://mcircle.bizmarketb2b.com/Goods/Content.aspx?guid=14131415&catecode=14592';
const ENTERTAINMENT_URL = 'https://www.doctorville.co.kr/entertainment/main';
const SUCCESS_TEXT = '주문이 완료되었습니다.';
const DEFAULT_POINT = '4900';

/** 결제 폼에서 실제 결제 금액 추출 */
async function getProductPrice(page: any): Promise<string> {
  // 결제 폼의 주문 요약 영역 탐색 (바로구매 후에만 활성화됨)
  const summarySelectors = [
    '#divOrderSummary',
    '.order_summary',
    '.pay_info',
    '.order_total_price',
    '.price_summary',
    '[class*="summary"]',
    '[class*="total"]',
    '[class*="pay"]',
  ];
  for (const sel of summarySelectors) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) {
        const text = await el.textContent();
        if (text) {
          const prices = [...text.matchAll(/(\d{1,3}(?:,\d{3})*)\s*원/g)].map((m) =>
            m[1].replace(/,/g, ''),
          );
          if (prices.length > 0) {
            // 할인가(정가보다 작은 금액) 우선, 없으면 첫 번째 금액
            const salePrice = prices.find((p) => Number(p) < 5000);
            return salePrice || prices[0];
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // Fallback: 페이지 전체에서 상품금액 관련 금액 추출
  try {
    const body = page.locator('body');
    const text = await body.textContent();
    if (text) {
      const goodsAmtMatch = text.match(/상품금액[^\d]*(\d{1,3}(?:,\d{3})*)/);
      if (goodsAmtMatch) return goodsAmtMatch[1].replace(/,/g, '');
      const payMatch = text.match(/결제\s*금액[^\d]*(\d{1,3}(?:,\d{3})*)/);
      if (payMatch) return payMatch[1].replace(/,/g, '');
      const totalMatch = text.match(/총\s*(?:상품\s*)?금액[^\d]*(\d{1,3}(?:,\d{3})*)/);
      if (totalMatch) return totalMatch[1].replace(/,/g, '');
    }
  } catch {
    // ignore
  }

  return DEFAULT_POINT;
}

async function run({ page, context, maxIterations }: PlaywrightRunArgs): Promise<TaskResult> {
  const name = process.env.USER_NAME?.trim();
  const phone1 = process.env.USER_PHONE_1?.trim();
  const phone2 = process.env.USER_PHONE_2?.trim();
  const phone3 = process.env.USER_PHONE_3?.trim();
  const finalMaxIterations =
    maxIterations !== undefined
      ? maxIterations
      : process.env.NAVERPAY_MAX_ITERATIONS !== undefined
        ? Number(process.env.NAVERPAY_MAX_ITERATIONS)
        : 10;
  const refreshEvery = Number(process.env.NAVERPAY_REFRESH_EVERY || '3'); // 새 페이지로 리프레시할 주기
  const iterationDelayMs = Number(process.env.NAVERPAY_ITERATION_DELAY_MS || '500'); // 반복 간 대기 시간

  if (!name || !phone1 || !phone2 || !phone3) {
    const missing = [
      !name ? 'USER_NAME' : null,
      !phone1 ? 'USER_PHONE_1' : null,
      !phone2 ? 'USER_PHONE_2' : null,
      !phone3 ? 'USER_PHONE_3' : null,
    ]
      .filter(Boolean)
      .join(', ');
    const message = `네이버페이포인트교환 실패: 환경변수(${missing})를 확인해주세요.`;
    await sendTelegram(`❗ ${message}`).catch(() => {});
    return { success: false };
  }

  let workPage = page;

  if (!context) {
    const message = '네이버페이포인트교환 실패: 로그인 확인을 위해 context가 필요합니다.';
    await sendTelegram(`❗ ${message}`).catch(() => {});
    return { success: false };
  }

  await ensureLoggedIn({ page, context }).catch(() => {});

  const startPoint = await getPoint(context);
  await sendTelegram(`💳 네이버페이포인트교환 시작 전 남은 포인트: ${startPoint}`).catch(() => {});

  await fs.mkdir(path.join(process.cwd(), 'screenshot'), { recursive: true });
  let successCount = 0;
  let iteration = 0;
  const prepareShopPage = async () => {
    await ensureLoggedIn({ page: workPage, context }).catch(() => {});
    await safeGoto(workPage, ENTERTAINMENT_URL, { waitUntil: 'load', timeout: 20000 }, 2);
    const pointShopLink = workPage.locator('#btnPointShopLink').first();
    if ((await pointShopLink.count()) > 0) {
      const currentUrl = workPage.url();
      await Promise.all([
        workPage
          .waitForURL((url: URL) => url.toString() !== currentUrl, { waitUntil: 'domcontentloaded', timeout: 10000 })
          .catch(() => null),
        pointShopLink.click(),
      ]);
    }
  };

  try {
    // 초기 1회 로그인 및 포인트샵 진입
    await prepareShopPage();

    // finalMaxIterations가 0이면 실패할 때까지 무제한 반복
    while (finalMaxIterations === 0 || iteration < finalMaxIterations) {
      // 일정 주기마다 새 페이지로 재생성하여 누적 리소스 사용을 줄임
      if (refreshEvery > 0 && iteration > 0 && iteration % refreshEvery === 0) {
        try {
          await workPage.close().catch(() => {});
        } catch (_e) {
          /* ignore */
        }
        workPage = await context.newPage();
        await prepareShopPage();
      }

      await safeGoto(workPage, TARGET_URL, { waitUntil: 'load', timeout: 30000 }, 2);

      iteration += 1; // 타깃 URL 진입 후에 이터레이션을 증가시켜 실제 시도 횟수만 센다

      const buyNowButton = workPage.locator('a', { hasText: '바로구매' }).first();
      await buyNowButton.waitFor({ state: 'visible', timeout: 15000 });
      await buyNowButton.click();

      // 바로구매 후 결제 폼이 로드되면 실제 결제 금액 추출
      await workPage.waitForSelector('#rcvName', { timeout: 10000 });
      const productPrice = await getProductPrice(workPage);
      if (productPrice !== DEFAULT_POINT) {
        console.log(`상품금액 추출 성공: ${productPrice}원`);
      }

      await workPage.fill('#rcvName', name);
      await workPage.fill('#rcvMobile1', phone1);
      await workPage.fill('#rcvMobile2', phone2);
      await workPage.fill('#rcvMobile3', phone3);
      await workPage.fill('#orderMemo', String(iteration));
      await workPage.fill('#point_etc1', productPrice);

      const pointUseButton = workPage.locator('#chkMcircelPoint a').first();
      if (await pointUseButton.isVisible()) {
        await pointUseButton.click();
      }

      const agreePersonalInfo = workPage.locator('label[for="agreeFlow"]').first();
      if (await agreePersonalInfo.isVisible()) {
        await agreePersonalInfo.click();
      }

      const agreeResale = workPage.locator('label[for="chkReSale"]').first();
      if (await agreeResale.isVisible()) {
        await agreeResale.click();
      }

      const currentUrl = workPage.url();
      await Promise.all([
        workPage
          .waitForURL((url: URL) => url.toString() !== currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
          .catch(() => null),
        workPage.locator('#btnPayment').click(),
      ]);

      const orderCompleted = await workPage
        .locator(`text=${SUCCESS_TEXT}`)
        .first()
        .isVisible()
        .catch(() => false);

      if (orderCompleted) {
        successCount += 1;
        await sendTelegram(`✅ 네이버페이포인트교환 성공 (${successCount}회 누적, 시도 ${iteration}회)`).catch(
          () => {},
        );
        if (iterationDelayMs > 0) {
          await sleep(iterationDelayMs);
        }
        continue;
      }

      const failureShot = path.join(process.cwd(), 'screenshot', 'naverpay_point_exchange_failure.png');
      await workPage.screenshot({ path: failureShot, fullPage: true }).catch(() => {});
      const endPoint = await getPoint(context);
      const message = `네이버페이포인트교환 실패 (시도 ${iteration}회, 성공 ${successCount}회). '${SUCCESS_TEXT}' 문구를 찾지 못했습니다.\n종료 후 남은 포인트: ${endPoint}`;
      await sendTelegram(`❗ ${message}`, failureShot).catch(() => {});
      return { success: false };
    }

    const endPoint = await getPoint(context);
    const message =
      finalMaxIterations > 0
        ? `네이버페이포인트교환 완료: 설정된 ${finalMaxIterations}회 반복 종료 (성공 ${successCount}회).\n종료 후 남은 포인트: ${endPoint}`
        : `네이버페이포인트교환 종료: 성공 ${successCount}회 후 반복이 중단되었습니다.\n종료 후 남은 포인트: ${endPoint}`;
    await sendTelegram(`✅ ${message}`).catch(() => {});
    return { success: true };
  } catch (error) {
    const errorShot = path.join(process.cwd(), 'screenshot', 'naverpay_point_exchange_error.png');
    await workPage.screenshot({ path: errorShot, fullPage: true }).catch(() => {});
    const endPoint = await getPoint(context);
    const message = `네이버페이포인트교환 오류 발생 (성공 ${successCount}회): ${
      error instanceof Error ? error.message : String(error)
    }\n종료 후 남은 포인트: ${endPoint}`;
    await sendTelegram(`❗ ${message}`, errorShot).catch(() => {});
    return { success: false };
  }
}

export { run };
