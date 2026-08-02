import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { MessagesService } from './messages.service';

export class OpenDirectDto {
  @IsString()
  @MaxLength(64)
  userId!: string;
}

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  memberIds!: string[];
}

export class AddMemberDto {
  @IsString()
  @MaxLength(64)
  userId!: string;
}

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class ThreadQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

// 'messages', not 'chat': ServicesController already owns POST /chat and
// /chat/stream for the AI proxy, and /chat/stream would be captured by this
// controller's /:id routes.
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** The caller's conversations, most recently active first. */
  @Get('conversations')
  conversations(@CurrentUser('id') userId: string) {
    return this.messages
      .conversations(userId)
      .then((data) => ({ data, total: data.length }));
  }

  /** Drives the tab badge. */
  @Get('unread')
  unread(@CurrentUser('id') userId: string) {
    return this.messages.unreadCount(userId).then((count) => ({ count }));
  }

  /** Opens or reuses a one-to-one chat. */
  @HttpCode(200)
  @Post('direct')
  openDirect(@CurrentUser('id') userId: string, @Body() dto: OpenDirectDto) {
    return this.messages.openDirect(userId, dto.userId);
  }

  @HttpCode(201)
  @Post('groups')
  createGroup(@CurrentUser('id') userId: string, @Body() dto: CreateGroupDto) {
    return this.messages.createGroup(userId, dto.title, dto.memberIds);
  }

  // Routes below take a conversation id, so they are declared after the
  // static paths above to keep "conversations" and "unread" from matching.

  @Get(':id/messages')
  messages_(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query() query: ThreadQueryDto,
  ) {
    return this.messages
      .messages(userId, id, query.limit)
      .then((data) => ({ data, total: data.length }));
  }

  @Get(':id/participants')
  participants(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.messages
      .participants(userId, id)
      .then((data) => ({ data, total: data.length }));
  }

  @HttpCode(201)
  @Post(':id/messages')
  send(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(userId, id, dto.body);
  }

  @HttpCode(200)
  @Post(':id/read')
  markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.messages.markRead(userId, id);
  }

  @HttpCode(200)
  @Post(':id/members')
  addMember(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.messages.addMember(userId, id, dto.userId);
  }

  @HttpCode(200)
  @Delete(':id/members/me')
  leave(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.messages.leave(userId, id);
  }
}
