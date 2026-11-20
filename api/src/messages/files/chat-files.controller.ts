import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  CHAT_FILE_TYPES,
  CHAT_PHOTO_TYPES,
  MAX_CHAT_CAPTION,
  MAX_CHAT_FILE_BYTES,
  MAX_CHAT_PHOTOS,
} from '../../storage/chat-files.service';
import { CHAT_VOICE_TYPES, MAX_VOICE_MS_ACCEPTED } from '../../storage/chat-voice';
import { MessagesService } from '../messages.service';

export class NewChatFileDto {
  @IsIn([...CHAT_PHOTO_TYPES, ...CHAT_FILE_TYPES, ...CHAT_VOICE_TYPES])
  contentType!: string;

  /** Signed into the upload, so the bytes that arrive are the ones declared. */
  @IsInt()
  @Min(1)
  @Max(MAX_CHAT_FILE_BYTES)
  contentLength!: number;

  /** Shown on a file, and what it saves as. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /**
   * A voice note's length as the recorder measured it, so the line in the
   * list can say it before the note arrives. Measured again when it does.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_VOICE_MS_ACCEPTED)
  durationMs?: number;
}

export class CreateUploadsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHAT_PHOTOS)
  @ValidateNested({ each: true })
  @Type(() => NewChatFileDto)
  files!: NewChatFileDto[];
}

export class SendFilesDto {
  /** The uploads, in the order they show. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHAT_PHOTOS)
  @IsUUID('all', { each: true })
  attachmentIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHAT_CAPTION)
  caption?: string;

  /** As on a typed message: the same one again returns what was stored. */
  @IsOptional()
  @IsUUID('all')
  clientId?: string;

  @IsOptional()
  @IsUUID('all')
  replyToId?: string;
}

export class AddToAlbumDto {
  // Album ids are text, not uuids: the same check as an upload ticket's.
  @IsString()
  @MaxLength(64)
  albumId!: string;
}

export class UnsendFilesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  messageIds!: string[];
}

export class SentFilesQueryDto {
  /** The last message of the page before, for the next one. */
  @IsOptional()
  @IsUUID('all')
  before?: string;
}

/**
 * Photos, files and voice notes from people's devices (chat Phases 4 and 5).
 *
 * An upload is signed, sent straight to storage, then finished here; the
 * message can go before it finishes. Routes that name no chat (usage, what
 * you sent, unsend) are about the caller's own storage, and work in chats
 * they have left.
 */
@Controller('messages')
export class ChatFilesController {
  constructor(private readonly messages: MessagesService) {}

  /** What your chat photos and files use, and in which chats. */
  @Get('files/usage')
  usage(@CurrentUser('id') userId: string) {
    return this.messages.filesUsage(userId);
  }

  /** Your own photo and file messages in one chat, newest first. */
  @Get('files/sent/:conversationId')
  async sent(
    @CurrentUser('id') userId: string,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query() query: SentFilesQueryDto,
  ) {
    const data = await this.messages.sentFiles(userId, conversationId, query.before);
    return { data, total: data.length };
  }

  /** Unsends your own photo and file messages, from the storage screen. */
  @HttpCode(200)
  @Post('files/unsend')
  unsend(@CurrentUser('id') userId: string, @Body() dto: UnsendFilesDto) {
    return this.messages.unsendFiles(userId, dto.messageIds);
  }

  /**
   * Upload links for one message's photos or file. At most one message's
   * worth a request, so 60 a minute is a crew's busiest shoot day sending
   * a message a second.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':id/uploads')
  createUploads(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateUploadsDto,
  ) {
    return this.messages.createUploads(userId, id, dto.files);
  }

  /** A fresh link for an upload still on its way. */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':id/uploads/:attachmentId/url')
  resign(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.messages.resignUpload(userId, id, attachmentId);
  }

  /** The bytes have arrived: check them and make them ready. */
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':id/uploads/:attachmentId/done')
  finish(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.messages.finishUpload(userId, id, attachmentId);
  }

  /** Sends the uploads as one message, with an optional caption. */
  @HttpCode(201)
  @Post(':id/files')
  send(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SendFilesDto,
  ) {
    return this.messages.sendFiles(userId, id, {
      attachmentIds: dto.attachmentIds,
      caption: dto.caption,
      clientId: dto.clientId,
      replyToId: dto.replyToId,
    });
  }

  /** An hour's link that saves a photo or file under its own name. */
  @Get(':id/messages/:messageId/files/:attachmentId/link')
  link(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.messages.attachmentLink(userId, id, messageId, attachmentId);
  }

  /** Files a copy of a chat photo or file into one of your albums. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':id/messages/:messageId/files/:attachmentId/album')
  toAlbum(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Body() dto: AddToAlbumDto,
  ) {
    return this.messages.addToAlbum(userId, id, messageId, attachmentId, dto.albumId);
  }
}
