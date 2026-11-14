import type { Block } from './blocks';
import { dateLabel, money, number, terbilang, text, type Attachment, type SchoolProfile, type Transaction } from './domain';
export const DEFAULT_MENGINGAT = [
  'Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;',
  'Undang-Undang Nomor 23 Tahun 2014 tentang Pemerintahan Daerah sebagaimana telah diubah dengan Undang-Undang Nomor 9 Tahun 2015 tentang Perubahan Kedua atas Undang-Undang Nomor 23 Tahun 2014;',
  'Peraturan Pemerintah Nomor 19 Tahun 2005 tentang Standar Nasional Pendidikan sebagaimana telah diubah dengan Peraturan Pemerintah Nomor 13 Tahun 2015;',
  'Peraturan Menteri Pendidikan dan Kebudayaan Nomor 62 Tahun 2014 tentang Kegiatan Ekstrakurikuler pada Pendidikan Dasar dan Pendidikan Menengah;',
  'Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 12 Tahun 2024 tentang Kurikulum pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;',
  'Keputusan Kepala Sekolah tentang Penetapan Rencana Kegiatan dan Anggaran Sekolah Tahun Anggaran {tahun}.',
].join('\n');
export const DEFAULT_DIKTUM = {
  keempat: 'Keputusan ini mulai berlaku sejak tanggal ditetapkan, dengan ketentuan apabila di kemudian hari terdapat kekeliruan akan diadakan perbaikan sebagaimana mestinya.',
  keenam: 'Surat keputusan ini disampaikan kepada yang bersangkutan untuk dilaksanakan dengan penuh tanggung jawab.',
};
export const lines = (value: string) => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
const lettered = (items: string[]) => items.map((item, i) => `${String.fromCharCode(97 + i)}. ${item}`).join('\n');
const numbered = (items: string[]) => items.map((item, i) => `${i + 1}. ${item}`).join('\n');
const schoolName = (school: SchoolProfile) => school.name || '[Nama sekolah]';
export function invitationDocument(t: Transaction, school: SchoolProfile, assets: Attachment[] = []): { title: string; blocks: Block[] } {
  const data = (key: string) => text(t.data, key);
  const place = data('paymentPlace') || school.regency || school.village || '[Tempat]';
  const date = data('activityDate') || t.date;
  const blocks: Block[] = [
    { type: 'kv', rows: [['Nomor', data('invitationNumber') || '[Nomor surat undangan]'], ['Lampiran', data('attachmentNote') || '-'], ['Perihal', data('subject') || `Undangan rapat ${t.title}`]], right: `${place}, ${dateLabel(t.date)}` },
    { type: 'text', value: 'Kepada Yth.\nBapak/Ibu Guru\nDi\nTempat' },
    { type: 'text', value: "Assalamu'alaikum Wr. Wb." },
    { type: 'text', value: `Dengan hormat,\nSehubungan dengan pentingnya proses pembelajaran di ${schoolName(school)} dan beberapa hal yang perlu dibahas bersama, kami mengundang Bapak/Ibu untuk menghadiri rapat yang akan diselenggarakan pada:` },
    { type: 'kv', rows: [['Hari / Tanggal', dateLabel(date)], ['Waktu', data('time') || '[Waktu]'], ['Tempat', data('place') || '[Tempat]'], ...(data('agenda') ? [['Agenda', data('agenda')] as [string, string]] : [])] },
    { type: 'text', value: `Demikian undangan ini kami sampaikan. Mohon kesediaan Bapak/Ibu untuk hadir tepat waktu. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.${data('responsible') ? `\nPenanggung jawab kegiatan: ${data('responsible')}.` : ''}` },
    { type: 'text', value: "Wassalamu'alaikum Wr. Wb." },
    { type: 'signatures', date: `${place}, ${dateLabel(t.date)}`, signers: [{ role: 'Kepala Sekolah', name: school.principal || '[Nama kepala sekolah]', nip: school.principalNip, image: assets.find(f => f.id === school.principalSignatureId) }] },
  ];
  return { title: 'SURAT UNDANGAN', blocks };
}
export function decreeDocument(t: Transaction, school: SchoolProfile, assets: Attachment[]): { title: string; blocks: Block[] } {
  const data = (key: string) => text(t.data, key);
  const pramuka = t.category === 'pramuka';
  const activity = pramuka ? 'Ekstrakurikuler Pramuka' : "Ekstrakurikuler Tahfidzul Qur’an";
  const defaultTitle = pramuka
    ? 'PEMBENTUKAN PANITIA PELAKSANA KEGIATAN, PETUGAS PEMBUAT LAPORAN, DAN PENETAPAN PEMBINA KEGIATAN EKSTRAKURIKULER PRAMUKA'
    : "PENUNJUKAN PEMBAGIAN TUGAS GURU SEBAGAI PEMBIMBING BACA AL-QUR’AN DALAM KEGIATAN EKSTRAKURIKULER TAHFIDZUL QUR’AN";
  const people = lines(data('participants'));
  const recipients = people.length ? people : [data('recipient') || '[Nama pembina]'];
  const meetings = Math.max(1, lines(data('meetingDates')).length);
  const honorUnit = data('honorUnit') || `${meetings} X pertemuan`;
  const perPerson = Math.round(t.amount / Math.max(1, recipients.length));
  const perUnit = data('honorPerUnit') ? Number(data('honorPerUnit')) : Math.round(perPerson / meetings);
  const menimbang = lines(data('menimbang')).length ? lines(data('menimbang')) : [
    `Bahwa untuk kelancaran pelaksanaan kegiatan ${activity} serta tertibnya administrasi pertanggungjawaban belanja sekolah, dipandang perlu menetapkan pembina dan rincian honor kegiatan pada ${schoolName(school)};`,
    'Bahwa guru yang ditetapkan mampu dan memenuhi persyaratan untuk melaksanakan tugas pembinaan, sehingga perlu ditetapkan dalam surat keputusan kepala sekolah;',
    'Bahwa berdasarkan pertimbangan sebagaimana dimaksud, perlu menetapkan Keputusan Kepala Sekolah tentang penunjukan pembina dan pemberian honor kegiatan tersebut.',
  ];
  const mengingat = lines(data('mengingat')).length ? lines(data('mengingat')) : lines(DEFAULT_MENGINGAT.replaceAll('{tahun}', String(t.year)));
  const tembusan = lines(data('tembusan')).length ? lines(data('tembusan')) : [
    `Inspektur Kabupaten ${school.regency || '[kabupaten]'}`,
    `Koordinator Pengawas Kecamatan ${school.district || '[kecamatan]'}`,
    `Kepala Dinas Pendidikan Kabupaten ${school.regency || '[kabupaten]'}`,
    'Arsip',
  ];
  const honorRows = recipients.map((name, i) => [String(i + 1), name, number(perUnit), honorUnit, number(perPerson), terbilang(perPerson).replace(' rupiah', '').replace(/^./, c => c.toUpperCase())]);
  const blocks: Block[] = [
    { type: 'text', value: 'KEPUTUSAN KEPALA SEKOLAH', center: true, bold: true },
    { type: 'text', value: schoolName(school), center: true, bold: true },
    { type: 'text', value: `NOMOR: ${data('decreeNumber') || '[nomor keputusan]'}`, center: true, bold: true },
    { type: 'text', value: 'TENTANG', center: true },
    { type: 'text', value: data('skTitle') || defaultTitle, center: true, bold: true },
    { type: 'text', value: `TAHUN ANGGARAN ${t.year}`, center: true },
    { type: 'diktum', rows: [{ label: 'Menimbang', value: lettered(menimbang) }, { label: 'Mengingat', value: numbered(mengingat) }] },
    { type: 'text', value: 'MEMUTUSKAN', center: true, bold: true },
    { type: 'diktum', rows: [
      { label: 'Menetapkan', value: `Keputusan Kepala ${schoolName(school)} tentang penunjukan pembina dan pemberian honor kegiatan ${activity} Tahun Anggaran ${t.year}.` },
      { label: 'KESATU', value: `Menunjuk ${recipients.join(', ')} sebagai pembina kegiatan ${activity} pada ${schoolName(school)} Tahun Anggaran ${t.year}.` },
      { label: 'KEDUA', value: `Memberikan tugas kepada pihak yang ditunjuk sebagaimana dimaksud pada diktum KESATU untuk melaksanakan pembinaan, pendampingan, dan penilaian kegiatan ${activity}, serta menyusun laporan pelaksanaan kegiatan sebagai bahan pertanggungjawaban.` },
      { label: 'KETIGA', value: 'Memberikan honorarium kepada pihak yang ditunjuk sebagaimana dimaksud pada diktum KESATU dengan rincian sebagai berikut:' },
    ] },
    { type: 'table', headers: ['No.', 'Uraian', 'Jumlah Honor', 'Satuan', 'Jumlah', 'Terbilang'], rows: honorRows, widths: [0.07, 0.24, 0.15, 0.14, 0.15, 0.25] },
    { type: 'diktum', rows: [
      { label: 'KEEMPAT', value: data('diktumKeempat') || DEFAULT_DIKTUM.keempat },
      { label: 'KELIMA', value: data('diktumKelima') || `Segala biaya yang timbul berkaitan dengan pelaksanaan keputusan ini dibebankan pada anggaran Bantuan Operasional Satuan Pendidikan (BOSP) ${schoolName(school)} Tahun Anggaran ${t.year}.` },
      { label: 'KEENAM', value: data('diktumKeenam') || DEFAULT_DIKTUM.keenam },
    ] },
    { type: 'decree-sign', placeLine: `Ditetapkan di : ${school.regency || school.village || '[tempat]'}`, dateLine: `Pada tanggal : ${dateLabel(data('decreeDate') || t.date)}`, role: 'KEPALA SEKOLAH', schoolLine: schoolName(school), name: school.principal || '[Nama kepala sekolah]', nip: school.principalNip, image: assets.find(f => f.id === school.principalSignatureId) },
    { type: 'tembusan', items: tembusan },
  ];
  return { title: 'KEPUTUSAN KEPALA SEKOLAH', blocks };
}
export function honorTotal(t: Transaction) { return money(t.amount); }
