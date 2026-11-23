import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { ChatCrewService } from './chat-crew.service';

export class StartCrewDto {
  @IsUUID('all')
  postId!: string;
}

/** Crew chats. Team chats need no route: they follow the workspace. */
@Controller('messages')
export class ChatCrewController {
  constructor(private readonly crews: ChatCrewService) {}

  /** Starts the crew chat for one of your job posts, or opens the one it has. */
  @HttpCode(200)
  @Post('crews')
  start(@CurrentUser('id') userId: string, @Body() dto: StartCrewDto) {
    return this.crews.startCrew(userId, dto.postId);
  }
}
