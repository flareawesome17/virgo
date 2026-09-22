import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { HANDLE_MAX, HANDLE_MIN } from '../../profiles/handles';

/**
 * Addresses a request to a real account.
 *
 * Normally `userId`, picked from the people search. `email` stays supported so
 * someone can be added by exact address when they are not easy to find by name.
 * `handle` is for a public profile, which deliberately carries no user id.
 */
export class SendFriendRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(HANDLE_MIN)
  @MaxLength(HANDLE_MAX)
  handle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email?: string;
}

const STATUSES = ['pending', 'accepted', 'declined'] as const;
const REQUESTED_BY = ['me', 'them'] as const;

export class CreateFriendDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  friend_name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  friend_email?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  friend_avatar_url?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsIn(REQUESTED_BY)
  requested_by!: (typeof REQUESTED_BY)[number];
}

export class UpdateFriendDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  friend_name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  friend_email?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  friend_avatar_url?: string;

  // No `status` here on purpose. Answering a request is POST /friends/:id/accept
  // or /decline, which updates both sides of the friendship and checks that the
  // request was actually addressed to you. Accepting it as a field let the
  // sender approve their own request — see friends.repository.ts.
}

export class ListFriendsDto extends ListQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsIn(REQUESTED_BY)
  requested_by?: (typeof REQUESTED_BY)[number];
}
