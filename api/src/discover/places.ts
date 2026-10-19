import { canonicalLocation, CITY_NAMES, coordsFor, locationKey } from '../hiring/locations';

/**
 * Where an address puts somebody, for Nearby and for ranking jobs.
 *
 * The city and the province only — never the street. The answer is a city
 * centre from the job board's own table, so a city means the same point in
 * both features, or failing that the province's capital. Both are public
 * places that thousands of people share, which is what makes it safe to put
 * everyone with an address in Nearby without asking: the most anyone can
 * learn from it is the town, and the profile already says that.
 *
 * No geocoder, for the same reasons the job board has none: the list is
 * closed, it does not change, and a network round trip inside sign-up would
 * be a dependency to no purpose. An address the tables cannot place gets no
 * position at all rather than a guess, and the profile says so.
 */

export interface AddressPlace {
  /** A city from the job board's table, or a province. What Nearby shows. */
  place: string;
  latitude: number;
  longitude: number;
}

/**
 * Every province, with roughly where it is: the capital, give or take.
 *
 * A capital rather than a geometric centroid. Most people in a province live
 * in or near its main town, so that is the better guess for "how far is this
 * person", and a centroid can land in the middle of a mountain range or the
 * sea. Metro Manila is here too, because people write it in the province box.
 *
 * Maguindanao is kept as one entry beside the two provinces it was split into
 * in 2022: addresses still say it, and halfway between the two is closer than
 * nothing.
 */
const PROVINCES: readonly (readonly [name: string, lat: number, lon: number])[] = [
  ['Metro Manila', 14.5995, 120.9842],
  // Cordillera
  ['Abra', 17.5964, 120.6181],
  ['Apayao', 18.0236, 121.1843],
  ['Benguet', 16.4612, 120.5877],
  ['Ifugao', 16.7955, 121.1213],
  ['Kalinga', 17.4189, 121.4443],
  ['Mountain Province', 17.089, 120.9772],
  // Ilocos
  ['Ilocos Norte', 18.1978, 120.5936],
  ['Ilocos Sur', 17.5747, 120.3869],
  ['La Union', 16.6159, 120.3166],
  ['Pangasinan', 16.0218, 120.2319],
  // Cagayan Valley
  ['Batanes', 20.4487, 121.9702],
  ['Cagayan', 17.6132, 121.727],
  ['Isabela', 17.1485, 121.8892],
  ['Nueva Vizcaya', 16.4842, 121.1494],
  ['Quirino', 16.5103, 121.5228],
  // Central Luzon
  ['Aurora', 15.7593, 121.5622],
  ['Bataan', 14.6762, 120.5363],
  ['Bulacan', 14.8433, 120.8114],
  ['Nueva Ecija', 15.5422, 121.0838],
  ['Pampanga', 15.0349, 120.6898],
  ['Tarlac', 15.4755, 120.5963],
  ['Zambales', 15.3276, 119.9783],
  // Calabarzon
  ['Batangas', 13.7565, 121.0583],
  ['Cavite', 14.2814, 120.8667],
  ['Laguna', 14.2814, 121.4161],
  ['Quezon', 13.9373, 121.617],
  ['Rizal', 14.5878, 121.1759],
  // Mimaropa
  ['Marinduque', 13.4467, 121.8406],
  ['Occidental Mindoro', 13.2233, 120.596],
  ['Oriental Mindoro', 13.4115, 121.1803],
  ['Palawan', 9.7392, 118.7353],
  ['Romblon', 12.5751, 122.2699],
  // Bicol
  ['Albay', 13.1391, 123.7438],
  ['Camarines Norte', 14.1122, 122.9553],
  ['Camarines Sur', 13.5826, 123.2771],
  ['Catanduanes', 13.581, 124.23],
  ['Masbate', 12.3686, 123.6195],
  ['Sorsogon', 12.9714, 124.0064],
  // Western Visayas and Negros
  ['Aklan', 11.7086, 122.3648],
  ['Antique', 10.7438, 121.9418],
  ['Capiz', 11.5853, 122.7511],
  ['Guimaras', 10.6584, 122.5964],
  ['Iloilo', 10.7202, 122.5621],
  ['Negros Occidental', 10.6407, 122.9689],
  ['Negros Oriental', 9.3068, 123.3054],
  ['Siquijor', 9.2146, 123.515],
  // Central Visayas
  ['Bohol', 9.6496, 123.8535],
  ['Cebu', 10.3157, 123.8854],
  // Eastern Visayas
  ['Biliran', 11.5833, 124.3959],
  ['Eastern Samar', 11.6081, 125.4319],
  ['Leyte', 11.2444, 125.0048],
  ['Northern Samar', 12.4994, 124.6353],
  ['Samar', 11.7753, 124.8862],
  ['Southern Leyte', 10.1335, 124.8447],
  // Zamboanga Peninsula
  ['Zamboanga del Norte', 8.5883, 123.3414],
  ['Zamboanga del Sur', 7.8257, 123.437],
  ['Zamboanga Sibugay', 7.7844, 122.5872],
  // Northern Mindanao
  ['Bukidnon', 8.1575, 125.1278],
  ['Camiguin', 9.25, 124.7167],
  ['Lanao del Norte', 8.0524, 123.797],
  ['Misamis Occidental', 8.4859, 123.8048],
  ['Misamis Oriental', 8.4542, 124.6319],
  // Davao
  ['Davao de Oro', 7.6078, 125.9664],
  ['Davao del Norte', 7.4478, 125.8078],
  ['Davao del Sur', 6.7497, 125.3572],
  ['Davao Occidental', 6.4131, 125.6114],
  ['Davao Oriental', 6.955, 126.2167],
  // Soccsksargen
  ['Cotabato', 7.0083, 125.0894],
  ['Sarangani', 6.1023, 125.2905],
  ['South Cotabato', 6.5031, 124.8469],
  ['Sultan Kudarat', 6.6333, 124.6],
  // Caraga
  ['Agusan del Norte', 9.1236, 125.5345],
  ['Agusan del Sur', 8.6057, 125.9153],
  ['Dinagat Islands', 10.0083, 125.57],
  ['Surigao del Norte', 9.7838, 125.4889],
  ['Surigao del Sur', 9.0783, 126.1986],
  // Bangsamoro
  ['Basilan', 6.7013, 121.971],
  ['Lanao del Sur', 8.0034, 124.2839],
  ['Maguindanao', 6.8644, 124.4411],
  ['Maguindanao del Norte', 7.1886, 124.1764],
  ['Maguindanao del Sur', 6.7154, 124.7855],
  ['Sulu', 6.0535, 121.0021],
  ['Tawi-Tawi', 5.0292, 119.7731],
];

