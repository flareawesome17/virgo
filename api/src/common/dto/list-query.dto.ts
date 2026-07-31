import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Pagination and sorting shared by every list endpoint.
 *
 * `orderBy` is validated as a plain string here and checked against each
 * repository's `sortableColumns` allow-list before it reaches SQL — the
 * repository, not this DTO, is what prevents identifier injection.
 */
export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  orderBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direction?: 'asc' | 'desc';
}
