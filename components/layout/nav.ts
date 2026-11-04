import type { ComponentType, SVGProps } from 'react';
import {
  IconCalendar,
  IconGoals,
  IconIdeas,
  IconLearnings,
  IconCuriosity,
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
  { href: '/learnings', label: 'Learnings', icon: IconLearnings },
  { href: '/ideas', label: 'Ideas', icon: IconIdeas },
  { href: '/curiosity', label: 'Curiosity', icon: IconCuriosity },
  { href: '/settings', label: 'Settings', icon: IconSettings },
];

export const MOBILE_NAV_ITEMS: NavItem[] = NAV_ITEMS.slice(0, 3);
/**
 * Everything else, in the sidebar on desktop and in the "More" sheet on a phone.
 *
 * There is deliberately no Speak Better entry: the daily lesson and the practice
 * library both live inside Curiosity now, so a second menu item would be a second
 * door to one room. `/speak-better` still resolves — it redirects to the card.
 */
export const MORE_NAV_ITEMS: NavItem[] = NAV_ITEMS.slice(3);