/**
 * Other names people write in the province box, folded.
 *
 * Only the ones that are genuinely in use: the region Metro Manila is filed
 * under, and the provinces that were renamed but live on in old IDs and
 * envelopes.
 */
const PROVINCE_ALIASES: Record<string, string> = {
  ncr: 'Metro Manila',
  nationalcapitalregion: 'Metro Manila',
  metromanilancr: 'Metro Manila',
  manila: 'Metro Manila',
  mm: 'Metro Manila',
  compostelavalley: 'Davao de Oro',
  comval: 'Davao de Oro',
  westernsamar: 'Samar',
  mtprovince: 'Mountain Province',
  mtprov: 'Mountain Province',
  northcotabato: 'Cotabato',
};

/**
 * Which province each city in the job board's table is in.
 *
 * This is what stops a shared town name putting somebody on the wrong
 * island. "City of Naga" in Cebu and Naga in Camarines Sur fold to the same
 * key, and only the province on the address says which one it is; without
 * this, a Cebuano would be placed 400 km away in Bicol.
 */
const CITY_PROVINCE: Record<string, string | readonly string[]> = {
  Manila: 'Metro Manila',
  'Quezon City': 'Metro Manila',
  Makati: 'Metro Manila',
  Taguig: 'Metro Manila',
  Pasig: 'Metro Manila',
  Mandaluyong: 'Metro Manila',
  Parañaque: 'Metro Manila',
  Pasay: 'Metro Manila',
  Marikina: 'Metro Manila',
  Muntinlupa: 'Metro Manila',
  'Las Piñas': 'Metro Manila',
  Caloocan: 'Metro Manila',
  Valenzuela: 'Metro Manila',
  'San Juan': 'Metro Manila',
  Antipolo: 'Rizal',
  Baguio: 'Benguet',
  Tagaytay: 'Cavite',
  'Batangas City': 'Batangas',
  Lipa: 'Batangas',
  Calamba: 'Laguna',
  'Santa Rosa': 'Laguna',
  Bacoor: 'Cavite',
  Dasmariñas: 'Cavite',
  Imus: 'Cavite',
  'San Fernando, Pampanga': 'Pampanga',
  Angeles: 'Pampanga',
  Olongapo: 'Zambales',
  Subic: 'Zambales',
  'Tarlac City': 'Tarlac',
  Cabanatuan: 'Nueva Ecija',
  'San Jose del Monte': 'Bulacan',
  Malolos: 'Bulacan',
  Naga: 'Camarines Sur',
  Legazpi: 'Albay',
  Vigan: 'Ilocos Sur',
  Laoag: 'Ilocos Norte',
  Dagupan: 'Pangasinan',
  'Puerto Princesa': 'Palawan',
  'El Nido': 'Palawan',
  'Cebu City': 'Cebu',
  Mandaue: 'Cebu',
  'Lapu-Lapu': 'Cebu',
  'Talisay, Cebu': 'Cebu',
  'Iloilo City': 'Iloilo',
  Bacolod: 'Negros Occidental',
  Dumaguete: 'Negros Oriental',
  Tacloban: 'Leyte',
  Ormoc: 'Leyte',
  'Roxas City': 'Capiz',
  Tagbilaran: 'Bohol',
  Panglao: 'Bohol',
  Boracay: 'Aklan',
  Kalibo: 'Aklan',
  'Davao City': 'Davao del Sur',
  'Cagayan de Oro': 'Misamis Oriental',
  Iligan: 'Lanao del Norte',
  'Ozamiz City': 'Misamis Occidental',
  Dipolog: 'Zamboanga del Norte',
  Pagadian: 'Zamboanga del Sur',
  'Zamboanga City': 'Zamboanga del Sur',
  'General Santos': 'South Cotabato',
  Butuan: 'Agusan del Norte',
  'Surigao City': 'Surigao del Norte',
  'Valencia, Bukidnon': 'Bukidnon',
  Malaybalay: 'Bukidnon',
  Koronadal: 'South Cotabato',
  // Independent, and the Bangsamoro seat. Addresses file it under the
  // province around it, under that province since the 2022 split, or under
  // Cotabato, whose name it shares; all three are right enough.
  'Cotabato City': ['Maguindanao', 'Maguindanao del Norte', 'Cotabato'],
  Tagum: 'Davao del Norte',
  Panabo: 'Davao del Norte',
  Digos: 'Davao del Sur',
  Mati: 'Davao Oriental',
};

