import { safeGoto, sendTelegram } from '../modules/utils';
import * as storage from '../services/storage';
import type { PlaywrightRunArgs } from '../types';
import { findMatchingKeywords, loadCheatsheet, resolveBestKeywordMatch, type QuizQuestion } from './seminar_quiz';

// Remote quiz mapping loader (replaces local import)
let quizMappingCache: Record<string, Array<string | number>> | null = null;
async function loadQuizMapping(): Promise<Record<string, Array<string | number>>> {
  if (quizMappingCache) return quizMappingCache;
  try {
    const response = await fetch('https://raw.githubusercontent.com/wooooooooooook/DV-auto/refs/heads/main/data/quiz.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as Record<string, Array<string | number>>;
    quizMappingCache = data;
    return data;
  } catch (e) {
    console.warn('[today_quiz] Failed to load remote quiz data, using empty mapping', e);
    quizMappingCache = {};
    return {};
  }
}

const QUIZ_LIST_URLS = [
  'https://www.doctorville.co.kr/product/medicineList',
  'https://www.doctorville.co.kr/product/instrumentList',
];
const TODAY_QUIZ_TEMP_KEY = 'today_quiz:temp_answers';

type TempQuizAnswers = {
  date: string;
  productTitle: string;
  answers: Array<string | number>;
};

type CheatsheetMatchResult =
  | { answers: Array<string | number>; reason: 'ok' }
  | { answers: null; reason: 'no_keyword' | 'keyword_matched_but_option_not_found' };

function getTodayIsoDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' as const });
}

async function parseTodayQuizQuestions(page: PlaywrightRunArgs['page']): Promise<QuizQuestion[]> {
  const questions: QuizQuestion[] = [];
  const areaSelector = '#questionArea .question_area';
  const areas = await page.locator(areaSelector).all();
  for (const area of areas) {
    const questionText = await area.locator('.txt_question').innerText().catch(() => '');
    const options: QuizQuestion['options'] = [];
    const choiceItems = await area.locator('.question_choice li').all();
    for (let i = 0; i < choiceItems.length; i++) {
      const item = choiceItems[i];
      const label = item.locator('label');
      const input = item.locator('input[type="radio"]');
      const text = await label.innerText().catch(() => '');
      const value = (await input.getAttribute('value')) || '';
      options.push({ index: i + 1, text: text.trim(), value });
    }
    if (questionText) {
      questions.push({ questionText: questionText.trim(), options });
    }
  }
  return questions;
}

function formatTodayQuizUnknownQuestions(productTitle: string, questions: QuizQuestion[], href: string): string {
  let message = `❓ 오늘의 퀴즈 정답 미등록\n제품: ${productTitle}\n링크: ${href}\n\n`;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    message += `Q${i + 1}: ${q.questionText.substring(0, 100)}...\n`;
    for (const opt of q.options) {
      message += `  ${opt.index}. ${opt.text}\n`;
    }
    message += '\n';
  }
  message += '등록 후 재실행: /run_quiz_now';
  return message;
}

async function notifyTodayQuizUnknownQuestions(page: PlaywrightRunArgs['page'], productTitle: string, href: string): Promise<void> {
  const questions = await parseTodayQuizQuestions(page);
  if (questions.length === 0) return;
  const message = formatTodayQuizUnknownQuestions(productTitle, questions, href);
  await sendTelegram(message).catch(() => {});
}

async function findAnswersByCheatsheet(page: PlaywrightRunArgs['page']): Promise<CheatsheetMatchResult> {
  try {
    const cheatsheet = await loadCheatsheet();
    if (Object.keys(cheatsheet).length === 0) return { answers: null, reason: 'no_keyword' };
    const questions = await parseTodayQuizQuestions(page);
    if (questions.length === 0) return { answers: null, reason: 'no_keyword' };
    const result: Array<string | number> = [];
    let hasKeywordButNoOption = false;
    for (const q of questions) {
      const matches = findMatchingKeywords(q.questionText, cheatsheet);
      const bestMatch = resolveBestKeywordMatch(q.questionText, q.options, cheatsheet);
      if (bestMatch) {
        const answerKeyword = cheatsheet[bestMatch.keyword];
        result.push(bestMatch.option.index);
        continue;
      }
      if (matches.length > 0) hasKeywordButNoOption = true;
      return { answers: null, reason: hasKeywordButNoOption ? 'keyword_matched_but_option_not_found' : 'no_keyword' };
    }
    return { answers: result, reason: 'ok' };
  } catch {
    return { answers: null, reason: 'no_keyword' };
  }
}

