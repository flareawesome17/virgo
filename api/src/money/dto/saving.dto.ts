import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validators/calendar-date';
import { MAX_SAVING_MINOR, SAVING_ICONS, type SavingIcon } from '../money-savings.service';

export class CreateSavingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsIn(SAVING_ICONS)
  icon?: SavingIcon;

  /** What to reach, in centavos. Null or left out is a running total. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_SAVING_MINOR)
  goalMinor?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  targetDate?: string | null;

  /** Where it is kept, in their words: "GCash", "BPI". */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  keptIn?: string | null;

  /** What is already put aside, recorded as the first move. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SAVING_MINOR)
  startingMinor?: number;
}

export class UpdateSavingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(SAVING_ICONS)
  icon?: SavingIcon;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_SAVING_MINOR)
  goalMinor?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsCalendarDate()
  targetDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  keptIn?: string | null;
}

export class CreateSavingMoveDto {
  /** In centavos: positive puts money in, negative takes it out. */
  @IsInt()
  @NotEquals(0)
  @Min(-MAX_SAVING_MINOR)
  @Max(MAX_SAVING_MINOR)
  amountMinor!: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  note?: string | null;

  /** The day it moved; today when left out. */
  @IsOptional()
  @IsCalendarDate()
  movedOn?: string;
}

export class ListSavingsDto {
  /** The month "added this month" is counted over, YYYY-MM; this month when left out. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}
