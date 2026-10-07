import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
} from 'class-validator';
import { IsCalendarDate } from '../../common/validators/calendar-date';
import { MAX_RECEIPT_BYTES, RECEIPT_FILE_TYPES } from '../../storage/receipt-files.service';
import {
  ALL_MONEY_CATEGORIES,
  MAX_AMOUNT_MINOR,
  MONEY_KINDS,
  MONEY_METHODS,
  type MoneyKind,
  type MoneyMethod,
} from '../money.categories';

/** Query strings arrive as "true"/"false"; bodies arrive as real booleans. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/**
 * A new entry.
 *
 * Amounts are centavos, so ₱1,500 is 150000. Whether the category belongs to
 * the kind, and whether withholding is allowed at all, is checked in the
 * service — it needs both fields at once, and on an edit one of them may come
 * from the row already saved.
 */
export class CreateMoneyEntryDto {
  /** Made on the device, so a retried save finds the entry it already wrote. */
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @IsIn(MONEY_KINDS as unknown as string[])
  kind!: MoneyKind;

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_MINOR)
  amountMinor!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_MINOR)
  withheldMinor?: number;

  @IsIn(ALL_MONEY_CATEGORIES as string[])
  category!: string;

  @IsCalendarDate()
  occurredOn!: string;

  /** Null, or left out, is not paid yet. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  paidOn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(MONEY_METHODS as unknown as string[])
  method?: MoneyMethod | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  reference?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  counterparty?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  /** From POST /money/receipts, once its bytes are in the bucket. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  receiptId?: string | null;

  /** The booking it records — one the caller is on. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  bookingId?: string | null;

  /** Your package it is a payment toward (income) or a cost of (expense). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  packageId?: string | null;
}

/**
 * Changing an entry.
 *
 * Every field optional, and `undefined` means "leave it alone" — distinct from
 * `null`, which clears one. Without that distinction marking an entry paid
 * would wipe its note.
 */
export class UpdateMoneyEntryDto {
  @IsOptional()
  @IsIn(MONEY_KINDS as unknown as string[])
  kind?: MoneyKind;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_MINOR)
  amountMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_MINOR)
  withheldMinor?: number;

  @IsOptional()
  @IsIn(ALL_MONEY_CATEGORIES as string[])
  category?: string;

  @IsOptional()
  @IsCalendarDate()
  occurredOn?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  paidOn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(MONEY_METHODS as unknown as string[])
  method?: MoneyMethod | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  reference?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  counterparty?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  receiptId?: string | null;

  /** The booking it records — one the caller is on. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  bookingId?: string | null;

  /** Your package it is a payment toward (income) or a cost of (expense). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  packageId?: string | null;
}

export class ListMoneyEntriesDto {
  /** Filed on or after this day (YYYY-MM-DD). */
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  /** Filed on or before this day. */
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @IsOptional()
  @IsIn(MONEY_KINDS as unknown as string[])
  kind?: MoneyKind;

  /** Only what is still outstanding: owed to you, or not yet paid by you. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unpaid?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/** A span of days, both ends included: a month, a quarter, a year. */
export class MoneyRangeDto {
  @IsCalendarDate()
  from!: string;

  @IsCalendarDate()
  to!: string;
}

/** One year of Insights. */
export class MoneyInsightsDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

/** One year of tax help. */
export class MoneyTaxDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

/** Ticks entries' 2307s as in hand, or not: usually a client's whole quarter. */
export class Mark2307Dto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  entryIds!: string[];

  @IsBoolean()
  received!: boolean;
}

/** Repeat this entry every month. */
export class CreateMoneyRecurringDto {
  @IsUUID('all')
  entryId!: string;
}

/** Changing what a repeating entry makes from now on. Kind and day stay. */
export class UpdateMoneyRecurringDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_MINOR)
  amountMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_AMOUNT_MINOR)
  withheldMinor?: number;

  @IsOptional()
  @IsIn(ALL_MONEY_CATEGORIES as string[])
  category?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(MONEY_METHODS as unknown as string[])
  method?: MoneyMethod | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  counterparty?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class ReceiptUploadDto {
  @IsIn(RECEIPT_FILE_TYPES as unknown as string[])
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_RECEIPT_BYTES)
  contentLength!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;
}
