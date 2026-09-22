import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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

  /**
   * The album this upload is for, when it is for one.
   *
   * An upload into someone else's album is stored against that album's
   * owner, so it has to fit in their storage, not the uploader's. Without the
   * album the ticket could only check the uploader — a collaborator on a full
   * free plan was refused room in an album whose owner had plenty, and one
   * with room could fill the owner's. Optional, because apps already
   * installed do not send it; they get the check they always had.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  albumId?: string;
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

  /** Original device filename; optional for already-released clients. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalName?: string;
}

/** Several objects at once — deleting a selection. */
export class ObjectKeysDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  keys!: string[];
}

/** A selection from one album, to download as a zip. */
export class ZipSelectionDto extends ObjectKeysDto {
  @IsString()
  @MaxLength(64)
  albumId!: string;
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
  @IsIn(['image', 'video', 'audio', 'other'])
  kind?: 'image' | 'video' | 'audio' | 'other';

  /** By capture time. Newest first when omitted, which is what it always was. */
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  order?: 'newest' | 'oldest';

  /** A section id, or `none` for files in no section. Needs `albumId`. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;

  /** `true` for only what the client picked. Needs `albumId`. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  picked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Accepted up to the legacy ceiling so existing unassigned-file clients do
  // not fail validation; paged album listings clamp this to 100 internally.
  @Max(500)
  limit?: number;
}
