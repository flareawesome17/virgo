import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  UPLOAD_SCOPES,
} from '../storage.config';

export class CreateUploadUrlDto {
  @IsIn(ALLOWED_CONTENT_TYPES as unknown as string[], {
    message: 'Unsupported content type',
  })
  contentType!: string;

  @IsIn(UPLOAD_SCOPES as unknown as string[])
  scope!: (typeof UPLOAD_SCOPES)[number];

  /**
   * Required, not optional: the size is baked into the presigned signature, so
   * the client cannot exceed what it declares here.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  contentLength!: number;
}

export class ObjectKeyDto {
  @IsString()
  @MaxLength(1024)
  key!: string;
}

export class ConfirmUploadDto extends ObjectKeyDto {
  /** Links the stored object to an album so album screens can list it. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  albumId?: string;
}

export class AttachToAlbumDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  keys!: string[];

  @IsString()
  @MaxLength(64)
  albumId!: string;
}

/**
 * Wiping is irreversible, so the client has to say so explicitly. This is not
 * a security control — it stops a stray POST from emptying someone's bucket.
 */
export class WipeStorageDto {
  @IsIn(['DELETE'], { message: 'Confirmation text does not match' })
  confirm!: string;
}

export class ListFilesDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  albumId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
