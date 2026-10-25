import { IsString, MaxLength } from 'class-validator';

/** The secret from a sign-in alert's link. */
export class SignInAlertDto {
  @IsString()
  @MaxLength(128)
  token!: string;
}
