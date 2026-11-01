import {
  Activity,
  Archive,
  Home,
  Settings,
  Shield,
  User,
  Users,
  type LucideProps,
} from 'lucide-react';
import type { RouteMeta } from '@/lib/routes';

const icons = {
  home: Home,
  user: User,
  activity: Activity,
  settings: Settings,
  users: Users,
  shield: Shield,
  archive: Archive,
} as const;

export function RouteIcon({ icon, ...props }: { icon: RouteMeta['icon'] } & LucideProps) {
  const Icon = icons[icon ?? 'home'];
  return <Icon aria-hidden="true" {...props} />;
}
