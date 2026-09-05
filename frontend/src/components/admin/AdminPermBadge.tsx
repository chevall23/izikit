import { Pencil, Eye, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminPermLevel = 'full' | 'read' | 'none';

const PERM: Record<AdminPermLevel, { label: string; icon: typeof Pencil; className: string }> = {
  full: { label: 'Lecture + écriture', icon: Pencil, className: 'bg-sky-100 text-sky-700' },
  read: { label: 'Lecture seule', icon: Eye, className: 'bg-gray-100 text-gray-600' },
  none: { label: 'Aucun', icon: Ban, className: 'bg-red-100 text-red-600' },
};

/** One cell of the permissions matrix — access level + icon, per role × module. */
export function AdminPermBadge({ level }: { level: AdminPermLevel }) {
  const p = PERM[level];
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold whitespace-nowrap',
        p.className,
      )}
    >
      <p.icon className="h-[11px] w-[11px]" aria-hidden />
      {p.label}
    </span>
  );
}
