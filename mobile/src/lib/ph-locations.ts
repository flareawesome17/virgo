/**
 * Philippine cities offered as suggestions when typing a location.
 *
 * A suggestion list, never a constraint: a shoot happens in a barangay, a
 * resort or a venue as often as in a city, so the field stays free text and
 * this only saves typing and keeps the common spellings consistent. Two people
 * writing "Cagayan de Oro" and "CDO" split the same search in two.
 *
 * Deliberately not a places API. That would mean a key, a per-request cost and
 * a network round trip inside a form, to autocomplete a field whose realistic
 * answers number in the dozens for this market. Revisit if posts start naming
 * places this list keeps missing.
 *
 * Ordered by island group rather than alphabetically so the filter surfaces
 * regional neighbours together.
 */
export const PH_LOCATIONS: readonly string[] = [
  // Metro Manila
  'Manila',
  'Quezon City',
  'Makati',
  'Taguig',
  'Pasig',
  'Mandaluyong',
  'Parañaque',
  'Pasay',
  'Marikina',
  'Muntinlupa',
  'Las Piñas',
  'Caloocan',
  'Valenzuela',
  'San Juan',
  'Antipolo',
  // Luzon
  'Baguio',
  'Tagaytay',
  'Batangas City',
  'Lipa',
  'Calamba',
  'Santa Rosa',
  'Bacoor',
  'Dasmariñas',
  'Imus',
  'San Fernando, Pampanga',
  'Angeles',
  'Olongapo',
  'Subic',
  'Tarlac City',
  'Cabanatuan',
  'San Jose del Monte',
  'Malolos',
  'Naga',
  'Legazpi',
  'Vigan',
  'Laoag',
  'Dagupan',
  'Puerto Princesa',
  'El Nido',
  // Visayas
  'Cebu City',
  'Mandaue',
  'Lapu-Lapu',
  'Talisay, Cebu',
  'Iloilo City',
  'Bacolod',
  'Dumaguete',
  'Tacloban',
  'Ormoc',
  'Roxas City',
  'Tagbilaran',
  'Panglao',
  'Boracay',
  'Kalibo',
  // Mindanao
  'Davao City',
  'Cagayan de Oro',
  'Iligan',
  'Ozamiz City',
  'Dipolog',
  'Pagadian',
  'Zamboanga City',
  'General Santos',
  'Butuan',
  'Surigao City',
  'Valencia, Bukidnon',
  'Malaybalay',
  'Koronadal',
  'Cotabato City',
  'Tagum',
  'Panabo',
  'Digos',
  'Mati',
];

/**
 * Suggestions for what has been typed so far.
 *
 * Prefix matches come before contained ones, so typing "ceb" offers "Cebu
 * City" ahead of "Talisay, Cebu". An exact match is dropped: re-offering what
 * is already in the box is a row that does nothing.
 *
 * Matched on `locationKey`, not on the raw lowercase text. This used to
 * compare strings directly, which meant typing "parana" offered nothing for
 * "Parañaque" and "dasmarinas" nothing for "Dasmariñas" — while the job board,
 * which does fold accents, found both. Two spellings of one city are not two
 * places, and the person typing has no way to know which one the list holds.
 *
 * Folding also drops punctuation, so "san fernando pampanga" now finds
 * "San Fernando, Pampanga" without the comma being guessed correctly.
 */
export function suggestLocations(query: string, limit = 6): string[] {
  // The key, not the trimmed text: a query of only punctuation folds to an
  // empty string, and an empty prefix matches every entry in the list.
  const q = locationKey(query);
  if (q.length < 2) return [];

  const starts: string[] = [];
  const contains: string[] = [];
  for (const city of PH_LOCATIONS) {
    const key = locationKey(city);
    if (key === q) continue;
    if (key.startsWith(q)) starts.push(city);
    else if (key.includes(q)) contains.push(city);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Whether this is a place the app has coordinates for.
 *
 * The search field applies what has been typed only once it resolves to a real
 * city, so a half-typed "ceb" does not fire a request the server would refuse.
 *
 * Mirrors `coordsFor` on the server exactly — `canonicalLocation` first, then
 * fold — and that order is the whole point. Without it this answered false for
 * "cebu", "cdo", "qc" and every other alias, while the server resolved them
 * happily; the field then refused to search for something the API would have
 * accepted. Two functions deciding the same question have to decide it the
 * same way.
 */
export function isKnownLocation(input: string): boolean {
  const key = locationKey(canonicalLocation(input));
  if (!key) return false;
  return PH_LOCATIONS.some((city) => locationKey(city) === key);
}

/**
 * Spellings that should land on the same place as something in the list.
 *
 * Only the ones people actually type. "CDO" is what every Filipino
 * photographer calls Cagayan de Oro, and "Ozamis" is the older spelling of
 * Ozamiz still used on plenty of signage.
 */
const ALIASES: Record<string, string> = {
  cdo: 'Cagayan de Oro',
  qc: 'Quezon City',
  bgc: 'Taguig',
  ozamis: 'Ozamiz City',
  'ozamis city': 'Ozamiz City',
  gensan: 'General Santos',
  'gen santos': 'General Santos',
  cebu: 'Cebu City',
  davao: 'Davao City',
  iloilo: 'Iloilo City',
  zamboanga: 'Zamboanga City',
  batangas: 'Batangas City',
  tarlac: 'Tarlac City',
  roxas: 'Roxas City',
  surigao: 'Surigao City',
  cotabato: 'Cotabato City',
  puertoprincesa: 'Puerto Princesa',
  maynila: 'Manila',
  'metro manila': 'Manila',
};

/**
 * A comparable form of a place name: lowercase, unaccented, punctuation and
 * spacing removed.
 *
 * This is what makes "Parañaque" and "Paranaque" the same place, and it is
 * stored alongside the display name so the board can match on it with an index
 * instead of a leading-wildcard ILIKE that can never use one.
 */
export function locationKey(input: string): string {
  return input
    .normalize('NFD')
    // Strip combining marks — the ñ and é people may or may not type.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * The name to store for what somebody typed.
 *
 * Recognisable places collapse onto one spelling so the board can group them;
 * anything else is kept as written, only tidied. A shoot at "Shangri-La Mactan"
 * is a real answer and must survive.
 */
export function canonicalLocation(input: string): string {
  const tidied = input.trim().replace(/\s+/g, ' ');
  if (!tidied) return '';

  const key = locationKey(tidied);
  if (!key) return tidied;

  const aliased = ALIASES[tidied.toLowerCase()] ?? ALIASES[key];
  if (aliased) return aliased;

  for (const city of PH_LOCATIONS) {
    if (locationKey(city) === key) return city;
  }
  return tidied;
}
