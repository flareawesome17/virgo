import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { BookingsService } from './bookings.service';

/**
 * Editing the terms.
 *
 * Every field optional, and `undefined` means "leave it alone" — distinct from
 * `null`, which clears one. Without that distinction a client sending a patch
 * for the rate would silently wipe the notes.
 */
class UpdateBookingDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  role?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a date like 2027-02-14' })
  eventDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  location?: string | null;

  /** Centavos, so 15000 pesos is 1_500_000. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  rateMinor?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Bookings — what the two of them actually agreed.
 *
 * Every route is scoped by participation inside the service, never by id
 * alone: a booking id must not be enough to read what two other people agreed
 * and what it pays.
 */
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.bookings.list(userId);
  }

  @Get(':id')
  byId(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.bookings.byId(userId, id);
  }

  /** Either side, while it is not cancelled. Clears both confirmations. */
  @HttpCode(200)
  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBookingDto,
  ) {
    return this.bookings.update(userId, id, dto);
  }

  @HttpCode(200)
  @Post(':id/confirm')
  confirm(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.bookings.confirm(userId, id);
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookings.cancel(userId, id, dto.reason);
  }
}
