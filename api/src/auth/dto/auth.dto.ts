import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
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

  /*
   * Postal address, collected on the last step of signup and required there.
   *
   * These four went required only once both clients had the three-step form
   * that asks for them — requiring a field no client sends turns every signup
   * into a 400, which is exactly what shipping the server first did.
   *
   * Line two and the postal code stay optional. Plenty of Philippine
   * addresses have neither, and rejecting somebody for having no ZIP is
   * rejecting them for where they live.
   *
   * Accounts made before this have no address and are not broken: the columns
   * are nullable and nothing reads them yet. The requirement lives here, at
   * the point of collection where it can be explained, rather than as a
   * constraint that would make older rows illegal.
   *
   * Private: never returned on a public profile, never shown to another user.
   */
  @IsString()
  @MinLength(4, { message: 'Give a street address' })
  @MaxLength(200)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @MinLength(2, { message: 'Give a city or municipality' })
  @MaxLength(120)
  addressCity!: string;

  @IsString()
  @MinLength(2, { message: 'Give a province or region' })
  @MaxLength(120)
  addressProvince!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressPostal?: string;

  /*
   * Upper-cased here rather than trusted from the client. Both forms send
   * "PH", but the endpoint accepted "ph" from anything that did not, and the
   * column would then hold both — which splits every count by country in two,
   * and counting by country is the reason this is collected at all.
   *
   * Length runs after the transform, so " ph " is still two characters.
   */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(2, 2, { message: 'Use a two-letter country code' })
  addressCountry!: string;

  /** What they trade as, if that is not their own name. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  studioName?: string;

  /** An Instagram handle, a page, or a URL — whatever they actually use. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  socialHandle?: string;

  /*
   * Somebody else's referral code, if they were invited.
   *
   * Upper-cased and trimmed here for the same reason the country code is:
   * codes are generated upper-case, and a person retyping one from a message
   * types whatever their keyboard gave them. Matching should not depend on
   * that.
   *
   * An unknown code is not an error — see AuthService.register. Validation
   * here is only about shape.
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(32)
  referralCode?: string;
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

  /**
   * Required if supplied at all.
   *
   * ArrayMinSize as well as ArrayMaxSize: roles are what Nearby filters on, so
   * an account with none is invisible to anyone searching for the thing they
   * actually do. Sign-up already demands at least one; without this, the edit
   * screen would be a way to undo that.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one role' })
  @ArrayMaxSize(USER_ROLES.length)
  @IsIn(USER_ROLES as readonly string[], { each: true, message: 'Unknown role' })
  roles?: string[];

  /*
   * The address, editable after signup — people move.
   *
   * These four may be changed but not emptied: signup demands them, so an
   * edit screen that accepted a blank would be a way to undo that. Omit the
   * key to leave the address alone, which is also what lets the accounts that
   * predate migration 050 save the rest of their profile without being made
   * to invent an address they were never asked for.
   *
   * ValidateIf on `undefined` rather than @IsOptional, which is the whole
   * point here: @IsOptional skips null *and* undefined, so `{"addressCity":
   * null}` sailed past every validator below and wrote a null into a column
   * signup will not let you leave empty. Verified — it emptied a city.
   * ValidateIf skips only a genuinely absent key, and @IsString then rejects
   * the null.
   */
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'Give a street address' })
  @MinLength(4, { message: 'Give a street address' })
  @MaxLength(200)
  addressLine1?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'Give a city or municipality' })
  @MinLength(2, { message: 'Give a city or municipality' })
  @MaxLength(120)
  addressCity?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'Give a province or region' })
  @MinLength(2, { message: 'Give a province or region' })
  @MaxLength(120)
  addressProvince?: string;

  /** Upper-cased at the boundary, exactly as at signup — see RegisterDto. */
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString({ message: 'Use a two-letter country code' })
  @Length(2, 2, { message: 'Use a two-letter country code' })
  addressCountry?: string;

  /*
   * These four are nullable, because they are genuinely optional: an address
   * with no unit number and no ZIP is a complete address, and somebody who
   * closes their studio should be able to empty the field rather than leave a
   * business name that is no longer theirs.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(20)
  addressPostal?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  studioName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  socialHandle?: string | null;
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
