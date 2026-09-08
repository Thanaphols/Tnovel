import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface CachedChapter {
  id: string;
  originalUrl: string;
  titleEn: string;
  titleTh: string;
  contentEn: string[];
  contentTh: string[];
  novelTitle?: string;
  chapterNumber?: number;
  lastReadPosition?: number;
  updatedAt: string;
}

export interface ReaderSettingsState {
  theme: 'light' | 'sepia' | 'dark';
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  fontFamily: 'sans' | 'serif';
  lineHeight: 'compact' | 'comfort' | 'spaced';
  displayMode: 'th' | 'en' | 'parallel';
}

interface NovelTransDB extends DBSchema {
  chapters: {
    key: string;
    value: CachedChapter;
    indexes: { 'by-url': string };
  };
  settings: {
    key: string;
    value: ReaderSettingsState;
  };
}

const DB_NAME = 'noveltrans_reader_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<NovelTransDB>> | null = null;

function getDB() {
  if (typeof window === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB<NovelTransDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('chapters')) {
          const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
          chapterStore.createIndex('by-url', 'originalUrl');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveChapterOffline(chapter: CachedChapter) {
  const db = await getDB();
  if (!db) return;
  await db.put('chapters', chapter);
}

export async function getChapterOffline(id: string): Promise<CachedChapter | undefined> {
  const db = await getDB();
  if (!db) return undefined;
  return await db.get('chapters', id);
}

export async function getAllChaptersOffline(): Promise<CachedChapter[]> {
  const db = await getDB();
  if (!db) return [];
  return await db.getAll('chapters');
}

export async function saveReaderSettings(settings: ReaderSettingsState) {
  const db = await getDB();
  if (!db) return;
  await db.put('settings', settings, 'user_reader_settings');
}

export async function getReaderSettings(): Promise<ReaderSettingsState | undefined> {
  const db = await getDB();
  if (!db) return undefined;
  return await db.get('settings', 'user_reader_settings');
}
