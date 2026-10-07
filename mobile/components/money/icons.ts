import {
  AppWindowIcon,
  BedDoubleIcon,
  BriefcaseIcon,
  Building2Icon,
  CameraIcon,
  CarIcon,
  CoinsIcon,
  EllipsisIcon,
  MegaphoneIcon,
  PackageIcon,
  PercentIcon,
  PrinterIcon,
  ScissorsIcon,
  SparklesIcon,
  UsersIcon,
  UtensilsIcon,
  WifiIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { MoneyKind } from '@/src/api';

for (const Icon of [
  AppWindowIcon, BedDoubleIcon, BriefcaseIcon, Building2Icon, CameraIcon, CarIcon, CoinsIcon,
  EllipsisIcon, MegaphoneIcon, PackageIcon, PercentIcon, PrinterIcon, ScissorsIcon, SparklesIcon,
  UsersIcon, UtensilsIcon, WifiIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const INCOME: Record<string, LucideIcon> = {
  job: BriefcaseIcon,
  crew: UsersIcon,
  editing: ScissorsIcon,
  products: PrinterIcon,
  other: CoinsIcon,
};

const EXPENSE: Record<string, LucideIcon> = {
  transport: CarIcon,
  meals: UtensilsIcon,
  accommodation: BedDoubleIcon,
  crew: UsersIcon,
  gear: CameraIcon,
  rental: PackageIcon,
  supplies: SparklesIcon,
  software: AppWindowIcon,
  data: WifiIcon,
  studio: Building2Icon,
  printing: PrinterIcon,
  marketing: MegaphoneIcon,
  fees: PercentIcon,
  other: EllipsisIcon,
};

/** The icon on a category's chip and on its rows. */
export function categoryIcon(kind: MoneyKind, slug: string): LucideIcon {
  return (kind === 'income' ? INCOME : EXPENSE)[slug] ?? (kind === 'income' ? CoinsIcon : EllipsisIcon);
}
