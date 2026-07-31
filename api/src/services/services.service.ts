import { Readable } from 'node:stream';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

/**
 * Thin client for the RapidNative global services gateway, carried over from
 * the Express implementation.
 */
@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private readonly config: ConfigService) {}

  private async call(path: string, body: unknown): Promise<globalThis.Response> {
    const baseUrl = this.config.get<string>('RAPIDNATIVE_GLOBAL_SERVICES_URL');
    const key = this.config.get<string>('RAPIDNATIVE_GLOBAL_SERVICES_KEY');

    if (!baseUrl || !key) {
      throw new ServiceUnavailableException(
        'Upstream services are not configured',
      );
    }

    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async googleAuthorizeUrl(redirectUri?: string): Promise<unknown> {
    const projectId = this.config.get<string>('RAPIDNATIVE_PROJECT_ID');
    const response = await this.call('/google/authorize-url', {
      redirect_uri:
        redirectUri ?? `${projectId}.rnproject.com/auth/callback`,
    });
    if (!response.ok) {
      this.logger.error(`Google authorize-url returned ${response.status}`);
      throw new ServiceUnavailableException(
        'Could not generate Google auth URL',
      );
    }
    return response.json();
  }

  async googleVerify(code: string, redirectUri: string): Promise<unknown> {
    const response = await this.call('/google/verify', {
      code,
      redirect_uri: redirectUri,
    });
    if (!response.ok) {
      this.logger.error(`Google verify returned ${response.status}`);
      throw new ServiceUnavailableException('Google verification failed');
    }
    return response.json();
  }

  async chat(messages: unknown[], model?: string): Promise<unknown> {
    const response = await this.call('/openrouter/v1/chat/completions', {
      model: model ?? 'openai/gpt-4o-mini',
      messages,
    });
    if (!response.ok) {
      this.logger.error(`Chat upstream returned ${response.status}`);
      throw new ServiceUnavailableException('Chat request failed');
    }
    return response.json();
  }

  async chatStream(
    messages: unknown[],
    res: Response,
    model?: string,
  ): Promise<void> {
    const response = await this.call('/openrouter/v1/chat/completions', {
      model: model ?? 'openai/gpt-4o-mini',
      messages,
      stream: true,
    });

    if (!response.ok || !response.body) {
      this.logger.error(`Chat stream upstream returned ${response.status}`);
      throw new ServiceUnavailableException('Chat stream failed');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    Readable.fromWeb(response.body as never).pipe(res);
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<unknown> {
    const response = await this.call('/resend/emails', {
      from: 'noreply@virgo.studio',
      to,
      subject,
      html,
    });
    if (!response.ok) {
      this.logger.error(`Email upstream returned ${response.status}`);
      throw new ServiceUnavailableException('Email request failed');
    }
    return response.json();
  }
}