async function findQuizHref(page: PlaywrightRunArgs['page']) {
  for (const url of QUIZ_LIST_URLS) {
    await safeGoto(page, url, { waitUntil: 'load', timeout: 30000 }, 2);
    const quizBg = page.locator('.product_list .quiz_bg').first();
    if (!(await quizBg.count())) continue;
    const href = await page.evaluate((el) => {
      let cur: Element | null = el as Element;
      while (cur && cur.nodeType === 1) {
        const a = cur as HTMLAnchorElement;
        if (a.tagName === 'A' && a.href) return a.href;
        cur = cur.parentElement;
      }
      return null;
    }, await quizBg.elementHandle());
    if (href) return href;
  }
  return null;
}

async function run({ page }: PlaywrightRunArgs) {
  try {
    const href = await findQuizHref(page);
    if (!href) return { success: true, message: '오늘의 퀴즈가 없습니다.' };
    await safeGoto(page, href, { waitUntil: 'load', timeout: 30000 }, 2);
    const btn = page.locator('#btn_quiz_banner');
    if ((await btn.count()) > 0) {
      if (await btn.locator('.ico_finish').isVisible()) {
        const shot = 'screenshot/today_quiz_completed.png';
        try {
          await btn.first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          await page.screenshot({ path: shot });
        } catch {}
        return { success: true, message: '오늘의 퀴즈는 이미 완료되었습니다. ' + href, imagePath: shot };
      }
      await btn.first().click().catch(() => {});
    }
    await page.waitForTimeout(800);
    const popVisible = await page.locator('#quizLayerPop').isVisible().catch(() => false);
    if (!popVisible) return { success: false, message: '퀴즈 팝업이 열리지 않았습니다. 직접 퀴즈를 풀어주세요. ' + href };
    const titleElem = page.locator('#product_title');
    const productTitle = (await titleElem.count()) ? (await titleElem.first().innerText()).trim() : '';
    if (!productTitle) return { success: false, message: '제품 제목을 찾을 수 없습니다. 직접 퀴즈를 풀어주세요. ' + href };

    const mapping = await loadQuizMapping();
    let answers = mapping[productTitle];
    let answersSource: 'mapping' | 'cheatsheet' | 'none' = answers && answers.length > 0 ? 'mapping' : 'none';
    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      const cheatsheetResult = await findAnswersByCheatsheet(page);
      answers = cheatsheetResult.answers || [];
      if (answers.length > 0) {
        answersSource = 'cheatsheet';
      } else if (cheatsheetResult.reason === 'keyword_matched_but_option_not_found') {
        return { success: true, message: `등록된 정답 키워드를 찾았지만 보기와 일치하지 않아 자동 선택에 실패했습니다. 직접 퀴즈를 풀어주세요. ${href}` };
      }
    }
    if (!answers || answers.length === 0) {
      await notifyTodayQuizUnknownQuestions(page, productTitle, href);
      return { success: true, message: `정답이 등록되지 않았습니다. 직접 퀴즈를 풀어주세요. ${href}` };
    }
    if (answersSource === 'cheatsheet') {
      storage.set<TempQuizAnswers>(TODAY_QUIZ_TEMP_KEY, { date: getTodayIsoDate(), productTitle, answers });
    }
    const quizArea = page.locator('#questionArea');
    for (let i = 0; i < answers.length; i++) {
      const val = answers[i];
      const inputId = `answer${i + 1}-${val}`;
      const inputLocator = quizArea.locator(`#${inputId}`);
      if ((await inputLocator.count()) > 0) {
        await inputLocator.first().check({ force: true }).catch(async () => {
          await quizArea.locator(`label[for='${inputId}']`).first().click().catch(() => {});
        });
      } else {
        const labelSel = `label[for='${inputId}']`;
        if ((await quizArea.locator(labelSel).count()) > 0) {
          await quizArea.locator(labelSel).first().click().catch(() => {});
        } else {
          return { success: false, message: `정답 선택 요소를 찾을 수 없습니다: #${inputId} (제품: ${productTitle})\n${href}` };
        }
      }
      await page.waitForTimeout(200);
    }
    const confirmBtn = page.locator('#answerConfirmBtn');
    if ((await confirmBtn.count()) > 0) {
      try {
        await confirmBtn.first().click();
        await page.waitForTimeout(500);
        const popupVisible = await page.locator('#modalType2').isVisible().catch(() => false);
        const shot = 'screenshot/today_quiz_result.png';
        await page.screenshot({ path: shot }).catch(() => {});
        return { success: true, message: `오늘의 퀴즈를 제출했습니다. (제품: ${productTitle}), ${href}`, imagePath: shot };
      } catch {}
    }
    const shot = 'screenshot/today_quiz_result.png';
    await page.screenshot({ path: shot }).catch(() => {});
    return { success: false, message: `퀴즈 제출을 실패했습니다. (제품: ${productTitle}), ${href}`, imagePath: shot };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendTelegram(`❗ 오늘의 퀴즈 작업 오류: ${msg}`).catch(() => {});
    return { success: false, message: `오늘의 퀴즈 작업 오류: ${msg}` };
  }
}

export { run };
