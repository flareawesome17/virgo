import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
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

export class ListAlbumsDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workspace_id?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
