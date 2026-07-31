import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { ServicesService } from './services.service';

/**
 * Upstream proxies ported from the previous Express server (api/index.js):
 * Google OAuth, AI chat, and transactional email.
 *
 * These now sit behind the global JwtAuthGuard — the Express versions were
 * unauthenticated, which meant anyone who found the URL could spend your
 * OpenRouter and Resend credits. The Google OAuth pair stays public because it
 * runs before a user has a token.
 */
@Controller()
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  // Public: these run before the user has a token.
  @Public()
  @Post('auth/google/authorize-url')
  googleAuthorizeUrl(@Body() body: { redirectUri?: string }) {
    return this.services.googleAuthorizeUrl(body?.redirectUri);
  }

  @Public()
  @Post('auth/google/verify')
  googleVerify(@Body() body: { code: string; redirectUri: string }) {
    return this.services.googleVerify(body?.code, body?.redirectUri);
  }

  @Post('chat')
  chat(@Body() body: { messages: unknown[]; model?: string }) {
    return this.services.chat(body.messages, body.model);
  }

  @Post('chat/stream')
  async chatStream(
    @Body() body: { messages: unknown[]; model?: string },
    @Res() res: Response,
  ): Promise<void> {
    await this.services.chatStream(body.messages, res, body.model);
  }

  @Post('send-email')
  sendEmail(@Body() body: { to: string; subject: string; html: string }) {
    return this.services.sendEmail(body.to, body.subject, body.html);
  }
}
