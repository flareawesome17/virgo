import {
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { normalizeRoles, USER_ROLES } from '../auth/roles';
import { DatabaseService } from '../database/database.service';
import { relationshipCase } from '../friends/friend-sql';
import { canonicalLocation, coordsFor } from '../hiring/locations';
import { blockedBetween } from '../safety/block-sql';
import { addressPlace } from './places';
import { positionOf } from './position-sql';

export interface NearbyPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Only when their profile is published, so the link cannot 404. */
  handle: string | null;
  /** Whole kilometres, 0 meaning under one. Deliberately not coordinates. */
  distanceKm: number;
  /**
   * True unless the distance is to a device position. A city centre is the
   * same point for everyone in that city, so the apps say "In Cebu City"
   * rather than a precise-looking number of kilometres.
   */
  approximate: boolean;
  /** The city or province an approximate position is; null for a device one. */
  place: string | null;
  relationship: 'none' | 'pending_out' | 'pending_in' | 'accepted';
  /** What they do on a shoot. The point of the whole screen. */
  roles: string[];
}

/** What places somebody in Nearby. */
export type PositionSource = 'gps' | 'place' | 'address';

/** Where a search was measured from. `search` is a city typed into "Near". */
export interface NearbyOrigin {
  source: PositionSource | 'search';
  /** Null for a device position, which has no name. */
  place: string | null;
}

export interface NearbyStatus {
  /**
   * Whether you appear in Nearby.
   *
   * The name is the installed apps'. They show the list, and say
   * "Discoverable", only while this is true, so it has to cover an address as
   * well as a shared position — otherwise somebody in everyone's results
   * would be told they are not discoverable.
   */
  sharing: boolean;
  /** When the shared position was set, device or picked city. */
  updatedAt: Date | null;
  /**
   * The name of the place you are shown at — a picked city or your address's
   * — and null for a device position. Installed apps print it after
   * "Discoverable ·".
   */
  place: string | null;
  /** What places you, hidden or not. Null when nothing does. */
  source: PositionSource | null;
  /** Left out of everyone's Nearby by choice. */
  hidden: boolean;
  /** Where the address on the profile resolved to, if it did. */
  addressPlace: string | null;
  /**
   * What you have shared, whether or not it still counts. A device position
   * over 30 days old is still 'gps' here while `source` has moved on to the
   * address, which is how the apps know to offer an update.
   */
  shared: 'gps' | 'place' | null;
}

/** Beyond this the result set stops being "nearby" and starts being a directory. */
const MAX_RADIUS_KM = 200;
const DEFAULT_RADIUS_KM = 50;

/** Rows per pass of the address backfill. */
const BACKFILL_BATCH = 500;

/**
 * How finely a device position is kept: two decimal places, about 1.1 km.
 *
 * The exact fix used to be stored, and the distance to it shown to a tenth of
 * a kilometre. Anyone sharing could move their own point — the endpoint takes
 * whatever coordinates it is sent — read the distance to someone from three
 * places, and put them within about 100 m: their home, most likely. Kept to a
 * cell of about a kilometre and shown in whole kilometres, the most that can
 * be worked out is the cell, which is what "nearby" promised to begin with.
 * Migration 077 rounds the positions stored before this.
 */
const POSITION_DECIMALS = 2;

function snapToGrid(degrees: number): number {
  const scale = 10 ** POSITION_DECIMALS;
  return Math.round(degrees * scale) / scale;
}

/**
 * Everyone who could be nearby, with how far they are from ($2, $3).
 *
 * $1 is the caller and $5 the roles wanted (empty for any). The radius, $4,
 * is applied by whatever wraps this, on the distance alias: nearby() for
 * the list, roleCounts() for the chips.
 */
