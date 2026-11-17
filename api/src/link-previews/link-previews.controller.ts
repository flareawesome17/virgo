import { Controller, Get, Header, Query } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { LinkPreviewsService } from './link-previews.service';

export class LinkPreviewQueryDto {
  @IsString()
  @MinLength(4)
  @MaxLength(2048)
  url!: string;
}

/**
 * Previews for Virgo links in a chat. Signed in, because the profile and
 * job lookups respect blocks, which need to know who is asking.
 */
@Controller('link-previews')
export class LinkPreviewsController {
  constructor(private readonly previews: LinkPreviewsService) {}

  @Get()
  // A few minutes in the asker's own cache: a thread with the same link in
  // it ten times asks once.
  @Header('Cache-Control', 'private, max-age=300')
  preview(@CurrentUser('id') userId: string, @Query() query: LinkPreviewQueryDto) {
    return this.previews.preview(userId, query.url);
  }
}
