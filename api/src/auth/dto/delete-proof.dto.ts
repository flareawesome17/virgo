import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * The body of DELETE /workspaces/:id and DELETE /albums/:id: the password,
 * or a two-factor challenge and its code. Every field is optional here so an
 * app from before this gets ReauthService's "update Virgo" answer rather than
 * a validation error.
 */
export class DeleteProofDto {
  @IsOptional()
  @IsString()
  @MaxLength(72)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  challengeToken?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:\d{6}|[A-Za-z2-7 -]{10,32})$/, {
    message: 'Enter the 6-digit email code or a recovery code',
  })
  code?: string;
}
