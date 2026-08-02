import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { USER_ROLES } from '../roles';

export class RegisterDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email!: string;

  // 8 is the floor, but the 72-byte cap is not stylistic: bcrypt silently
  // truncates beyond 72 bytes, so anything longer would give users a false
  // sense of strength.
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must be at most 72 characters' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  /**
   * What they do on a shoot. Required, and more than one is normal — a
   * photographer who also cuts the SDE holds both.
   */
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one role' })
  @ArrayMaxSize(USER_ROLES.length)
  @IsIn(USER_ROLES as readonly string[], {
    each: true,
    message: 'Unknown role',
  })
  roles!: string[];
}

export class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(72)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

/**
 * Pausing an account.
 *
 * The password is required rather than relying on the bearer token: an
 * unlocked, borrowed phone is a session, not the account's owner, and this is
 * one of the two actions that cannot be undone by signing in again.
 */
export class DisableAccountDto {
  @IsString()
  @MaxLength(72)
  password!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Pause for at least one day' })
  @Max(365, { message: 'Pause for at most a year' })
  days!: number;
}

export class DeleteAccountDto {
  @IsString()
  @MaxLength(72)
  password!: string;

  /**
   * The word DELETE, typed out.
   *
   * Belt and braces on top of the password: a password can be in a manager and
   * filled without reading the dialog, and this is the one action in the app
   * with nothing behind it to undo.
   */
  @IsString()
  @Matches(/^DELETE$/, { message: 'Type DELETE to confirm' })
  confirm!: string;
}

export class UpdateProfileDto {
  // ValidateIf lets an explicit null through (clearing the field) while still
  // validating a supplied string. A plain @IsOptional() would also skip null,
  // but this makes the "null clears it" contract explicit.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  avatarUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  // Not @IsUrl: people type "riyakapoor.com" without a scheme, and rejecting
  // that would be pedantic for a display-only field.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  website?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  location?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  bio?: string | null;

  /**
   * Whether name search can surface this account.
   *
   * Not nullable like the rest: this is a setting, and "unset" is not a state
   * it can be in.
   */
  @IsOptional()
  @IsBoolean()
  discoverable?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(USER_ROLES.length)
  @IsIn(USER_ROLES as readonly string[], { each: true, message: 'Unknown role' })
  roles?: string[];
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  token!: string;

  // The same floor and 72-byte bcrypt ceiling as registration.
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(20)
  @MaxLength(256)
  token!: string;
}
