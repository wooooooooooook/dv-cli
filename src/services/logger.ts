// Stub logger for CLI - just console output
export function info(...args: any[]) {
  console.log('[INFO]', ...args);
}

export function warn(...args: any[]) {
  console.warn('[WARN]', ...args);
}

export function error(...args: any[]) {
  console.error('[ERROR]', ...args);
}

export function debug(...args: any[]) {
  console.debug('[DEBUG]', ...args);
}
