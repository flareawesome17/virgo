import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { QuotaService } from './quota.service';

@Controller('me')
export class QuotaController {
  constructor(private readonly quota: QuotaService) {}

  /** Plan, storage consumption and how much of each limit is used. */
  @Get('usage')
  usage(@CurrentUser('id') userId: string) {
    return this.quota.summary(userId);
  }
}