/** Exported for the spec, which holds every city to having a province. */
export function provincesOfCity(city: string): readonly string[] {
  const home = CITY_PROVINCE[city];
  return home === undefined ? [] : typeof home === 'string' ? [home] : home;
}

export { CITY_NAMES };

const PROVINCE_BY_KEY = new Map(
  PROVINCES.map(([name, lat, lon]) => [locationKey(name), { name, lat, lon }]),
);

/** Spaces collapsed and ends trimmed; empty for nothing at all. */
function tidy(input: string | null | undefined): string {
  return (input ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * The province a piece of text names, or null.
 *
 * Tried as written first, so "Mountain Province" is not cut down to
 * "Mountain" by the suffix rule, then with "Province of" / "province"
 * dropped — "Cebu Province" and "Province of Cebu" are both just Cebu.
 */
function provinceNamed(
  input: string | null | undefined,
): { name: string; lat: number; lon: number } | null {
  const key = locationKey(tidy(input));
  if (!key) return null;
  const stripped = key.replace(/^provinceof/, '').replace(/province$/, '');
  for (const candidate of [key, stripped]) {
    if (!candidate) continue;
    const named = PROVINCE_ALIASES[candidate] ?? null;
    const hit = PROVINCE_BY_KEY.get(named ? locationKey(named) : candidate);
    if (hit) return hit;
  }
  return null;
}

/**
 * The job board's name for the city a piece of text names, or null.
 *
 * Tried in turn: as written ("cebu" is Cebu City through the aliases), with
 * "City of" or "City" taken off ("Mandaue City", "City of Naga"), with the
 * province put after it ("Talisay" in Cebu is the table's "Talisay, Cebu"),
 * and up to a comma ("Cebu City, Cebu" typed into the one box).
 *
 * "City" is only ever removed, never added. Adding it would turn the
 * municipality of Quezon, Bukidnon, into Quezon City.
 */
function cityNamed(
  input: string | null | undefined,
  province?: string | null,
): string | null {
  const city = tidy(input);
  if (!city) return null;

  const bare = city
    .replace(/^(city|municipality|municipio)\s+of\s+/i, '')
    .replace(/\s+city$/i, '')
    .trim();
  const beforeComma = city.split(',')[0].trim();
  const prov = tidy(province);

  const candidates = [
    city,
    bare,
    ...(prov ? [`${city}, ${prov}`, `${bare}, ${prov}`] : []),
    beforeComma,
  ];
  for (const candidate of candidates) {
    if (candidate && coordsFor(candidate)) return canonicalLocation(candidate);
  }
  return null;
}

interface Resolved {
  /** The table's city, when the city resolved and agrees with the province. */
  city: string | null;
  /** The canonical province, when the province box named one. */
  province: string | null;
  at: AddressPlace | null;
}

function resolve(
  cityInput: string | null | undefined,
  provinceInput: string | null | undefined,
): Resolved {
  const province = provinceNamed(provinceInput);
  let city = cityNamed(cityInput, provinceInput);

  // A city found in the table but in a different province from the one on
  // the address is a different town with the same name. The province wins:
  // it is the coarser answer, but it is the right island.
  if (city && province) {
    const homes = provincesOfCity(city);
    if (homes.length > 0 && !homes.includes(province.name)) city = null;
  }

  if (city) {
    const coords = coordsFor(city);
    if (coords) {
      return {
        city,
        province: province?.name ?? null,
        at: { place: city, latitude: coords.lat, longitude: coords.lon },
      };
    }
  }

  const fallback =
    province ??
    // The province box left empty or unrecognised, and the city box holding
    // a province — "Bohol" is a reasonable answer to "where do you live".
    provinceNamed(cityInput);
  if (fallback) {
    return {
      city: null,
      province: province?.name ?? null,
      at: { place: fallback.name, latitude: fallback.lat, longitude: fallback.lon },
    };
  }

  // Last, a known city typed in the province box under a barangay or a
  // district in the city box: "Lahug", "Cebu City".
  const provinceAsCity = cityNamed(provinceInput);
  const coords = provinceAsCity ? coordsFor(provinceAsCity) : null;
  if (provinceAsCity && coords) {
    return {
      city: null,
      province: null,
      at: { place: provinceAsCity, latitude: coords.lat, longitude: coords.lon },
    };
  }

  return { city: null, province: null, at: null };
}

/**
 * Where an address's city puts somebody: a city centre, a province's capital,
 * or null when neither table knows it.
 */
export function addressPlace(
  city: string | null | undefined,
  province: string | null | undefined,
): AddressPlace | null {
  if (!tidy(city)) return null;
  return resolve(city, province).at;
}

/** "plaridel" → "Plaridel". Only for text typed entirely in lower case. */
function capitalised(text: string): string {
  if (text !== text.toLowerCase()) return text;
  return text.replace(/(^|[\s-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
}

/**
 * The "City, Province" a profile shows, from the address.
 *
 * The table's spelling where the city resolved — the same reason the job
 * board canonicalises, so one town is not three — and the address's own
 * words where it did not. The province is left off when it would only repeat
 * the city. A table name that already carries its province ("Talisay, Cebu")
 * is cut to the town so the province is not said twice.
 *
 * Never the street. That stays private.
 */
export function addressLocation(
  cityInput: string | null | undefined,
  provinceInput: string | null | undefined,
): string | null {
  const typedCity = tidy(cityInput);
  if (!typedCity) return null;
  const resolved = resolve(cityInput, provinceInput);

  const city = resolved.city ? resolved.city.split(',')[0].trim() : capitalised(typedCity);
  const province = resolved.province ?? capitalised(tidy(provinceInput));

  if (!province || locationKey(province) === locationKey(city)) return city;
  return `${city}, ${province}`;
}
