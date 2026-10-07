import type { Metadata } from 'next';
import PageClient from './page-client';

export const metadata: Metadata = { title: 'Repeats every month' };

export default function Page() {
  return <PageClient />;
}
