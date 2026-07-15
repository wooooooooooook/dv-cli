import * as fs from 'fs/promises';
import * as path from 'path';
import type { Page } from 'playwright';
import { sendTelegram } from '../modules/utils';

const CHEATSHEET_PATH = path.join(process.cwd(), 'data/seminar_quiz_cheatsheet.json');

export type Cheatsheet = Record<string, string>;

export interface QuizQuestion {
  questionText: string;
  options: Array<{ index: number; text: string; value: string; id: string }>;
  isQuiz: boolean;
  name: string;
}

interface QuizResult {
  questionIndex: number;
  questionText: string;
  selectedIndex: number | null;
  selectedText: string | null;
  matchedKeyword: string | null;
  multipleMatches: string[] | null;
}

async function loadCheatsheet(): Promise<Cheatsheet> {
  try {
    const raw = await fs.readFile(CHEATSHEET_PATH, 'utf8');
    return JSON.parse(raw) as Cheatsheet;
  } catch (error) {
    console.warn('[seminar_quiz] 족보 파일 로드 실패, 빈 객체 사용', error);
    return {};
  }
}

export function findMatchingKeywords(questionText: string, cheatsheet: Cheatsheet): string[] {
  const matches: string[] = [];
  for (const keyword of Object.keys(cheatsheet)) {
    if (questionText.includes(keyword)) {
      matches.push(keyword);
    }
  }
  return matches;
}

export function findOptionByAnswer(
  options: QuizQuestion['options'],
  answerKeyword: string,
): { index: number; text: string } | null {
  const normalizedAnswer = normalizeForMatch(answerKeyword);

  for (const opt of options) {
    if (normalizeForMatch(opt.text).includes(normalizedAnswer)) {
      return { index: opt.index, text: opt.text };
    }
  }

  for (const opt of options) {
    const normalizedOption = normalizeForMatch(opt.text);
    if (normalizedAnswer.includes(normalizedOption)) {
      return { index: opt.index, text: opt.text };
    }
  }

  return null;
}

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/[.,!?"'`~·•…]/g, '')
    .trim()
    .toLowerCase();
}

export function resolveBestKeywordMatch(
  questionText: string,
  options: QuizQuestion['options'],
  cheatsheet: Cheatsheet,
): { keyword: string; option: { index: number; text: string } } | null {
  const matchingKeywords = findMatchingKeywords(questionText, cheatsheet).sort((a, b) => b.length - a.length);
  for (const keyword of matchingKeywords) {
    const answerKeyword = cheatsheet[keyword];
    const option = findOptionByAnswer(options, answerKeyword);
    if (option) {
      return { keyword, option };
    }
  }
  return null;
}

/**
 * 페이지에서 모든 설문 문항(퀴즈 + 일반)을 파싱
 */
async function parseQuizQuestions(page: Page): Promise<QuizQuestion[]> {
  const questions: QuizQuestion[] = [];

  const outerLabels = page.locator('label.block:has(.whitespace-pre-wrap)');

  const count = await outerLabels.count();
  for (let i = 0; i < count; i++) {
    const outerLabel = outerLabels.nth(i);

    const name = (await outerLabel.getAttribute('for')) || '';
    if (!name) continue;

    const questionText = await outerLabel.locator('.whitespace-pre-wrap').first().innerText().catch(() => '');
    const firstLine = questionText.split('\n').map((l: string) => l.trim()).find((l: string) => l.length > 0) || questionText.trim();

    const hasQuizMarker = await outerLabel.locator('span:text("[퀴즈]")').count() > 0;

    const optionElements = outerLabel.locator('ol li label');
    const optionCount = await optionElements.count();

    const options: QuizQuestion['options'] = [];
    for (let j = 0; j < optionCount; j++) {
      const label = optionElements.nth(j);
      const input = label.locator('input[type="radio"]');
      const span = label.locator('span.col-start-2');

      const value = (await input.getAttribute('value')) || '';
      const text = (await span.innerText().catch(() => '')).trim();

      options.push({ index: j + 1, text, value, id: value });
    }

    if (options.length > 0) {
      questions.push({
        questionText: firstLine,
        options,
        isQuiz: hasQuizMarker,
        name,
      });
    }
  }

  return questions;
}

