import {
  AppWindow,
  BedDouble,
  Briefcase,
  Building2,
  Camera,
  Car,
  Coins,
  Ellipsis,
  Megaphone,
  Package,
  Percent,
  Printer,
  Scissors,
  Sparkles,
  Users,
  Utensils,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type { MoneyKind } from '@/api';

/** The phone's icons for each category (mobile/components/money/icons.ts). */
const INCOME: Record<string, LucideIcon> = {
  job: Briefcase,
  crew: Users,
  editing: Scissors,
  products: Printer,
  other: Coins,
};

const EXPENSE: Record<string, LucideIcon> = {
  transport: Car,
  meals: Utensils,
  accommodation: BedDouble,
  crew: Users,
  gear: Camera,
  rental: Package,
  supplies: Sparkles,
  software: AppWindow,
  data: Wifi,
  studio: Building2,
  printing: Printer,
  marketing: Megaphone,
  fees: Percent,
  other: Ellipsis,
};

/** A category's icon, drawn. A component rather than a lookup in the caller,
 * so the icon is never a component made during someone else's render. */
export function CategoryIcon({
  kind,
  slug,
  className,
}: {
  kind: MoneyKind;
  slug: string;
  className?: string;
}) {
  const Icon = (kind === 'income' ? INCOME : EXPENSE)[slug] ?? (kind === 'income' ? Coins : Ellipsis);
  return <Icon className={className} aria-hidden />;
}
