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

  /**
   * `status` and `requested_by` are deliberately absent.
   *
   * They are state transitions in a two-row relationship, owned by
   * FriendsService.respond(), which updates *both* sides in one transaction and
   * refuses to let you answer a request you sent yourself.
   *
   * While they were writable, the generic `PATCH /friends/:id` reached them
   * through OwnedRepository.update — scoped to the caller's own row, which for
   * the sender of a request is exactly the row areFriends() reads. So the
   * sender could set their own copy to 'accepted' and then message, group,
   * collaborate with, and invite a person who had never agreed to any of it.
   *
   * Only `create` may set them, and it is the service that supplies the values.
   */
  protected readonly writableColumns = [
    'id',
    'friend_name',
    'friend_email',
    'friend_avatar_url',
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
