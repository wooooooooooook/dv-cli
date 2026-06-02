import { Command } from 'commander';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import * as path from 'path';
import { ensureLoggedIn } from './modules/utils';
import * as loginTask from './tasks/login';
import * as checkPointTask from './tasks/check_point';
import * as naverpayTask from './tasks/naverpay_point_exchange';
import * as baeminTask from './tasks/baemin_point_exchange';
import * as attendanceTask from './tasks/attendance';
import * as todayQuizTask from './tasks/today_quiz';

dotenv.config();

const program = new Command();
program.name('dv-cli').description('Doctor-Ville CLI wrapper (login, point).').version('0.1.0');

async function withBrowser(callback: (page:any, context:any) => Promise<void>) {
  const userDataDir = path.join(process.cwd(), '.browser-data');
  const context = await chromium.launchPersistentContext(userDataDir, { 
    headless: true, 
    args: ['--no-sandbox'] 
  });
  const page = context.pages()[0] || await context.newPage();
  try {
    await callback(page, context);
  } finally {
    await context.close();
  }
}

program.command('login')
  .description('Log in to Doctor-Ville')
  .action(async () => {
    await withBrowser(async (page, context) => {
      console.log('Running login task...');
      const result = await loginTask.run({ page, context });
      console.log('Login result:', JSON.stringify(result));
    });
  });

program.command('point')
  .description('Check current points')
  .action(async () => {
    await withBrowser(async (page, context) => {
      await ensureLoggedIn({ page, context });
      const result = await checkPointTask.run({ page, context });
      console.log('Point check result:', JSON.stringify(result));
    });
  });

program.command('naverpay')
  .description('네이버페이 포인트 교환')
  .action(async () => {
    await withBrowser(async (page, context) => {
      await ensureLoggedIn({ page, context });
      const result = await naverpayTask.run({ page, context });
      console.log('네이버페이 교환 결과:', JSON.stringify(result));
    });
  });

program.command('baemin')
  .description('배민 포인트 교환')
  .action(async () => {
    await withBrowser(async (page, context) => {
      await ensureLoggedIn({ page, context });
      const result = await baeminTask.run({ page, context });
      console.log('배민 교환 결과:', JSON.stringify(result));
    });
  });

program.command('attendance')
  .description('출석 체크')
  .action(async () => {
    await withBrowser(async (page, context) => {
      await ensureLoggedIn({ page, context });
      const result = await attendanceTask.run({ page, context });
      console.log('출석 체크 결과:', JSON.stringify(result));
    });
  });

program.command('today_quiz')
  .description('오늘의 퀴즈')
  .action(async () => {
    await withBrowser(async (page, context) => {
      await ensureLoggedIn({ page, context });
      const result = await todayQuizTask.run({ page, context });
      console.log('오늘의 퀴즈 결과:', JSON.stringify(result));
    });
  });

program.parseAsync(process.argv);
