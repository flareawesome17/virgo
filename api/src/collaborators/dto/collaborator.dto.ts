import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ListQueryDto } from '../../common/dto/list-query.dto';

const MEDIA_ACCESS = ['view', 'download', 'upload', 'manage'] as const;

/** One album, and what the collaborator may do with the media inside it. */
export class AlbumGrantDto {
  @IsString()
  @MaxLength(64)
  album_id!: string;

  @IsOptional()
  @IsIn(MEDIA_ACCESS)
  media_access?: (typeof MEDIA_ACCESS)[number];
}

const ROLES = [
  'owner',
  'photographer',
  'editor',
  'reviewer',
  'client',
] as const;

export class CreateCollaboratorDto {
  /**
   * Albums to share, with the access level for each.
   *
   * Omitted means the workspace's albums as they stand — which is what
   * inviting someone to a workspace has always meant. Albums created later
   * are private until granted.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AlbumGrantDto)
  albums?: AlbumGrantDto[];

  /**
   * The older shape, ids only, defaulting to 'view'. Kept because bundles
   * already installed on people's phones still send it.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  album_ids?: string[];

  /** The friend being added. Required: collaborators are real accounts. */
  @IsString()
  @MaxLength(64)
  collaborator_user_id!: string;

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
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  avatar_url?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];
}

export class UpdateCollaboratorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  avatar_url?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];
}

export class ListCollaboratorsDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workspace_id?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: (typeof ROLES)[number];
}

/** Replaces which albums an existing collaborator can see. */
export class UpdateCollaboratorAlbumsDto {
  /** The new selection, with an access level per album. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AlbumGrantDto)
  albums?: AlbumGrantDto[];

  /** The older ids-only shape, still sent by installed bundles. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  album_ids?: string[];
}
