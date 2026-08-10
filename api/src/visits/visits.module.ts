import { Module } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

/**
 * Visit counting, as its own module.
 *
 * Deliberately not part of AdminModule even though the console is what reads
 * the numbers. Two very different callers write to it — the public beacon on
 * virgo.ph, and the client gallery route in AlbumsModule — and making either
 * of those import the admin module to reach it would give a public route a
 * dependency on the console's authentication.
 */
@Module({
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
