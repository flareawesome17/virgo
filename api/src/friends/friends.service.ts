import { Injectable } from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { FriendRow, FriendsRepository } from './friends.repository';

@Injectable()
export class FriendsService extends OwnedResourceService<FriendRow> {
  constructor(private readonly friends: FriendsRepository) {
    super(friends, 'Friend');
  }
}
