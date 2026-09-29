import type { Metadata } from 'next';
import { GoalsScreen } from '@/components/goals/goals-screen';

export const metadata: Metadata = {
  title: 'Goals',
};

export default function GoalsPage() {
  return <GoalsScreen />;
}
