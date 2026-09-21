import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

const STATUSES = ['draft', 'review', 'delivered'] as const;

export class CreateAlbumDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MaxLength(64)
  workspace_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  cover_url?: string;

  /**
   * Accepted and ignored.
   *
   * The count is derived from the album's files on every read, and it is not
   * on the repository's writableColumns, so anything sent here is dropped.
   * The field stays on purpose: `forbidNonWhitelisted` is on, and mobile
   * bundles already installed post `item_count: 0` from their create screen.
   * Removing it would turn that into a 400 and break album creation on every
   * phone that has not updated.
   *
   * Safe to delete once those builds are gone. Update never had a sender —
   * the apps stopped writing the count when they moved to this API — so it
   * refuses the field outright.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  item_count?: number;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  retention_days?: number;
}

export class UpdateAlbumDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workspace_id?: string;

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
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  cover_url?: string;

  /**
   * A photograph already in the album, by key, or null to go back to the
   * newest image. Checked against the album on the server.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1024)
  cover_key?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  retention_days?: number;
}

export class ListAlbumsDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workspace_id?: string;

  /** Matches the album's name, description, or its workspace's name. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
