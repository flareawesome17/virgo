import type { ComponentType, ReactNode } from 'react';

/** One row of a settings card: what it is, what it does, and its control. */
export function SettingRow({
  icon: Icon,
  title,
  detail,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b px-5 py-4 last:border-0">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

