import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class InviteToEventDto {
  /**
   * Capped so a single request cannot fan out into an unbounded number of
   * notifications. Nobody invites 50 people to one shoot; a request that does
   * is a mistake or an abuse.
   */
  @IsArray()
  @ArrayNotEmpty({ message: 'Choose at least one person to invite' })
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  user_ids!: string[];
}
