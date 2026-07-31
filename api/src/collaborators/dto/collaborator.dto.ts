import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
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
