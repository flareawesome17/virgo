import { Injectable } from '@nestjs/common';
import { OwnedRepository } from '../common/owned.repository';
import { DatabaseService } from '../database/database.service';

export type FriendStatus = 'pending' | 'accepted' | 'declined';
export type RequestedBy = 'me' | 'them';

export interface FriendRow {
  id: string;
  user_id: string;
  /** The account this friendship points at. Null on rows predating 014. */
  friend_user_id: string | null;
  friend_name: string;
  friend_email: string | null;
  friend_avatar_url: string | null;
  status: FriendStatus;
  requested_by: RequestedBy;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class FriendsRepository extends OwnedRepository<FriendRow> {
  protected readonly table = 'friends';

  protected readonly writableColumns = [
    'id',
    'friend_name',
    'friend_email',
    'friend_avatar_url',
    'status',
    'requested_by',
  ];

  protected readonly filterableColumns = ['status', 'requested_by'];
  protected readonly sortableColumns = [
    'created_at',
    'updated_at',
    'friend_name',
  ];

  constructor(db: DatabaseService) {
    super(db);
  }
}
