import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { HANDLE_MAX, HANDLE_MIN } from '../../profiles/handles';

/**
 * Names the person a block or report is about.
 *
 * Every key is optional here and BlocksService.resolvePerson insists on
 * exactly one, so "none" and "two" get the same sentence rather than a
 * validator's list of fields.
 */
export class PersonRefDto {
  @IsOptional()
  @IsString()
  @MinLength(HANDLE_MIN)
  @MaxLength(HANDLE_MAX)
  handle?: string;

  @IsOptional()
  @IsUUID('all')
  userId?: string;

  @IsOptional()
  @IsUUID('all')
  applicationId?: string;

  @IsOptional()
  @IsUUID('all')
  enquiryId?: string;

  @IsOptional()
  @IsUUID('all')
  jobPostId?: string;
}

/** The same list the user_reports check constraint enforces. */
export const USER_REPORT_REASONS = [
  'spam',
  'scam',
  'harassment',
  'impersonation',
  'inappropriate',
  'other',
] as const;

/**
 * Where in the app the report was made, for triage. The same list the
 * user_reports source check enforces. `requests` is an incoming friend
 * request, often the only place a stranger with no public profile appears.
 */
export const REPORT_SOURCES = [
  'profile',
  'chat',
  'nearby',
  'applicants',
  'enquiries',
  'job',
  'requests',
] as const;

export class ReportPersonDto extends PersonRefDto {
  @IsIn(USER_REPORT_REASONS)
  reason!: (typeof USER_REPORT_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Stored as `source`; `from` is what the screens call it. */
  @IsOptional()
  @IsIn(REPORT_SOURCES)
  from?: (typeof REPORT_SOURCES)[number];
}
