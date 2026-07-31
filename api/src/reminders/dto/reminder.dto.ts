import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

/** Query strings arrive as "true"/"false"; bodies arrive as real booleans. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CreateReminderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  schedule_event_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString()
  reminder_time!: string;

  @IsOptional()
  @IsBoolean()
  is_alarm_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  has_push_notification?: boolean;

  @IsOptional()
  @IsBoolean()
  is_completed?: boolean;
}

export class UpdateReminderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  schedule_event_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  reminder_time?: string;

  @IsOptional()
  @IsBoolean()
  is_alarm_enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  has_push_notification?: boolean;

  @IsOptional()
  @IsBoolean()
  is_completed?: boolean;
}

export class ListRemindersDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  schedule_event_id?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_completed?: boolean;
}
