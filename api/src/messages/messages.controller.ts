import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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

  /** Message being replied to. Must be in the same conversation. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  replyToId?: string;

  /** Accounts named in the body. Non-participants are dropped, not rejected. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  mentionIds?: string[];
}

export class MuteDto {
  /**
   * Minutes to stay muted. Omitted or 0 unmutes; anything at or above a year
   * is treated as "until I turn it back on".
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(525_600)
  minutes?: number;
}

export class RenameConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}

export class DeleteMessageQueryDto {
  /**
   * 'me' hides it from your own view; 'everyone' removes the text for all
   * participants and is limited to your own messages.
   */
  @IsOptional()
  @IsIn(['me', 'everyone'])
  scope?: 'me' | 'everyone';
}

export class ThreadQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ConversationsQueryDto {
  /** Matches a group name, a participant's name, or a message body. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

// 'messages', not 'chat': ServicesController already owns POST /chat and
// /chat/stream for the AI proxy, and /chat/stream would be captured by this
// controller's /:id routes.
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** The caller's conversations, most recently active first. */
  @Get('conversations')
  conversations(
    @CurrentUser('id') userId: string,
    @Query() query: ConversationsQueryDto,
  ) {
    return this.messages
      .conversations(userId, query.q)
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
      .then(({ messages, lastReadAt }) => ({
        data: messages,
        total: messages.length,
        // Where the caller had read up to before this call, for the
        // "new messages" divider.
        lastReadAt,
      }));
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
    return this.messages.send(userId, id, dto.body, {
      replyToId: dto.replyToId,
      mentionIds: dto.mentionIds,
    });
  }

  /** Deletes one message, for yourself or for everyone. */
  @HttpCode(200)
  @Delete(':id/messages/:messageId')
  deleteMessage(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @Query() query: DeleteMessageQueryDto,
  ) {
    return this.messages.deleteMessage(userId, id, messageId, query.scope ?? 'me');
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

  /** Silences push for this conversation. `minutes: 0` (or omitted) unmutes. */
  @HttpCode(200)
  @Post(':id/mute')
  mute(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: MuteDto,
  ) {
    const minutes = dto.minutes ?? 0;
    const until = minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null;
    return this.messages.mute(userId, id, until);
  }

  @Patch(':id')
  rename(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RenameConversationDto,
  ) {
    return this.messages.rename(userId, id, dto.title);
  }

  /**
   * Removes the conversation from the caller's view. Declared last so it
   * cannot shadow the more specific DELETE routes above.
   */
  @HttpCode(200)
  @Delete(':id')
  deleteConversation(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.messages.deleteConversation(userId, id);
  }
}
