import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SavedRepliesService } from './saved-replies.service';

export class CreateSavedReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class UpdateSavedReplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body?: string;
}

/**
 * Saved replies for chat. A controller of its own rather than routes under
 * /messages, where `/:id` would have to be kept from swallowing them.
 */
@Controller('saved-replies')
export class SavedRepliesController {
  constructor(private readonly replies: SavedRepliesService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.replies.list(userId).then((data) => ({ data, total: data.length }));
  }

  @HttpCode(201)
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateSavedReplyDto) {
    return this.replies.create(userId, dto.title, dto.body);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSavedReplyDto,
  ) {
    return this.replies.update(userId, id, { title: dto.title, body: dto.body });
  }

  @HttpCode(200)
  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.replies.remove(userId, id);
  }
}
