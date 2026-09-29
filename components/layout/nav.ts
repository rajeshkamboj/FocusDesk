import type { ComponentType, SVGProps } from 'react';
import {
  IconCalendar,
  IconGoals,
  IconIdeas,
  IconInbox,
  IconProjects,
  IconReview,
  IconSettings,
  IconTasks,
  IconToday,
} from '@/components/ui/icons';

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/today', label: 'Today', icon: IconToday },
  { href: '/inbox', label: 'Inbox', icon: IconInbox },
  { href: '/tasks', label: 'Tasks', icon: IconTasks },
  { href: '/projects', label: 'Projects', icon: IconProjects },
  { href: '/goals', label: 'Goals', icon: IconGoals },
  { href: '/calendar', label: 'Calendar', icon: IconCalendar },
  { href: '/review', label: 'Review', icon: IconReview },
  { href: '/ideas', label: 'Ideas', icon: IconIdeas },
  { href: '/settings', label: 'Settings', icon: IconSettings },
];

export const MOBILE_NAV_ITEMS: NavItem[] = NAV_ITEMS.slice(0, 3);
export const MORE_NAV_ITEMS: NavItem[] = NAV_ITEMS.slice(3);
