import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  MAX_FORWARD_TARGETS,
  MessagesService,
  REACTIONS,
  type Reaction,
} from './messages.service';

// Account ids are uuids, checked here so a malformed one is a 400 rather than
// a 500 from Postgres. Every client only ever sends ids the API gave it.
export class OpenDirectDto {
  @IsUUID('all')
  userId!: string;
}

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  memberIds!: string[];
}

export class AddMemberDto {
  @IsUUID('all')
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

  /**
   * An id the app made for this message before sending it. Sending the same
   * one again returns the message already stored instead of storing a copy,
   * so a retry after a lost response cannot send the words twice.
   */
  @IsOptional()
  @IsUUID('all')
  clientId?: string;
}

/** One of your ways to pay, sent as a card; optionally for one of your packages. */
export class SendPayCardDto {
  @IsUUID('all')
  payMethodId!: string;

  @IsOptional()
  @IsUUID('all')
  packageId?: string;

  /** As on a typed message: a retry with the same id stores nothing new. */
  @IsOptional()
  @IsUUID('all')
  clientId?: string;
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

  /**
   * A message id: only messages older than it. The thread was the newest 100
   * and nothing more, so anything before that could not be reached at all.
   */
  @IsOptional()
  @IsUUID('all')
  before?: string;

  /**
   * A message id: only messages newer than it. How an app that has the
   * thread already catches up after a dropped connection, on a weak signal,
   * without downloading the newest page again. Not with `before`.
   */
  @IsOptional()
  @IsUUID('all')
  after?: string;
}

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  /** Who the new words name. Left out, the message keeps the mentions it had. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  mentionIds?: string[];
}

export class ReactDto {
  /** One of the six, or null to take yours back. */
  @ValidateIf((_o, value) => value !== null)
  @IsIn(REACTIONS as unknown as string[])
  reaction!: Reaction | null;
}

export class ForwardDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_FORWARD_TARGETS)
  @IsUUID('all', { each: true })
  conversationIds!: string[];
}

/** How a chat sits in your own list. Any of the three, at least one. */
export class ListStateDto {
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsBoolean()
  markedUnread?: boolean;
}

export class ConversationsQueryDto {
  /** Matches a group name, a participant's name, or a message body. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  /** 'true' lists the archived chats instead. A query string, so a string. */
  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: 'true' | 'false';

  /** A page of the list. Without these it is the newest 100, as it always was. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  offset?: number;
}

// 'messages', not 'chat': ServicesController already owns POST /chat and
// /chat/stream for the AI proxy, and /chat/stream would be captured by this
// controller's /:id routes.
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  /** The caller's conversations, most recently active first. */
  @Get('conversations')
  async conversations(
    @CurrentUser('id') userId: string,
    @Query() query: ConversationsQueryDto,
  ) {
    const archived = query.archived === 'true';
    const [data, archivedCount] = await Promise.all([
      this.messages.conversations(userId, {
        q: query.q,
        archived,
        limit: query.limit,
        offset: query.offset,
      }),
      // For the "Archived" row at the top of the list: only the list's first
      // page needs it.
      archived || query.q || query.offset ? Promise.resolve(null) : this.messages.archivedCount(userId),
    ]);
    return { data, total: data.length, ...(archivedCount === null ? {} : { archivedCount }) };
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
    if (query.before && query.after) {
      throw new BadRequestException('Ask for older or newer messages, not both');
    }
    return this.messages
      .messages(userId, id, query.limit, query.before, query.after)
      .then(({ messages, lastReadAt, canSend, blockedByMe, blockId }) => ({
        data: messages,
        total: messages.length,
        // Where the caller had read up to before this call, for the
        // "new messages" divider.
        lastReadAt,
        // Whether a block has frozen the thread, and whose it is — so the
        // composer can become a notice instead of failing every send.
        canSend,
        blockedByMe,
        blockId,
      }));
  }

  /**
   * One conversation, as its row in the list. A thread past the first page of
   * the list had no title, members or mute state to show until it was found.
   */
  @Get(':id')
  conversation(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.messages.conversation(userId, id);
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
      clientId: dto.clientId,
    });
  }

  /** Changes the words of your own message, for a short while after sending. */
  @Patch(':id/messages/:messageId')
  edit(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body() dto: EditMessageDto,
  ) {
    return this.messages.edit(userId, id, messageId, dto.body, dto.mentionIds);
  }

  /** Your reaction to a message: set, changed, or `null` to take it back. */
  @HttpCode(200)
  @Post(':id/messages/:messageId/reaction')
  react(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body() dto: ReactDto,
  ) {
    return this.messages.react(userId, id, messageId, dto.reaction ?? null);
  }

  /** Sends a message on to up to five other chats, marked Forwarded. */
  @HttpCode(200)
  @Post(':id/messages/:messageId/forward')
  forward(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body() dto: ForwardDto,
  ) {
    return this.messages.forward(userId, id, messageId, dto.conversationIds);
  }

  /** Pins, archives or marks unread, in your own list only. */
  @HttpCode(200)
  @Post(':id/list-state')
  listState(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ListStateDto,
  ) {
    return this.messages.setListState(userId, id, {
      pinned: dto.pinned,
      archived: dto.archived,
      markedUnread: dto.markedUnread,
    });
  }

  /** Sends one of your ways to pay as a card. */
  @HttpCode(201)
  @Post(':id/pay-card')
  sendPayCard(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SendPayCardDto,
  ) {
    return this.messages.sendPayCard(userId, id, dto);
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
