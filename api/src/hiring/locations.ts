/**
 * Place-name normalisation, server side.
 *
 * A copy of the clients' `ph-locations.ts` logic rather than an import: the API
 * shares no build with them, and the server has to be the one that decides,
 * because a request can arrive from anywhere. The clients normalise too, but
 * only so the field shows what will be stored.
 *
 * Keep the alias table and the folding rule in step with
 * `web/src/lib/ph-locations.ts`. If they drift, the same place gets two keys
 * and the board quietly splits it in two — which is the exact failure this
 * exists to prevent.
 */

const ALIASES: Record<string, string> = {
  cdo: 'Cagayan de Oro',
  qc: 'Quezon City',
  bgc: 'Taguig',
  ozamis: 'Ozamiz City',
  ozamiscity: 'Ozamiz City',
  gensan: 'General Santos',
  gensantos: 'General Santos',
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
  metromanila: 'Manila',
};

/**
 * The places a job is posted from, with roughly where they are.
 *
 * Coordinates so the board can put the nearest jobs first. They are city
 * centres, not venues — good enough to answer "is this reachable", and
 * deliberately not precise enough to be read as an address. The UI says
 * "near Cebu City" rather than a street.
 *
 * A table rather than a geocoder call: the list is closed, it does not change,
 * and a network round trip on every post would be a dependency to no purpose.
 */
const CITIES: readonly (readonly [name: string, lat: number, lon: number])[] = [
  ['Manila', 14.5995, 120.9842],
  ['Quezon City', 14.676, 121.0437],
  ['Makati', 14.5547, 121.0244],
  ['Taguig', 14.5176, 121.0509],
  ['Pasig', 14.5764, 121.0851],
  ['Mandaluyong', 14.5794, 121.0359],
  ['Parañaque', 14.4793, 121.0198],
  ['Pasay', 14.5378, 120.9896],
  ['Marikina', 14.6507, 121.1029],
  ['Muntinlupa', 14.3811, 121.0437],
  ['Las Piñas', 14.4499, 120.9833],
  ['Caloocan', 14.6488, 120.9673],
  ['Valenzuela', 14.7, 120.983],
  ['San Juan', 14.6019, 121.0355],
  ['Antipolo', 14.5878, 121.1759],
  ['Baguio', 16.4023, 120.596],
  ['Tagaytay', 14.1153, 120.9621],
  ['Batangas City', 13.7565, 121.0583],
  ['Lipa', 13.9411, 121.1624],
  ['Calamba', 14.2117, 121.1653],
  ['Santa Rosa', 14.3122, 121.1114],
  ['Bacoor', 14.459, 120.949],
  ['Dasmariñas', 14.3294, 120.9367],
  ['Imus', 14.4297, 120.9367],
  ['San Fernando, Pampanga', 15.0349, 120.6898],
  ['Angeles', 15.145, 120.5887],
  ['Olongapo', 14.8296, 120.2827],
  ['Subic', 14.8794, 120.2345],
  ['Tarlac City', 15.4755, 120.5963],
  ['Cabanatuan', 15.4864, 120.967],
  ['San Jose del Monte', 14.8139, 121.0453],
  ['Malolos', 14.8433, 120.8114],
  ['Naga', 13.6218, 123.1948],
  ['Legazpi', 13.1391, 123.7438],
  ['Vigan', 17.5747, 120.3869],
  ['Laoag', 18.1978, 120.5936],
  ['Dagupan', 16.043, 120.333],
  ['Puerto Princesa', 9.7392, 118.7353],
  ['El Nido', 11.1949, 119.4013],
  ['Cebu City', 10.3157, 123.8854],
  ['Mandaue', 10.3237, 123.9227],
  ['Lapu-Lapu', 10.3103, 123.9494],
  ['Talisay, Cebu', 10.2447, 123.8494],
  ['Iloilo City', 10.7202, 122.5621],
  ['Bacolod', 10.6407, 122.9689],
  ['Dumaguete', 9.3068, 123.3054],
  ['Tacloban', 11.2444, 125.0048],
  ['Ormoc', 11.0064, 124.6075],
  ['Roxas City', 11.5853, 122.7511],
  ['Tagbilaran', 9.6496, 123.8535],
  ['Panglao', 9.5786, 123.7442],
  ['Boracay', 11.9674, 121.9248],
  ['Kalibo', 11.7086, 122.3648],
  ['Davao City', 7.1907, 125.4553],
  ['Cagayan de Oro', 8.4542, 124.6319],
  ['Iligan', 8.228, 124.2452],
  ['Ozamiz City', 8.1463, 123.8412],
  ['Dipolog', 8.5883, 123.3414],
  ['Pagadian', 7.8257, 123.437],
  ['Zamboanga City', 6.9214, 122.079],
  ['General Santos', 6.1164, 125.1716],
  ['Butuan', 8.9475, 125.5406],
  ['Surigao City', 9.7838, 125.4889],
  ['Valencia, Bukidnon', 7.9064, 125.0947],
  ['Malaybalay', 8.1575, 125.1278],
  ['Koronadal', 6.5031, 124.8469],
  ['Cotabato City', 7.2236, 124.2464],
  ['Tagum', 7.4478, 125.8078],
  ['Panabo', 7.3081, 125.6842],
  ['Digos', 6.7497, 125.3572],
  ['Mati', 6.955, 126.2167],
];

/** Just the names, for the canonicalisation loop below. */
const CITY_NAMES: readonly string[] = CITIES.map(([name]) => name);

/**
 * Roughly where a place is, or null if it is not one we know.
 *
 * Null is the normal answer for a named venue — "Shangri-La Mactan" is a real
 * location and simply has no coordinate here. Those posts still appear on the
 * board; they sort after the ones that can be measured.
 */
export function coordsFor(
  location: string | null | undefined,
): { lat: number; lon: number } | null {
  if (!location) return null;
  const key = locationKey(canonicalLocation(location));
  if (!key) return null;
  for (const [name, lat, lon] of CITIES) {
    if (locationKey(name) === key) return { lat, lon };
  }
  return null;
}

/** Lowercase, unaccented, stripped of punctuation and spacing. */
export function locationKey(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * The name to store. Recognisable places collapse onto one spelling; anything
 * else is kept as written, only tidied — a shoot at a named venue is a real
 * answer and must survive.
 */
export function canonicalLocation(input: string): string {
  const tidied = input.trim().replace(/\s+/g, ' ');
  if (!tidied) return '';

  const key = locationKey(tidied);
  if (!key) return tidied;

  const aliased = ALIASES[key];
  if (aliased) return aliased;

  for (const city of CITY_NAMES) {
    if (locationKey(city) === key) return city;
  }
  return tidied;
}
