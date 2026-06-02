import * as fs from 'fs/promises';
import * as path from 'path';
import type { Page } from 'playwright';

export type Cheatsheet = Record<string, string>;
export interface QuizQuestion {
  questionText: string;
  options: Array<{ index: number; text: string; value: string }>;
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

export function findOptionByAnswer(options: QuizQuestion['options'], answerKeyword: string) {
  const normalize = (t: string) => t.normalize('NFKC').replace(/\\s+/g, ' ').replace(/[.,!?\"'`~·•…]/g, '').trim().toLowerCase();
  const normAns = normalize(answerKeyword);
  for (const opt of options) {
    if (normalize(opt.text).includes(normAns)) return { index: opt.index, text: opt.text };
  }
  for (const opt of options) {
    if (normAns.includes(normalize(opt.text))) return { index: opt.index, text: opt.text };
  }
  return null;
}

export function resolveBestKeywordMatch(questionText: string, options: QuizQuestion['options'], cheatsheet: Cheatsheet) {
  const matches = findMatchingKeywords(questionText, cheatsheet).sort((a, b) => b.length - a.length);
  for (const keyword of matches) {
    const answerKeyword = cheatsheet[keyword];
    const option = findOptionByAnswer(options, answerKeyword);
    if (option) return { keyword, option };
  }
  return null;
}

export async function loadCheatsheet(): Promise<Cheatsheet> {
  try {
    const response = await fetch('https://raw.githubusercontent.com/wooooooooooook/DV-auto/refs/heads/main/data/seminar_quiz_cheatsheet.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const raw = await response.text();
    return JSON.parse(raw) as Cheatsheet;
  } catch (error) {
    console.warn('[seminar_quiz] 족보 원격 로드 실패, 빈 객체 사용', error);
    return {};
  }
}
