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
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PortfolioService } from './portfolio.service';

export class AddPortfolioItemDto {
  @IsIn(['image', 'album'])
  kind!: 'image' | 'album';

  /** Required when `kind` is 'image'. Validated against ownership in the service. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileKey?: string;

  /** Required when `kind` is 'album'. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  albumId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  caption?: string;
}

export class ReorderPortfolioDto {
  @IsArray()
  @ArrayMaxSize(64)
  @IsUUID('4', { each: true })
  ids!: string[];
}

/** The owner's portfolio editor. Reading it publicly goes through /profiles/:handle. */
@Controller('me/portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  async list(@CurrentUser('id') userId: string) {
    const data = await this.portfolio.list(userId, { forOwner: true });
    return { data, total: data.length };
  }

  @HttpCode(200)
  @Post()
  async add(
    @CurrentUser('id') userId: string,
    @Body() dto: AddPortfolioItemDto,
  ) {
    const data =
      dto.kind === 'image'
        ? await this.portfolio.addImage(userId, dto.fileKey ?? '', dto.caption)
        : await this.portfolio.addAlbum(userId, dto.albumId ?? '', dto.caption);
    return { data, total: data.length };
  }

  @HttpCode(200)
  @Patch('order')
  async reorder(
    @CurrentUser('id') userId: string,
    @Body() dto: ReorderPortfolioDto,
  ) {
    const data = await this.portfolio.reorder(userId, dto.ids);
    return { data, total: data.length };
  }

  @HttpCode(200)
  @Delete(':id')
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const data = await this.portfolio.remove(userId, id);
    return { data, total: data.length };
  }
}
