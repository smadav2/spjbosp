import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ensureSchema } from '@/db/ensure-schema';
import { getSchool, getTransaction } from '@/lib/store';
import { documentChecks } from '@/lib/domain';
import PrintWorkspace from '@/components/print-workspace';
export const dynamic = 'force-dynamic';
export default async function PrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensureSchema();
  if (!(await currentUser())) redirect('/');
  const { id } = await params; const query = await searchParams; const school = await getSchool();
  const transaction = id !== 'report' ? await getTransaction(id) : null;
  const year = String(query.year || school.year);
  return <PrintWorkspace id={id} school={school} initialScope={String(query.scope || 'all')} year={year} month={String(query.month || '')} category={String(query.category || '')} title={transaction ? `${transaction.number} · ${transaction.title}` : `Tahun anggaran ${year} · ${school.name || 'Identitas sekolah belum diisi'}`} checks={transaction ? documentChecks(transaction, school) : []}/>;
}
