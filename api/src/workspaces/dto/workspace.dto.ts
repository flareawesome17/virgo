import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

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

  /** Archives it (true) or brings it back (false). */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  /**
   * The album whose cover stands for the workspace, or null to go back to
   * the newest album with one. (IsOptional lets null through.)
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cover_album_id?: string | null;

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

/** The list: which workspaces, and in what order. */
export class ListWorkspacesDto extends ListQueryDto {
  /**
   * Left out by default. `only` is the archive; `include` is everything,
   * for a picker that has to find an album's workspace whatever its state.
   */
  @IsOptional()
  @IsIn(['exclude', 'only', 'include'])
  archived?: 'exclude' | 'only' | 'include';
}

/** How much of a workspace's feed to read. */
export class WorkspaceActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
