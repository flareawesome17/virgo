import type { Metadata } from 'next';
import PageClient from './page-client';

export const metadata: Metadata = { title: 'How clients pay you' };

export default function Page() {
  return <PageClient />;
}
