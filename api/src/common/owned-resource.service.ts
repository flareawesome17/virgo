import { NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { ListOptions, OwnedRepository } from './owned.repository';
import { generateId } from './id';

/**
 * Shared CRUD behaviour for user-owned resources.
 *
 * Note that "not found" and "belongs to someone else" deliberately produce the
 * identical 404. Returning 403 for the second case would confirm that a given
 * id exists, letting a caller enumerate other users' record ids.
 */
export abstract class OwnedResourceService<Row extends QueryResultRow> {
  constructor(
    protected readonly repo: OwnedRepository<Row>,
    /** Human-readable name used in error messages, e.g. "Workspace". */
    protected readonly resourceName: string,
  ) {}

  async list(userId: string, options: ListOptions = {}): Promise<Row[]> {
    return this.repo.findAll(userId, options);
  }

  async count(
    userId: string,
    filters: Record<string, unknown> = {},
  ): Promise<number> {
    return this.repo.count(userId, filters);
  }

  async get(userId: string, id: string): Promise<Row> {
    const row = await this.repo.findOne(userId, id);
    if (!row) throw new NotFoundException(`${this.resourceName} not found`);
    return row;
  }

  async create(userId: string, data: Record<string, unknown>): Promise<Row> {
    // The mobile app generates ids client-side today (the Supabase contract was
    // "include id on insert"), so an explicit id is honoured when supplied and
    // generated otherwise. Keeping this lets the client swap happen without
    // rewriting id handling in all 26 screens.
    const id = (data.id as string | undefined) ?? generateId();
    return this.repo.create(userId, { ...data, id });
  }

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Row> {
    const row = await this.repo.update(userId, id, data);
    if (!row) throw new NotFoundException(`${this.resourceName} not found`);
    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.remove(userId, id);
    if (!deleted) throw new NotFoundException(`${this.resourceName} not found`);
  }
}
