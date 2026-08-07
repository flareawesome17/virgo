import {
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWorkspaceDto {
  /** Optional: the mobile app generates ids client-side; the API generates one otherwise. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsHexColor()
  accent_color?: string;

  /**
   * Accepted and ignored.
   *
   * Both counts are derived from albums and collaborators now, and neither is
   * on the repository's writableColumns, so anything sent here is dropped.
   * The fields stay on the DTO on purpose: `forbidNonWhitelisted` is on, and
   * mobile bundles already installed still post `collaborator_count: 1` from
   * their create screen. Removing these would turn that into a 400 and break
   * workspace creation on every phone that has not updated.
   *
   * Safe to delete once those builds are gone.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  media_count?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  collaborator_count?: number;
}

export class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsHexColor()
  accent_color?: string;

  /**
   * Accepted and ignored.
   *
   * Both counts are derived from albums and collaborators now, and neither is
   * on the repository's writableColumns, so anything sent here is dropped.
   * The fields stay on the DTO on purpose: `forbidNonWhitelisted` is on, and
   * mobile bundles already installed still post `collaborator_count: 1` from
   * their create screen. Removing these would turn that into a 400 and break
   * workspace creation on every phone that has not updated.
   *
   * Safe to delete once those builds are gone.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  media_count?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  collaborator_count?: number;
}