const NEARBY_CANDIDATES = `
         select u.id, u.email, u.display_name, u.avatar_url, u.roles,
                u.last_seen_at,
                -- Only when the profile is actually published: an unpublished
                -- handle is not a link, and offering one would 404.
                case when u.public_profile then u.handle end as handle,
                -- From both rows, the rule search uses. The caller's row alone
                -- showed an orphaned request as incoming, and a half-pair as
                -- a friend.
                ${relationshipCase('f', 'theirs')} as relationship,
                pos.approximate,
                pos.place,
                -- Whole kilometres. See POSITION_DECIMALS.
                round((
                  6371 * acos(
                    least(1, greatest(-1,
                      cos(radians($2)) * cos(radians(pos.lat))
                        * cos(radians(pos.lon) - radians($3))
                      + sin(radians($2)) * sin(radians(pos.lat))
                    ))
                  )
                )::numeric) as distance_km
           from users u
           -- Their shared position while it counts, otherwise their
           -- address's city. See position-sql.ts for what "counts" means.
           cross join lateral (${positionOf('u')}) pos
           left join friends f
             on f.user_id = $1 and f.friend_user_id = u.id
           left join friends theirs
             on theirs.user_id = u.id and theirs.friend_user_id = $1
          where u.id <> $1
            -- Hidden is hidden, whatever placed them: an address, a picked
            -- city or the device.
            and not u.nearby_hidden
            and pos.lat is not null
            and pos.lon is not null
            -- A paused account is not available to hire, and a suspended one
            -- is not available at all.
            and (u.disabled_until is null or u.disabled_until <= now())
            and u.suspended_at is null
            -- Nobody across a block, either way round.
            and not ${blockedBetween('$1', 'u.id')}
            -- Overlap, not containment: somebody who is both a photographer
            -- and an editor should turn up under either search. Empty array
            -- means no filter, and && uses the GIN index on users.roles.
            and ($5::text[] = '{}' or u.roles && $5::text[])
`;

/** The caller's own row, read the way the candidates above are. */
interface OwnPosition {
  lat: number | null;
  lon: number | null;
  place: string | null;
  source: PositionSource | null;
  hidden: boolean;
  shared: 'gps' | 'place' | null;
  updatedAt: Date | null;
  addressPlace: string | null;
}

/**
 * Finding people to work with nearby.
 *
 * Everyone with an address is in it, at their city's centre — never their
 * street — unless they hide. Sharing the device's position is optional and
 * only makes the match closer. Anyone can look: from the position they
 * share, from their own city, or from any city they type.
 *
 * It used to be opt-in and reciprocal, and that left the screen empty for
 * almost everyone: hardly anybody turns on a location switch, so a hiring
 * tool showed nobody to hire. The address already said which city each
 * account is in; using that, and only that, is what made it useful without
 * making it more revealing than a profile.
 *
 * The API never returns anyone else's coordinates. Distance is computed in SQL
 * and rounded, so a caller cannot triangulate a position by querying from
 * several points.
 */
