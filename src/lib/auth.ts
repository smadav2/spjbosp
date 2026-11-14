import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { administrators, sessions } from '@/db/schema';
const scrypt = promisify(scryptCallback);
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function hashPassword(password: string) { const salt = randomBytes(24).toString('hex'); const hash = await scrypt(password, salt, 64) as Buffer; return `${salt}:${hash.toString('hex')}`; }
export async function verifyPassword(password: string, saved: string) { const [salt, hash] = saved.split(':'); if (!salt || !hash) return false; const actual = await scrypt(password, salt, 64) as Buffer; const expected = Buffer.from(hash, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export async function hasAdministrator() { return (await db.select({ id: administrators.id }).from(administrators).limit(1)).length > 0; }
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export async function currentUser() {
  const token = (await cookies()).get('spj_session')?.value;
  if (!token) return null;
  const [result] = await db.select({ id: administrators.id, name: administrators.name, username: administrators.username }).from(sessions).innerJoin(administrators, eq(sessions.userId, administrators.id)).where(and(eq(sessions.token, digest(token)), gt(sessions.expiresAt, new Date()))).limit(1);
  return result || null;
}
export async function requireUser() { const user = await currentUser(); if (!user) throw new AppError('Silakan masuk atau buat akun administrator terlebih dahulu.', 401); return user; }
export async function startSession(userId: string, secure: boolean) { const token = randomBytes(36).toString('hex'); const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12); await db.insert(sessions).values({ token: digest(token), userId, expiresAt }); (await cookies()).set('spj_session', token, { httpOnly: true, sameSite: 'lax', secure, expires: expiresAt, path: '/' }); }
export async function endSession() { const jar = await cookies(); const token = jar.get('spj_session')?.value; if (token) await db.delete(sessions).where(eq(sessions.token, digest(token))); jar.delete('spj_session'); }
const attempts = new Map<string, { count: number; until: number }>();
export function checkLoginRate(key: string) { const now = Date.now(); const existing = attempts.get(key); if (existing && existing.until > now && existing.count >= 8) throw new AppError('Terlalu banyak percobaan. Coba kembali dalam 15 menit.', 429); attempts.set(key, { count: existing && existing.until > now ? existing.count + 1 : 1, until: existing && existing.until > now ? existing.until : now + 900000 }); }
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  let originHost = '';
  try { originHost = new URL(origin).host; } catch { throw new AppError('Origin permintaan tidak valid.', 403); }
  const candidates = new Set<string>();
  for (const header of ['host', 'x-forwarded-host', 'x-original-host']) {
    const value = request.headers.get(header);
    if (value) value.split(',').forEach(v => { const host = v.trim(); if (host) candidates.add(host); });
  }
  try { candidates.add(new URL(request.url).host); } catch {}
  if (candidates.has(originHost)) return;
  // Host rewritten by a TLS-terminating proxy (Vercel/e2b/Cloudflare): cookies are
  // SameSite=Lax + HttpOnly, so only reject when the browser marks the request cross-site.
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('Permintaan lintas situs ditolak.', 403);
}
