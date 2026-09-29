import type { Metadata } from 'next';
import { IdeasScreen } from '@/components/ideas/ideas-screen';

export const metadata: Metadata = {
  title: 'Ideas',
};

export default function IdeasPage() {
  return <IdeasScreen />;
}
