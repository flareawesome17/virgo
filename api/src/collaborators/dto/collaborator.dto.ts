import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

const ROLES = [
  'owner',
  'photographer',
  'editor',
  'reviewer',
  'client',
] as const;

export class CreateCollaboratorDto {
  /**
   * Albums to share. Omitted means every album in the workspace, including
   * ones created later.
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
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  album_ids!: string[];
}
