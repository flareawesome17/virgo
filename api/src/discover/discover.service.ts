import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeRoles, USER_ROLES } from '../auth/roles';
import { DatabaseService } from '../database/database.service';

export interface NearbyPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Kilometres, one decimal. Deliberately not coordinates. */
  distanceKm: number;
  relationship: 'none' | 'pending_out' | 'pending_in' | 'accepted';
  /** What they do on a shoot. The point of the whole screen. */
  roles: string[];
}

/** Beyond this the result set stops being "nearby" and starts being a directory. */
const MAX_RADIUS_KM = 200;
const DEFAULT_RADIUS_KM = 50;

/**
 * Finding people to work with nearby.
 *
 * Location is opt-in and reciprocal: only users who have turned sharing on are
 * discoverable, and only a user who has shared their own location can search —
 * otherwise the feature would be a one-way lookup of other people's positions.
 *
 * The API never returns anyone else's coordinates. Distance is computed in SQL
 * and rounded, so a caller cannot triangulate a position by querying from
 * several points.
 */
@Injectable()
export class DiscoverService {
  constructor(private readonly db: DatabaseService) {}

  /** Stores the caller's position and turns sharing on. */
  async updateLocation(
    userId: string,
    latitude: number,
    longitude: number,
  ): Promise<{ sharing: boolean }> {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new BadRequestException('Invalid coordinates');
    }

    await this.db.query(
      `update users
          set latitude = $2, longitude = $3,
              location_updated_at = now(), shares_location = true
        where id = $1`,
      [userId, latitude, longitude],
    );
    return { sharing: true };
  }

  /**
   * Turns sharing off and forgets the position.
   *
   * The coordinates are cleared rather than just flagged, so revoking actually
   * removes the data instead of leaving it dormant in the row.
   */
  async stopSharing(userId: string): Promise<{ sharing: boolean }> {
    await this.db.query(
      `update users
          set shares_location = false, latitude = null,
              longitude = null, location_updated_at = null
        where id = $1`,
      [userId],
    );
    return { sharing: false };
  }

  async sharingStatus(
    userId: string,
  ): Promise<{ sharing: boolean; updatedAt: Date | null }> {
    const row = await this.db.queryOne<{
      shares_location: boolean;
      location_updated_at: Date | null;
    }>(
      'select shares_location, location_updated_at from users where id = $1',
      [userId],
    );
    return {
      sharing: row?.shares_location ?? false,
      updatedAt: row?.location_updated_at ?? null,
    };
  }

  /**
   * People sharing their location within `radiusKm`, optionally only those who
   * do a particular job.
   *
   * The role filter is what makes this a hiring tool rather than a list of
   * whoever happens to be around: "an SDE photo editor within 30km" is the
   * question people actually have. It matches on overlap, so someone who is
   * both a photographer and an editor is found by either search.
   *
   * Returns an empty list — not an error — when the caller is not sharing, so
   * the screen can explain the trade rather than showing a failure.
   */
  async nearby(
    userId: string,
    radiusKm = DEFAULT_RADIUS_KM,
    roles: readonly string[] = [],
  ): Promise<{ sharing: boolean; people: NearbyPerson[] }> {
    const radius = Math.min(Math.max(radiusKm, 1), MAX_RADIUS_KM);
    // Unrecognised values are dropped rather than rejected: the DTO already
    // refuses them, and a filter that silently matches nothing is worse than
    // one that ignores a stray value.
    const wanted = normalizeRoles(roles);

    const me = await this.db.queryOne<{
      latitude: number | null;
      longitude: number | null;
      shares_location: boolean;
    }>(
      'select latitude, longitude, shares_location from users where id = $1',
      [userId],
    );

    if (!me?.shares_location || me.latitude == null || me.longitude == null) {
      return { sharing: false, people: [] };
    }

    const rows = await this.db.query<{
      id: string;
      email: string;
      display_name: string | null;
      avatar_url: string | null;
      roles: string[] | null;
      handle: string | null;
      distance_km: string | number;
      status: string | null;
      requested_by: string | null;
    }>(
      // Haversine, computed in a subquery so the radius can be filtered on the
      // alias. Filtering it inline would mean repeating the expression, and
      // HAVING without GROUP BY collapses the whole result into one aggregate
      // group rather than filtering rows.
      //
      // Cheap enough at this scale, and avoids a PostGIS dependency for what is
      // a single radius query.
      `select * from (
         select u.id, u.email, u.display_name, u.avatar_url, u.roles,
                -- Only when the profile is actually published: an unpublished
                -- handle is not a link, and offering one would 404.
                case when u.public_profile then u.handle end as handle,
                f.status, f.requested_by,
                round((
                  6371 * acos(
                    least(1, greatest(-1,
                      cos(radians($2)) * cos(radians(u.latitude))
                        * cos(radians(u.longitude) - radians($3))
                      + sin(radians($2)) * sin(radians(u.latitude))
                    ))
                  )
                )::numeric, 1) as distance_km
           from users u
           left join friends f
             on f.user_id = $1 and f.friend_user_id = u.id
          where u.id <> $1
            and u.shares_location = true
            and u.latitude is not null
            and u.longitude is not null
            -- Stale positions are worse than none: someone who shared their
            -- location months ago is not "nearby" in any useful sense.
            and u.location_updated_at > now() - interval '30 days'
            -- A paused account is not available to hire.
            and (u.disabled_until is null or u.disabled_until <= now())
            -- Overlap, not containment: somebody who is both a photographer
            -- and an editor should turn up under either search. Empty array
            -- means no filter, and && uses the GIN index on users.roles.
            and ($5::text[] = '{}' or u.roles && $5::text[])
       ) candidates
        where distance_km <= $4
        order by distance_km
        limit 50`,
      [userId, me.latitude, me.longitude, radius, wanted],
    );

    return {
      sharing: true,
      people: rows.map((r) => ({
        id: r.id,
        name: r.display_name?.trim() || r.email.split('@')[0],
        avatarUrl: r.avatar_url,
        distanceKm: Number(r.distance_km),
        roles: r.roles ?? [],
        handle: r.handle,
        relationship:
          r.status === 'accepted'
            ? 'accepted'
            : r.status === 'pending'
              ? r.requested_by === 'me'
                ? 'pending_out'
                : 'pending_in'
              : 'none',
      })),
    };
  }

  /**
   * How many people nearby do each role.
   *
   * Drives the filter chips: an empty "SDE Editor Video" filter is worth
   * knowing about *before* tapping it, and a chip that reads "0" explains an
   * empty result better than an empty list does.
   *
   * Deliberately ignores any active filter — these are the counts you choose
   * from, so narrowing them by the current choice would make every other chip
   * read zero the moment one was picked.
   */
  async roleCounts(
    userId: string,
    radiusKm = DEFAULT_RADIUS_KM,
  ): Promise<Record<string, number>> {
    const { people } = await this.nearby(userId, radiusKm);

    const counts: Record<string, number> = {};
    for (const role of USER_ROLES) counts[role] = 0;
    for (const person of people) {
      for (const role of person.roles) {
        if (role in counts) counts[role] += 1;
      }
    }
    return counts;
  }
}
