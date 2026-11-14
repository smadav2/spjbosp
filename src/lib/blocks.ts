import type { Attachment } from './domain';
export type Signer = { role: string; name: string; nip?: string; image?: Attachment };
export type Block =
  | { type: 'text'; value: string; bold?: boolean; center?: boolean; size?: number }
  | { type: 'table'; headers: string[]; rows: string[][]; widths?: number[] }
  | { type: 'image'; file: Attachment }
  | { type: 'signatures'; signers: Signer[]; date: string }
  | { type: 'kv'; rows: [string, string][]; right?: string; labelWidth?: number }
  | { type: 'diktum'; rows: { label: string; value: string }[] }
  | { type: 'tembusan'; items: string[] }
  | { type: 'decree-sign'; placeLine: string; dateLine: string; role: string; schoolLine: string; name: string; nip: string; image?: Attachment };
