import type { AppState, DocTemplate, SchoolProfile, Transaction } from './domain';
export type StorageMode = 'cloud' | 'local';
export interface LocalSnapshot { school: SchoolProfile; transactions: Transaction[]; templates: DocTemplate[]; savedAt: string; source: 'server' | 'device' }
const MODE_KEY = 'spj.mode.v1';
const SNAPSHOT_KEY = 'spj.snapshot.v1';
const LAST_PULL_KEY = 'spj.lastPull.v1';
const hasWindow = () => typeof window !== 'undefined' && Boolean(window.localStorage);
export function loadMode(): StorageMode { if (!hasWindow()) return 'cloud'; return window.localStorage.getItem(MODE_KEY) === 'local' ? 'local' : 'cloud'; }
export function saveMode(mode: StorageMode) { if (hasWindow()) window.localStorage.setItem(MODE_KEY, mode); }
export function readSnapshot(): LocalSnapshot | null {
  if (!hasWindow()) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SNAPSHOT_KEY) || 'null') as LocalSnapshot | null;
    if (!parsed || !parsed.school || !Array.isArray(parsed.transactions)) return null;
    return { ...parsed, templates: Array.isArray(parsed.templates) ? parsed.templates : [], source: parsed.source === 'device' ? 'device' : 'server' };
  } catch { return null; }
}
export function writeSnapshot(state: Pick<AppState, 'school' | 'transactions' | 'templates'>, source: 'server' | 'device' = 'server'): LocalSnapshot | null {
  if (!hasWindow()) return null;
  const snapshot: LocalSnapshot = { school: state.school, transactions: state.transactions, templates: state.templates, savedAt: new Date().toISOString(), source };
  try { window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)); return snapshot; }
  catch { return null; }
}
export function clearSnapshot() { if (hasWindow()) { window.localStorage.removeItem(SNAPSHOT_KEY); window.localStorage.removeItem(LAST_PULL_KEY); } }
export function markPulled(at = new Date().toISOString()) { if (hasWindow()) window.localStorage.setItem(LAST_PULL_KEY, at); }
export function lastPull() { return hasWindow() ? window.localStorage.getItem(LAST_PULL_KEY) : null; }
export function snapshotSize() {
  if (!hasWindow()) return 0;
  const raw = window.localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) return 0;
  try { return new Blob([raw]).size; } catch { return raw.length; }
}
export function formatBytes(bytes: number) { if (!bytes) return '0 KB'; if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
export function relativeTime(value?: string | null) {
  if (!value) return 'belum pernah';
  const diff = Date.now() - new Date(value).valueOf();
  if (!Number.isFinite(diff) || diff < 0) return new Date(value).toLocaleString('id-ID');
  if (diff < 60000) return 'baru saja';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} menit lalu`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} jam lalu`;
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
