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
  IconSpeech,
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
  { href: '/speak-better', label: 'Speak Better', icon: IconSpeech },
  { href: '/settings', label: 'Settings', icon: IconSettings },
];

export const MOBILE_NAV_ITEMS: NavItem[] = NAV_ITEMS.slice(0, 3);
/**
 * Everything else, in the sidebar on desktop and in the "More" sheet on a phone.
 * Speak Better sits next to Curiosity because that is where the daily lesson
 * lives; the practice library is the same material, one tap further.
 */
export const MORE_NAV_ITEMS: NavItem[] = NAV_ITEMS.slice(3);
