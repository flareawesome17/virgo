import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
}

/** Postgres SQLSTATE codes worth translating into meaningful HTTP responses. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_NOT_NULL_VIOLATION = '23502';

/**
 * Converts driver-level errors into clean HTTP responses.
 *
 * Raw Postgres errors must never reach a client: `detail` embeds the offending
 * row values, and constraint names disclose schema internals. They are logged
 * server-side in full and replaced with a generic message on the wire.
 */
@Catch()
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // Nest's own exceptions already carry a safe, intentional payload.
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const err = exception as PgError;

    switch (err?.code) {
      case PG_UNIQUE_VIOLATION:
        this.logger.warn(`Unique violation: ${err.constraint ?? 'unknown'}`);
        response
          .status(HttpStatus.CONFLICT)
          .json({ statusCode: 409, message: 'That record already exists' });
        return;

      case PG_FOREIGN_KEY_VIOLATION:
        this.logger.warn(`FK violation: ${err.constraint ?? 'unknown'}`);
        response.status(HttpStatus.BAD_REQUEST).json({
          statusCode: 400,
          message: 'Referenced record does not exist',
        });
        return;

      case PG_CHECK_VIOLATION:
      case PG_NOT_NULL_VIOLATION:
        this.logger.warn(`Constraint violation: ${err.constraint ?? 'unknown'}`);
        response
          .status(HttpStatus.BAD_REQUEST)
          .json({ statusCode: 400, message: 'Invalid field value' });
        return;

      default:
        this.logger.error(
          `Unhandled: ${err?.message ?? String(exception)}`,
          exception instanceof Error ? exception.stack : undefined,
        );
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: 500,
          message: 'Internal server error',
        });
    }
  }
}
