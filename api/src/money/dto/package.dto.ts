import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validators/calendar-date';
import { MAX_AMOUNT_MINOR } from '../money.categories';
import { PAY_METHOD_KINDS, type PayMethodKind } from '../money-pay-methods.service';

/** The down payment or reservation fee, as the package is made. */
class DepositDto {
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_MINOR)
  amountMinor!: number;

  /** Paid on this day; null or left out is still due. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  paidOn?: string | null;

  /** Due on this day, while unpaid. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  dueOn?: string | null;
}

export class CreatePackageDto {
  /** Made on the device, so a retried save finds the package it already made. */
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  clientName?: string | null;

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_MINOR)
  totalMinor!: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  eventDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => DepositDto)
  deposit?: DepositDto | null;

  /** When the rest is due; left out, it is not scheduled yet. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  balanceDueOn?: string | null;
}

export class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  clientName?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_MINOR)
  totalMinor?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  eventDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class ListPackagesDto {
  /** `open`: only the ones with something still owed. */
  @IsOptional()
  @IsIn(['open', 'all'])
  status?: 'open' | 'all';
}

export class CreatePayMethodDto {
  @IsIn(PAY_METHOD_KINDS as unknown as string[])
  kind!: PayMethodKind;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  label?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  accountName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  accountNumber?: string | null;

  /** From POST /money/receipts; null removes the QR code. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  qrReceiptId?: string | null;
}

export class UpdatePayMethodDto {
  @IsOptional()
  @IsIn(PAY_METHOD_KINDS as unknown as string[])
  kind?: PayMethodKind;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  label?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  accountName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  accountNumber?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  qrReceiptId?: string | null;
}
