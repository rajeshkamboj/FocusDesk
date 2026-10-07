import type { Metadata } from 'next';
import { LearningsScreen } from '@/components/learnings/learnings-screen';

export const metadata: Metadata = {
  title: 'Learnings',
};

export default function LearningsPage() {
  return <LearningsScreen />;
}
