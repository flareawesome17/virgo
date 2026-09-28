import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * What a showcase is allowed to be, and the shapes its routes accept.
 *
 * The ceilings are here rather than in the service because a client needs the
 * same numbers to disable its own controls, and the pair drifting is what left
 * the portfolio editor swallowing taps at a cap it had hard-coded separately.
 */

/** Ten pieces. Past that it is an album, and albums already exist. */
export const MAX_SHOWCASE_ITEMS = 10;

/** "85mm", "f/1.4", "Backlit". Enough to say how, not enough to be a form. */
export const MAX_CRAFT_TAGS = 6;
export const MAX_CRAFT_TAG_LENGTH = 32;

/**
 * There is no 'private'. An unpublished showcase is one with no published_at,
 * which is a different state from one published to nobody.
 */
export const SHOWCASE_VISIBILITY = ['public', 'connections'] as const;
export type ShowcaseVisibility = (typeof SHOWCASE_VISIBILITY)[number];

export class CreateShowcaseDto {
  /**
   * The pieces, in the order they should appear. The first is the cover.
   *
   * Keys rather than ids because that is what `user_files` is unique on and
   * what every other media route already takes. Ownership, type and whether a
   * web copy can be made are all checked in the service.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SHOWCASE_ITEMS)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  fileKeys!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  /** How it was made, in the maker's words. Never read from the file. */
  @IsOptional()
  @IsString()
  @MaxLength(600)
  craftNote?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CRAFT_TAGS)
  @IsString({ each: true })
  @MaxLength(MAX_CRAFT_TAG_LENGTH, { each: true })
  craftTags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsIn(SHOWCASE_VISIBILITY)
  visibility?: ShowcaseVisibility;

  @IsOptional()
  @IsBoolean()
  allowDownloads?: boolean;

  @IsOptional()
  @IsBoolean()
  allowComments?: boolean;

  @IsOptional()
  @IsBoolean()
  showHire?: boolean;

  /**
   * Post it now, rather than leaving it as a draft. Separate from the row's
   * published_at so a client never sends a timestamp of its own.
   */
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

/**
 * Every field optional, and `fileKeys` REPLACES the set when it is sent.
 *
 * Replacing rather than patching because the order is part of the meaning — the
 * first piece is the cover — and a partial update has no way to say "these, in
 * this order" without a second call to reorder.
 */
export class UpdateShowcaseDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SHOWCASE_ITEMS)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  fileKeys?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  craftNote?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CRAFT_TAGS)
  @IsString({ each: true })
  @MaxLength(MAX_CRAFT_TAG_LENGTH, { each: true })
  craftTags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @IsIn(SHOWCASE_VISIBILITY)
  visibility?: ShowcaseVisibility;

  @IsOptional()
  @IsBoolean()
  allowDownloads?: boolean;

  @IsOptional()
  @IsBoolean()
  allowComments?: boolean;

  @IsOptional()
  @IsBoolean()
  showHire?: boolean;
}

/** A shelf: a named group of other people's work. */
export class CreateShelfDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateShelfDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

/** Keeping somebody's showcase on one of your shelves. */
export class KeepShowcaseDto {
  @IsUUID('4')
  showcaseId!: string;

  /** Why this one. Shown on the shelf beside the work. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
