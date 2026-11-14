import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Attachment, SchoolProfile } from './domain';
let defaultImage: Promise<Buffer> | undefined;
export async function receiptArtwork(school: SchoolProfile, assets: Attachment[]): Promise<Buffer | null> {
  if (school.receiptStyle !== 'blue') return null;
  const custom = assets.find(f => f.id === school.receiptBackgroundId && f.mime.startsWith('image/') && f.content);
  if (custom) return sharp(Buffer.from(custom.content!, 'base64')).rotate().png().toBuffer();
  if (!defaultImage) defaultImage = readFile(join(process.cwd(), 'public/images/kuitansi-biru.svg')).then(svg => sharp(svg, { density: 144 }).resize({ width: 2400 }).png().toBuffer()).catch(error => { defaultImage = undefined; throw error; });
  return defaultImage;
}
