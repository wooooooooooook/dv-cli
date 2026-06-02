import * as fs from 'fs/promises';
import * as path from 'path';

const STORAGE_DIR = path.join(process.cwd(), '.storage');
const STORAGE_FILE = path.join(STORAGE_DIR, 'storage.json');

let cache: Record<string, any> = {};

async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch {}
}

async function loadStorage() {
  try {
    const data = await fs.readFile(STORAGE_FILE, 'utf-8');
    cache = JSON.parse(data);
  } catch {
    cache = {};
  }
}

async function saveStorage() {
  await ensureStorageDir();
  await fs.writeFile(STORAGE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

export async function set<T>(key: string, value: T): Promise<void> {
  await loadStorage();
  cache[key] = value;
  await saveStorage();
}

export async function get<T>(key: string): Promise<T | null> {
  await loadStorage();
  return cache[key] ?? null;
}

export async function remove(key: string): Promise<void> {
  await loadStorage();
  delete cache[key];
  await saveStorage();
}

export async function clear(): Promise<void> {
  cache = {};
  await saveStorage();
}
