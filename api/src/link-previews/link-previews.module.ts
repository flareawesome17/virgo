import { Module } from '@nestjs/common';
import { AlbumsModule } from '../albums/albums.module';
import { ShowcasesModule } from '../showcases/showcases.module';
import { LinkPreviewsController } from './link-previews.controller';
import { LinkPreviewsService } from './link-previews.service';

/**
 * Its own module rather than part of Messages: it reads albums and posts,
 * and Hiring already imports Messages, so Messages reaching back into those
 * would be a cycle waiting to happen.
 */
@Module({
  imports: [AlbumsModule, ShowcasesModule],
  controllers: [LinkPreviewsController],
  providers: [LinkPreviewsService],
})
export class LinkPreviewsModule {}
