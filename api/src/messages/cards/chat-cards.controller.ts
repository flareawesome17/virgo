import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { CARD_KINDS, MAX_CARD_FILES, PLAN_TYPES, type CardKind, type PlanType } from './card-kinds';
import { ChatCardsService, type SendCardInput } from './chat-cards.service';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One card, by kind. Each kind's own fields are required for it and ignored
 * otherwise; the service reads only the ones its kind names.
 */
export class SendCardDto {
  @IsIn(CARD_KINDS)
  kind!: CardKind;

  /** The sending app's id for it, as on a typed message: a retry stores nothing new. */
  @IsOptional()
  @IsUUID()
  clientId?: string;

  /** Album ids are text, not uuids: they were made by the apps before the server. */
  @ValidateIf((o: SendCardDto) => o.kind === 'album-photos')
  @IsString()
  @MaxLength(64)
  albumId?: string;

  @ValidateIf((o: SendCardDto) => o.kind === 'album-photos')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CARD_FILES)
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  keys?: string[];

  @ValidateIf((o: SendCardDto) => o.kind === 'booking')
  @IsUUID()
  bookingId?: string;

  @ValidateIf((o: SendCardDto) => o.kind === 'job-post')
  @IsUUID()
  postId?: string;

  @ValidateIf((o: SendCardDto) => o.kind === 'post')
  @IsUUID()
  showcaseId?: string;

  @ValidateIf((o: SendCardDto) => o.kind === 'package')
  @IsUUID()
  packageId?: string;

  @ValidateIf((o: SendCardDto) => o.kind === 'date-plan')
  @IsIn(PLAN_TYPES)
  type?: PlanType;

  /** Empty is fine: the date is then called by its type, "Shoot". */
  @ValidateIf((o: SendCardDto) => o.kind === 'date-plan')
  @IsString()
  @MaxLength(200)
  title?: string;

  @ValidateIf((o: SendCardDto) => o.kind === 'date-plan')
  @IsDateString({ strict: true })
  date?: string;

  @IsOptional()
  @Matches(TIME, { message: 'time must be HH:MM' })
  time?: string;

  /** The calendar's limit for a place. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  place?: string;

  @ValidateIf((o: SendCardDto) => o.kind === 'date-plan')
  @IsBoolean()
  inviteEveryone?: boolean;
}

export class AnswerDateDto {
  @IsBoolean()
  going!: boolean;
}

/** Under /messages like the rest of chat; /chat is the AI proxy. */
@Controller('messages')
export class ChatCardsController {
  constructor(private readonly cards: ChatCardsService) {}

  /** Shares a Virgo thing in the chat as a card. */
  @HttpCode(201)
  @Post(':id/cards')
  send(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SendCardDto,
  ) {
    return this.cards.send(userId, id, dto as SendCardInput);
  }

  /** Going, or can't go, to a date somebody planned in the chat. */
  @HttpCode(200)
  @Post(':id/messages/:messageId/answer')
  answer(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('messageId', new ParseUUIDPipe()) messageId: string,
    @Body() dto: AnswerDateDto,
  ) {
    return this.cards.answer(userId, id, messageId, dto.going);
  }
}
