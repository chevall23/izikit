import { Menu } from 'lucide-react';
import type { User } from '@/contexts/AuthContext';
import { NotificationBell, UserMenu } from './TopbarMenus';

const ROLE_LABEL: Record<string, string> = {
  OWNER_AGENT: 'Professionnel',
  TENANT_BUYER: 'Particulier',
};

export function MobileTopbar({
  user,
  unreadCount,
  onMenuClick,
}: {
  user: User;
  unreadCount: number;
  onMenuClick: () => void;
}) {
  const roleLabel = ROLE_LABEL[user.accountType] ?? user.accountType;

  return (
    <div className="flex items-center justify-between border-b border-black/[0.06] bg-white px-4 py-3.5">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Ouvrir le menu"
        className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-lg bg-gray-50 text-neutral-700 active:bg-gray-100"
      >
        <Menu className="h-[18px] w-[18px]" aria-hidden />
      </button>
      <div className="flex items-center gap-2">
        <NotificationBell unreadCount={unreadCount} compact />
        <UserMenu user={user} roleLabel={roleLabel} />
      </div>
    </div>
  );
}
