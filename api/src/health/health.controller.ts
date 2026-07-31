import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DatabaseService } from '../database/database.service';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Actually queries Postgres rather than just returning 200. A health check
   * that cannot fail tells a load balancer nothing.
   */
  @Public()
  @Get('health')
  async health() {
    const database = await this.db.ping();
    if (!database) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        database: 'unreachable',
      });
    }
    return { status: 'ok', database: 'ok' };
  }
}
