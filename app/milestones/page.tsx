import type { Metadata } from 'next';
import { MilestonesScreen } from '@/components/milestones/milestones-screen';

export const metadata: Metadata = {
  title: 'Milestones',
};

export default function MilestonesPage() {
  return <MilestonesScreen />;
}