@Injectable()
export class DiscoverService implements OnModuleInit {
  private readonly logger = new Logger(DiscoverService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Places the addresses nobody has placed yet, without holding up boot.
   *
   * The accounts from before migration 089 all need it once. After that it
   * only finds rows an older API wrote during a deploy, which the nightly run
   * below catches as well.
   */
  onModuleInit(): void {
    void this.placeAddresses().catch((err: unknown) =>
      this.logger.warn(`Could not place existing addresses: ${String(err)}`),
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async placeAddressesNightly(): Promise<void> {
    try {
      await this.placeAddresses();
    } catch (err) {
      this.logger.warn(`Could not place addresses: ${String(err)}`);
    }
  }

  /**
   * Works out address_place and its coordinates for every row that has a
   * city and has never been looked at, a batch at a time. Returns how many
   * rows it looked at.
   *
   * address_geocoded_at is set whether or not the city could be placed, so a
   * town the tables do not know is tried once, not on every boot. It is also
   * the guard on the write: a profile saved between the read and the write
   * has already placed its own address and is left alone.
   */
  async placeAddresses(batchSize = BACKFILL_BATCH): Promise<number> {
    let seen = 0;
    for (;;) {
      const rows = await this.db.query<{
        id: string;
        address_city: string;
        address_province: string | null;
      }>(
        `select id, address_city, address_province
           from users
          where address_city is not null and address_geocoded_at is null
          order by id
          limit $1`,
        [batchSize],
      );
      if (rows.length === 0) break;

      const placed = rows.map((r) => addressPlace(r.address_city, r.address_province));
      const written = await this.db.query<{ id: string }>(
        `update users u
            set address_latitude = v.lat,
                address_longitude = v.lon,
                address_place = v.place,
                address_geocoded_at = now()
           from unnest($1::uuid[], $2::float8[], $3::float8[], $4::text[])
                  as v(id, lat, lon, place)
          where u.id = v.id and u.address_geocoded_at is null
          returning u.id`,
        [
          rows.map((r) => r.id),
          placed.map((p) => p?.latitude ?? null),
          placed.map((p) => p?.longitude ?? null),
          placed.map((p) => p?.place ?? null),
        ],
      );
      seen += rows.length;
      this.logger.log(
        `Placed ${placed.filter(Boolean).length} of ${rows.length} addresses for Nearby`,
      );
      // A batch that wrote nothing would be read again forever. It cannot
      // happen as written; this is what makes sure of it.
      if (written.length === 0 || rows.length < batchSize) break;
    }
    return seen;
  }

  /**
   * A place name turned into the coordinates Nearby measures from.
   *
   * Reuses the table the job board already ranks by distance with, so a city
   * means the same point in both features. Unknown names are refused rather
   * than stored uselessly: a position that resolves to nothing would leave the
   * account sharing but invisible, which looks exactly like a bug.
   */
  private resolvePlace(place: string): {
    name: string;
    lat: number;
    lon: number;
  } {
    const name = canonicalLocation(place);
    const coords = coordsFor(name);
    if (!coords) {
      throw new BadRequestException(
        `We do not know where “${place.trim()}” is. Pick a city from the list.`,
      );
    }
    return { name, lat: coords.lat, lon: coords.lon };
  }

  /** Where the caller is, by the same rule everyone else is placed by. */
  private async ownPosition(userId: string): Promise<OwnPosition> {
    const row = await this.db.queryOne<{
      lat: number | null;
      lon: number | null;
      place: string | null;
      source: PositionSource | null;
      nearby_hidden: boolean | null;
      shares_location: boolean | null;
      latitude: number | null;
      location_place: string | null;
      location_updated_at: Date | null;
      address_place: string | null;
    }>(
      `select pos.lat, pos.lon, pos.place, pos.source,
              u.nearby_hidden, u.shares_location, u.latitude, u.location_place,
              u.location_updated_at, u.address_place
         from users u
         cross join lateral (${positionOf('u')}) pos
        where u.id = $1`,
      [userId],
    );
    const placed = row?.lat != null && row?.lon != null;
    return {
      lat: placed ? row.lat : null,
      lon: placed ? row.lon : null,
      place: placed ? row.place : null,
      source: placed ? (row.source ?? null) : null,
      hidden: row?.nearby_hidden ?? false,
      shared:
        row?.shares_location && row.latitude != null
          ? row.location_place
            ? 'place'
            : 'gps'
          : null,
      updatedAt: row?.location_updated_at ?? null,
      addressPlace: row?.address_place ?? null,
    };
  }

  /**
   * Stores the caller's position from the device.
   *
   * It places them more closely than their city does. It does not change
   * whether they are shown: hiding is its own switch.
   */
  async updateLocation(
    userId: string,
    latitude: number,
    longitude: number,
  ): Promise<NearbyStatus> {
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
          set latitude = $2, longitude = $3, location_place = null,
              location_updated_at = now(), shares_location = true
        where id = $1`,
      [userId, snapToGrid(latitude), snapToGrid(longitude)],
    );
    return this.sharingStatus(userId);
  }

  /**
   * The same thing, from a city instead of the device.
   *
   * What the installed apps offer to anyone who will not grant a location
   * permission. The current apps no longer ask — the address's city does the
   * same job without a question — but a city picked this way still places
   * somebody until they share their device or go back to their address.
   *
   * Precision is the city, which is honest — everyone in it reads as "In
   * Cebu City" rather than a number of kilometres.
   */
  async setLocationPlace(userId: string, place: string): Promise<NearbyStatus> {
    const resolved = this.resolvePlace(place);

    await this.db.query(
      `update users
          set latitude = $2, longitude = $3, location_place = $4,
              location_updated_at = now(), shares_location = true
        where id = $1`,
      [userId, resolved.lat, resolved.lon, resolved.name],
    );
    return this.sharingStatus(userId);
  }

  /**
   * Stops sharing and forgets the shared position.
   *
   * The coordinates are cleared rather than just flagged, so revoking actually
   * removes the data instead of leaving it dormant in the row.
   *
   * This does not hide anybody. Without a shared position they are placed by
   * their address's city again, as everyone is; hiding is setHidden.
   */
  async stopSharing(userId: string): Promise<NearbyStatus> {
    await this.db.query(
      `update users
          set shares_location = false, latitude = null, longitude = null,
              location_place = null, location_updated_at = null
        where id = $1`,
      [userId],
    );
    return this.sharingStatus(userId);
  }

  /**
   * Shows or hides the caller in everyone else's Nearby.
   *
   * Hiding keeps everything — the address, a shared position — so showing
   * again is one tap and puts them back where they were. It does not stop
   * them looking.
   */
  async setHidden(userId: string, hidden: boolean): Promise<NearbyStatus> {
    await this.db.query('update users set nearby_hidden = $2 where id = $1', [
      userId,
      hidden,
    ]);
    return this.sharingStatus(userId);
  }

  async sharingStatus(userId: string): Promise<NearbyStatus> {
    const me = await this.ownPosition(userId);
    return {
      sharing: !me.hidden && me.source !== null,
      updatedAt: me.updatedAt,
      place: me.place,
      source: me.source,
      hidden: me.hidden,
      addressPlace: me.addressPlace,
      shared: me.shared,
    };
  }

  /**
   * Where a search measures from: a typed city, else where the caller is
   * shown — or would be, if hidden — else nowhere.
   */
  private async originFor(
    userId: string,
    place: string | undefined,
  ): Promise<(NearbyOrigin & { lat: number; lon: number }) | null> {
    if (place?.trim()) {
      const from = this.resolvePlace(place);
      return { source: 'search', place: from.name, lat: from.lat, lon: from.lon };
    }
    const me = await this.ownPosition(userId);
    if (me.source === null || me.lat == null || me.lon == null) return null;
    return { source: me.source, place: me.place, lat: me.lat, lon: me.lon };
  }

  /**
   * People within `radiusKm`, optionally only those who do a particular job.
   *
   * The role filter is what makes this a hiring tool rather than a list of
   * whoever happens to be around: "an SDE photo editor within 30km" is the
   * question people actually have. It matches on overlap, so someone who is
   * both a photographer and an editor is found by either search.
   *
   * Returns an empty list — not an error — when there is nowhere to measure
   * from, with `origin: null`, so the screen can ask for a city rather than
   * showing a failure. `sharing` is the installed apps' word for "there is a
   * list to show".
   */
  async nearby(
    userId: string,
    radiusKm = DEFAULT_RADIUS_KM,
    roles: readonly string[] = [],
    /** Search from here instead of from the caller's own position. */
    place?: string,
  ): Promise<{
    sharing: boolean;
    people: NearbyPerson[];
    /** The typed city the search was measured from, when there was one. */
    place?: string;
    /** Where the search was measured from; null when there was nowhere. */
    origin: NearbyOrigin | null;
  }> {
    const radius = Math.min(Math.max(radiusKm, 1), MAX_RADIUS_KM);
    // Unrecognised values are dropped rather than rejected: the DTO already
    // refuses them, and a filter that silently matches nothing is worse than
    // one that ignores a stray value.
    const wanted = normalizeRoles(roles);

    const origin = await this.originFor(userId, place);
    if (!origin) return { sharing: false, people: [], origin: null };

    const rows = await this.db.query<{
      id: string;
      email: string;
      display_name: string | null;
      avatar_url: string | null;
      roles: string[] | null;
      handle: string | null;
      distance_km: string | number;
      approximate: boolean | null;
      place: string | null;
      relationship: NearbyPerson['relationship'];
    }>(
      // Haversine, computed in a subquery so the radius can be filtered on the
      // alias. Filtering it inline would mean repeating the expression, and
      // HAVING without GROUP BY collapses the whole result into one aggregate
      // group rather than filtering rows.
      //
      // Cheap enough at this scale, and avoids a PostGIS dependency for what is
      // a single radius query.
      //
      // Everyone in one city is the same distance from anywhere, so ties are
      // common: among them, whoever was last seen most recently comes first,
      // as the likeliest to answer.
      `select * from (${NEARBY_CANDIDATES}) candidates
        where distance_km <= $4
        order by distance_km, last_seen_at desc nulls last, id
        limit 50`,
      [userId, origin.lat, origin.lon, radius, wanted],
    );

    return {
      sharing: true,
      ...(origin.source === 'search' && origin.place ? { place: origin.place } : {}),
      origin: { source: origin.source, place: origin.place },
      // The email is selected only for the name fallback and never leaves.
      people: rows.map((r) => ({
        id: r.id,
        name: r.display_name?.trim() || r.email.split('@')[0],
        avatarUrl: r.avatar_url,
        distanceKm: Number(r.distance_km),
        approximate: r.approximate ?? false,
        place: r.place ?? null,
        roles: r.roles ?? [],
        handle: r.handle,
        relationship: r.relationship,
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
    /** Same override as `nearby`, or the chips would count a different place. */
    place?: string,
  ): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const role of USER_ROLES) counts[role] = 0;

    const origin = await this.originFor(userId, place);
    if (!origin) return counts;

    // Over everyone in range, not over the list. That stops at the closest
    // 50, so in a busy city the chips undercounted while the screen said the
    // number was how many are in range.
    const rows = await this.db.query<{ role: string; n: number }>(
      `select r.role, count(*)::int as n
         from (${NEARBY_CANDIDATES}) candidates
         cross join lateral unnest(candidates.roles) as r(role)
        where candidates.distance_km <= $4
        group by r.role`,
      [
        userId,
        origin.lat,
        origin.lon,
        Math.min(Math.max(radiusKm, 1), MAX_RADIUS_KM),
        [],
      ],
    );
    for (const { role, n } of rows) {
      if (role in counts) counts[role] = n;
    }
    return counts;
  }
}
