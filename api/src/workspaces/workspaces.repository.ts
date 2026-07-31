import { Injectable } from '@nestjs/common';
import { OwnedRepository } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';

export interface WorkspaceRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  accent_color: string;
  media_count: number;
  collaborator_count: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class WorkspacesRepository extends OwnedRepository<WorkspaceRow> {
  protected readonly table = 'workspaces';

  // user_id is intentionally absent: it comes from the JWT, never the body.
  protected readonly writableColumns = [
    'id',
    'name',
    'description',
    'accent_color',
    'media_count',
    'collaborator_count',
  ];

  protected readonly sortableColumns = ['created_at', 'updated_at', 'name'];

  constructor(db: DatabaseService) {
    super(db);
  }
}