function formatQuizResults(results: QuizResult[], _hasUnknown: boolean, _hasMultipleMatches: boolean): string {
  let message = '';

  const answerSummary = results.map((r) => (r.selectedIndex !== null ? r.selectedIndex : '?')).join('');
  message += `퀴즈 정답 ${answerSummary}\n\n`;

  for (const result of results) {
    const shortQuestion =
      result.questionText.length > 25 ? result.questionText.substring(0, 25) + '...' : result.questionText;

    if (result.multipleMatches && result.multipleMatches.length > 1) {
      message += `⚠️ Q${result.questionIndex}: ${shortQuestion}\n`;
      message += `   → 여러 키워드 매칭: ${result.multipleMatches.join(', ')}\n`;
      message += `   → 선택: ${result.selectedText || '없음'} (${result.selectedIndex || '?'}번)\n\n`;
    } else if (result.selectedIndex !== null) {
      message += `✅ Q${result.questionIndex}: ${shortQuestion}\n`;
      message += `   → ${result.selectedText} (${result.selectedIndex}번)\n\n`;
    } else {
      message += `❓ Q${result.questionIndex}: ${shortQuestion}\n`;
    }
  }

  return message;
}

function formatUnknownQuestions(questions: QuizQuestion[], results: QuizResult[]): string {
  let message = '❓ 족보에 없는 퀴즈:\n\n';

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.selectedIndex === null) {
      const q = questions[i];
      message += `Q${result.questionIndex}: ${q.questionText.substring(0, 100)}...\n`;
      for (const opt of q.options) {
        message += `  ${opt.index}. ${opt.text}\n`;
      }
      message += `\n등록: /add_seminar_quiz <키워드> | <정답>\n\n`;
    }
  }

  return message;
}

type SeminarQuizResult = {
  success: boolean;
  hasQuizResult: boolean;
  message: string;
};

async function resolveSelection(
  question: QuizQuestion,
  cheatsheet: Cheatsheet,
): Promise<{ optionIndex: number; selectedText: string } | null> {
  if (question.isQuiz) {
    const bestMatch = resolveBestKeywordMatch(question.questionText, question.options, cheatsheet);
    if (!bestMatch) return null;
    return { optionIndex: bestMatch.option.index, selectedText: bestMatch.option.text };
  }
  if (question.options.length >= 2) {
    return { optionIndex: 2, selectedText: question.options[1].text };
  }
  return null;
}

