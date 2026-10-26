/**
 * Whether the position a user shared still counts, as SQL over the users row
 * aliased `u`.
 *
 * One definition for every feature that measures from somebody, so Nearby and
 * the job board cannot disagree about where a person is.
 *
 * A device fix counts for 30 days. Stale positions are worse than none:
 * someone whose phone reported a fix months ago is not "nearby" in any useful
 * sense. A city picked by hand is exempt — it was not a reading that has
 * since drifted, it was a statement about where somebody is based.
 *
 * When this is false, the address's city stands in (see discover/places.ts).
 */
export function liveSharedPosition(u: string): string {
  return `(${u}.shares_location
          and ${u}.latitude is not null
          and ${u}.longitude is not null
          and (${u}.location_place is not null
               or ${u}.location_updated_at > now() - interval '30 days'))`;
}

/**
 * Where somebody is, as `lat`, `lon`, `place`, `approximate`, `source` and
 * `precision` columns, for a LATERAL join after `u`: their shared position
 * while it counts, otherwise their address's town, otherwise nulls.
 *
 * `approximate` is true for anything but a device fix. A city centre is the
 * same point for everyone in that city, so a distance to it says "in Cebu
 * City", not "3 km from you", and the apps word it that way.
 *
 * `precision` is how closely the point places them (discover/distance.ts):
 * 'gps' for a device, 'city' for a town's centre, 'province' for a capital
 * standing in for a town. An address placed by an API from before migration
 * 103 has none and counts as a province, the coarser reading, until the
 * backfill places it again.
 */
export function positionOf(u: string): string {
  const live = liveSharedPosition(u);
  return `
    select case when ${live} then ${u}.latitude else ${u}.address_latitude end as lat,
           case when ${live} then ${u}.longitude else ${u}.address_longitude end as lon,
           case when ${live} then ${u}.location_place else ${u}.address_place end as place,
           not ${live} or ${u}.location_place is not null as approximate,
           case when ${live}
                then case when ${u}.location_place is null then 'gps' else 'place' end
                when ${u}.address_latitude is not null
                 and ${u}.address_longitude is not null then 'address'
           end as source,
           case when ${live}
                then case when ${u}.location_place is null then 'gps' else 'city' end
                when ${u}.address_latitude is not null
                 and ${u}.address_longitude is not null
                then coalesce(${u}.address_precision, 'province')
           end as precision`;
}
