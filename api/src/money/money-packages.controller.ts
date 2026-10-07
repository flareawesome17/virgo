import {
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
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { StorageService } from '../storage/storage.service';
import {
  CreatePackageDto,
  CreatePayMethodDto,
  ListPackagesDto,
  UpdatePackageDto,
  UpdatePayMethodDto,
} from './dto/package.dto';
import { MoneyPackagesService } from './money-packages.service';
import { MoneyPayMethodsService } from './money-pay-methods.service';
import { renderStatement, renderStatementUnavailable } from './statement.template';

/**
 * Who owes you: packages, the payments toward them, the statement link, and
 * the ways clients can pay. All of it the signed-in account's own.
 */
@Controller('money')
export class MoneyPackagesController {
  constructor(
    private readonly packages: MoneyPackagesService,
    private readonly payMethods: MoneyPayMethodsService,
  ) {}

  @Get('packages')
  list(@CurrentUser('id') userId: string, @Query() query: ListPackagesDto) {
    return this.packages.list(userId, query.status ?? 'all');
  }

  @Get('packages/:id')
  get(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.packages.get(userId, id);
  }

  @Post('packages')
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePackageDto) {
    return this.packages.create(userId, dto);
  }

  @Patch('packages/:id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackageDto,
  ) {
    return this.packages.update(userId, id, dto);
  }

  /** The package and its payments still due; payments made stay in the ledger. */
  @HttpCode(204)
  @Delete('packages/:id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.packages.remove(userId, id);
  }

  /** Turns the statement link on, and returns it. */
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @HttpCode(200)
  @Post('packages/:id/share')
  share(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.packages.share(userId, id);
  }

  /** Turns it off for good; sharing again makes a new link. */
  @HttpCode(204)
  @Delete('packages/:id/share')
  async unshare(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.packages.unshare(userId, id);
  }

  @Get('pay-methods')
  payMethodList(@CurrentUser('id') userId: string) {
    return this.payMethods.list(userId);
  }

  @Post('pay-methods')
  payMethodCreate(@CurrentUser('id') userId: string, @Body() dto: CreatePayMethodDto) {
    return this.payMethods.create(userId, dto);
  }

  @Patch('pay-methods/:id')
  payMethodUpdate(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayMethodDto,
  ) {
    return this.payMethods.update(userId, id, dto);
  }

  @HttpCode(204)
  @Delete('pay-methods/:id')
  async payMethodRemove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.payMethods.remove(userId, id);
  }
}

/**
 * Public: the statement a client opens.
 *
 * Under /s, beside the client gallery, on the client delivery host. The token
 * is the credential, so it is rate-limited per IP, never cached, never
 * indexed, and the page runs no script at all.
 */
@Controller('s/statement')
export class PublicStatementController {
  constructor(
    private readonly packages: MoneyPackagesService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token')
  async page(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const media = this.storage.mediaOrigins().filter(Boolean);
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        `img-src ${["'self'", 'data:', ...media].join(' ')}`,
        "style-src 'unsafe-inline'",
        "script-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    // The QR codes come from the bucket, another origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');

    const view = await this.packages.statement(token);
    if (!view) {
      res.status(404).send(renderStatementUnavailable());
      return;
    }
    res.status(200).send(renderStatement(view));
  }
}
