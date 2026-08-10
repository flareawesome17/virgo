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

const CITIES: readonly string[] = [
  'Manila', 'Quezon City', 'Makati', 'Taguig', 'Pasig', 'Mandaluyong',
  'Parañaque', 'Pasay', 'Marikina', 'Muntinlupa', 'Las Piñas', 'Caloocan',
  'Valenzuela', 'San Juan', 'Antipolo', 'Baguio', 'Tagaytay', 'Batangas City',
  'Lipa', 'Calamba', 'Santa Rosa', 'Bacoor', 'Dasmariñas', 'Imus',
  'San Fernando, Pampanga', 'Angeles', 'Olongapo', 'Subic', 'Tarlac City',
  'Cabanatuan', 'San Jose del Monte', 'Malolos', 'Naga', 'Legazpi', 'Vigan',
  'Laoag', 'Dagupan', 'Puerto Princesa', 'El Nido', 'Cebu City', 'Mandaue',
  'Lapu-Lapu', 'Talisay, Cebu', 'Iloilo City', 'Bacolod', 'Dumaguete',
  'Tacloban', 'Ormoc', 'Roxas City', 'Tagbilaran', 'Panglao', 'Boracay',
  'Kalibo', 'Davao City', 'Cagayan de Oro', 'Iligan', 'Ozamiz City',
  'Dipolog', 'Pagadian', 'Zamboanga City', 'General Santos', 'Butuan',
  'Surigao City', 'Valencia, Bukidnon', 'Malaybalay', 'Koronadal',
  'Cotabato City', 'Tagum', 'Panabo', 'Digos', 'Mati',
];

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

  for (const city of CITIES) {
    if (locationKey(city) === key) return city;
  }
  return tidied;
}
