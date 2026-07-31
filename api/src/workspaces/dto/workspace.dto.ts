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

  @IsOptional()
  @IsInt()
  @Min(0)
  media_count?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  collaborator_count?: number;
}
