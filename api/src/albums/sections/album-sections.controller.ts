import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AlbumSectionsService } from './album-sections.service';

export class SectionNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class ReorderSectionsDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ids!: string[];
}

export class AssignSectionDto {
  /** Same ceiling as attaching files to an album. */
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  keys!: string[];

  /** null takes the files out of whatever section they are in. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(64)
  sectionId!: string | null;
}

/**
 * An album's sections.
 *
 * `reorder` and `assign` are POSTs on the collection rather than PATCHes on a
 * section: each changes many rows at once, and neither names one section.
 * Declared before `:sectionId` so neither word is read as an id.
 */
@Controller('albums/:albumId/sections')
export class AlbumSectionsController {
  constructor(private readonly sections: AlbumSectionsService) {}

  @Get()
  list(@CurrentUser('id') userId: string, @Param('albumId') albumId: string) {
    return this.sections.list(userId, albumId);
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Param('albumId') albumId: string,
    @Body() dto: SectionNameDto,
  ) {
    return this.sections.create(userId, albumId, dto.name);
  }

  @HttpCode(200)
  @Post('reorder')
  reorder(
    @CurrentUser('id') userId: string,
    @Param('albumId') albumId: string,
    @Body() dto: ReorderSectionsDto,
  ) {
    return this.sections.reorder(userId, albumId, dto.ids);
  }

  @HttpCode(200)
  @Post('assign')
  assign(
    @CurrentUser('id') userId: string,
    @Param('albumId') albumId: string,
    @Body() dto: AssignSectionDto,
  ) {
    return this.sections.assign(userId, albumId, dto.keys, dto.sectionId ?? null);
  }

  @Patch(':sectionId')
  rename(
    @CurrentUser('id') userId: string,
    @Param('albumId') albumId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: SectionNameDto,
  ) {
    return this.sections.rename(userId, albumId, sectionId, dto.name);
  }

  @HttpCode(204)
  @Delete(':sectionId')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('albumId') albumId: string,
    @Param('sectionId') sectionId: string,
  ): Promise<void> {
    await this.sections.remove(userId, albumId, sectionId);
  }
}
