import { Injectable } from '@nestjs/common';
import { OwnedRepository } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';

export type CollaboratorRole =
  | 'owner'
  | 'photographer'
  | 'editor'
  | 'reviewer'
  | 'client';

export interface CollaboratorRow {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  avatar_url: string | null;
  /** The friend this row represents. Null only on rows predating migration 014. */
  collaborator_user_id: string | null;
  role: CollaboratorRole;
  /** pending until the invitee answers. */
  status: 'pending' | 'accepted' | 'declined';
  responded_at: Date | null;
  created_at: Date;
}

@Injectable()
export class CollaboratorsRepository extends OwnedRepository<CollaboratorRow> {
  protected readonly table = 'collaborators';

  protected readonly writableColumns = [
    'id',
    'workspace_id',
    'collaborator_user_id',
    'name',
    'avatar_url',
    'role',
    'status',
  ];

  protected readonly filterableColumns = ['status', 'workspace_id', 'role'];
  protected readonly sortableColumns = ['created_at', 'name'];

  constructor(db: DatabaseService) {
    super(db);
  }
}
