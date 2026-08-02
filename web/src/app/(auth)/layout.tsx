import type { ReactNode } from 'react';

/** Signed-out pages: sign in, sign up, and the public legal document. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}