async function processSeminarQuiz(page: Page, seminarName?: string, isAdvancedSurvey = false): Promise<SeminarQuizResult> {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

    const quizSelector = '.whitespace-pre-wrap:has(span:text("[퀴즈]"))';
    let isQuizVisible = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      isQuizVisible = await page
        .locator(quizSelector)
        .first()
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (isQuizVisible) break;
      if (attempt < 3) {
        console.log(
          `[seminar_quiz] [퀴즈] 텍스트 탐지 실패, 새로고침 재시도 (${attempt}/3) (${seminarName ?? 'unknown'})`,
        );
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    const questions = await parseQuizQuestions(page);

    if (questions.length === 0) {
      const message = seminarName
        ? `ℹ️ ${seminarName} 설문 페이지에서 문항을 찾지 못했습니다.`
        : 'ℹ️ 설문 페이지에서 문항을 찾지 못했습니다.';
      const shotPath = `screenshot/quiz_not_found_${Date.now()}.png`;
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
      await sendTelegram(message, shotPath);
      return { success: true, hasQuizResult: false, message };
    }

    const cheatsheet = await loadCheatsheet();

    const results: QuizResult[] = [];
    const selections: Array<{ name: string; value: string; selectedText: string }> = [];
    let hasUnknown = false;
    let hasMultipleMatches = false;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      let selectedIndex: number | null = null;
      let selectedText: string | null = null;
      let matchedKeyword: string | null = null;
      let multipleMatches: string[] | null = null;

      const selection = await resolveSelection(q, cheatsheet);

      if (selection) {
        selectedIndex = selection.optionIndex;
        selectedText = selection.selectedText;
        selections.push({ name: q.name, value: q.options[selection.optionIndex - 1].value, selectedText });
      } else if (q.isQuiz) {
        hasUnknown = true;
      }

      if (q.isQuiz && Object.keys(cheatsheet).length > 0) {
        const matchingKeywords = findMatchingKeywords(q.questionText, cheatsheet);
        if (matchingKeywords.length > 1) {
          hasMultipleMatches = true;
          multipleMatches = matchingKeywords;
        }
        if (!selection) {
          hasUnknown = true;
        }
        if (matchingKeywords.length > 0 && !selectedText) {
          matchedKeyword = matchingKeywords[0];
        }
      }

      results.push({ questionIndex: i + 1, questionText: q.questionText, selectedIndex, selectedText, matchedKeyword, multipleMatches });
    }

    for (const sel of selections) {
      const radio = page.locator(`input[type="radio"][name="${sel.name}"][value="${sel.value}"]`).first();
      if (await radio.count() > 0) {
        await radio.check({ force: true }).catch(() => {});
        console.log(`[seminar_quiz] Selected Q (name=${sel.name}, value=${sel.value}, text=${sel.selectedText})`);
      } else {
        console.warn(`[seminar_quiz] Radio not found: [name=${sel.name}][value=${sel.value}]`);
      }
      await page.waitForTimeout(300);
    }

    const submitBtn = page.locator('input[type="submit"][value="제출하기"]').first();
    const submitExists = await submitBtn.count() > 0;
    if (submitExists) {
      await submitBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);

      if (!isAdvancedSurvey) {
        const confirmBtn = page.locator('button[type="button"]:text("확인")').first();
        if (await confirmBtn.count() > 0) {
          console.log('[seminar_quiz] 확인 버튼 발견, 클릭');
          await confirmBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(500);
        }

        await page.waitForURL('**/outro**', { timeout: 10000 }).catch(() => {});
        const currentUrl = page.url();
        if (currentUrl.includes('/outro')) {
          const outroShotPath = `screenshot/quiz_outro_${Date.now()}.png`;
          await page.screenshot({ path: outroShotPath, fullPage: true }).catch(() => {});
          const msg = `${seminarName ? `${seminarName} ` : ''}설문 완료 (outro 확인)`;
          await sendTelegram(msg, outroShotPath).catch(() => {});
        }
      }
    } else {
      console.warn('[seminar_quiz] 제출하기 버튼을 찾지 못했습니다.');
    }

    const resultMessage = formatQuizResults(results, hasUnknown, hasMultipleMatches);
    if (hasUnknown) {
      const unknownMessage = formatUnknownQuestions(questions, results);
      await sendTelegram(unknownMessage);
    }

    return { success: true, hasQuizResult: true, message: resultMessage };
  } catch (e) {
    console.error('[seminar_quiz] 오류', e && typeof e === 'object' && 'stack' in e ? (e as Error).stack : e);
    const message = e instanceof Error ? e.message : String(e);
    const errShotPath = `screenshot/quiz_error_${Date.now()}.png`;
    await page.screenshot({ path: errShotPath, fullPage: true }).catch(() => {});
    await sendTelegram(`❗ 세미나 퀴즈 처리 오류: ${message}`, errShotPath).catch(() => {});
    return { success: false, hasQuizResult: false, message: `세미나 퀴즈 처리 오류: ${message}` };
  }
}

export { processSeminarQuiz, resolveSelection, loadCheatsheet, CHEATSHEET_PATH };
