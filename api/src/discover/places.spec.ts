import { addressLocation, addressPlace, CITY_NAMES, provincesOfCity } from './places';
import { PH_TOWNS } from './ph-towns';

/**
 * Where an address puts somebody in Nearby.
 *
 * The answers people actually type: the "City" suffix and the "City of"
 * prefix the government uses, lower case, aliases, a municipality the city
 * table has never heard of, and a town name two provinces share.
 */

describe('addressPlace', () => {
  it('takes the "City" suffix off', () => {
    expect(addressPlace('Mandaue City', 'Cebu')).toEqual({
      place: 'Mandaue, Cebu',
      latitude: 10.3237,
      longitude: 123.9227,
      precision: 'city',
    });
    expect(addressPlace('Makati City', 'Metro Manila')?.place).toBe('Makati, Metro Manila');
  });

  it('takes the "City of" prefix off', () => {
    expect(addressPlace('City of Naga', 'Camarines Sur')?.place).toBe('Naga, Camarines Sur');
  });

  it('names the province of a table city when the province box is empty', () => {
    expect(addressPlace('Ozamiz City', '')?.place).toBe('Ozamiz City, Misamis Occidental');
    expect(addressPlace('ozamis', null)?.place).toBe('Ozamiz City, Misamis Occidental');
    // Three provinces claim Cotabato City; none is named rather than one guessed.
    expect(addressPlace('Cotabato City', '')?.place).toBe('Cotabato City');
  });

  it('reads the province before trusting a town name two places share', () => {
    // The City of Naga in Cebu is not Naga in Bicol, 400 km away.
    expect(addressPlace('City of Naga', 'Cebu')).toEqual({
      place: 'Naga, Cebu',
      latitude: 10.2167,
      longitude: 123.75,
      precision: 'city',
    });
    expect(addressPlace('San Juan', 'Batangas')).toMatchObject({
      place: 'San Juan, Batangas',
      precision: 'city',
    });
    expect(addressPlace('San Juan', 'NCR')).toMatchObject({
      place: 'San Juan, Metro Manila',
      precision: 'city',
    });
    // Calamba in Misamis Occidental, not Calamba in Laguna.
    expect(addressPlace('Calamba', 'Misamis Occidental')).toMatchObject({
      place: 'Calamba, Misamis Occidental',
      latitude: 8.5583,
      precision: 'city',
    });
  });

  it('folds case and goes through the aliases', () => {
    expect(addressPlace('cebu', 'cebu')?.place).toBe('Cebu City, Cebu');
    expect(addressPlace('  CDO ', 'Misamis Oriental')?.place).toBe(
      'Cagayan de Oro, Misamis Oriental',
    );
    expect(addressPlace('paranaque', 'metro manila')?.place).toBe('Parañaque, Metro Manila');
  });

  it("says a table entry's province once", () => {
    expect(addressPlace('Talisay', 'Cebu')?.place).toBe('Talisay, Cebu');
    expect(addressPlace('Talisay City', 'Cebu')?.place).toBe('Talisay, Cebu');
    expect(addressPlace('San Fernando', 'Pampanga')?.place).toBe('San Fernando, Pampanga');
  });

  it('places every other town at its own centre', () => {
    // The report: towns the job board's table never had, all once at the
    // province's capital.
    expect(addressPlace('Plaridel', 'Misamis Occidental')).toEqual({
      place: 'Plaridel, Misamis Occidental',
      latitude: 8.6214,
      longitude: 123.7101,
      precision: 'city',
    });
    expect(addressPlace('Plaridel', 'Bulacan')).toMatchObject({
      place: 'Plaridel, Bulacan',
      precision: 'city',
    });
    expect(addressPlace('oroquieta city', 'misamis occidental')?.place).toBe(
      'Oroquieta, Misamis Occidental',
    );
    // The whole address in the one box, or a purok before the town.
    expect(addressPlace('Jimenez, Misamis Occidental', 'Misamis Occidental')?.place).toBe(
      'Jimenez, Misamis Occidental',
    );
    expect(addressPlace('Purok 3, Clarin', 'Misamis Occidental')).toMatchObject({
      place: 'Clarin, Misamis Occidental',
      latitude: 8.2,
    });
  });

  it('knows a town by its other names and shortened words', () => {
    expect(addressPlace('Don Victoriano Chiongbian', 'Misamis Occidental')?.place).toBe(
      'Don Victoriano, Misamis Occidental',
    );
    expect(addressPlace('Dao', 'Antique')?.place).toBe('Tobias Fornier, Antique');
    expect(addressPlace('Sta. Cruz', 'Laguna')?.place).toBe('Santa Cruz, Laguna');
    expect(addressPlace('Gen. Trias City', 'Cavite')?.place).toBe('General Trias, Cavite');
  });

  it('tells towns of one name apart by province, and needs a name the country has once without one', () => {
    expect(addressPlace('San Jose', 'Batangas')?.latitude).toBe(13.8772);
    expect(addressPlace('San Jose', 'Tarlac')?.latitude).toBe(15.4781);
    expect(addressPlace('San Jose', '')).toBeNull();
    expect(addressPlace('Kalayaan', '')).toBeNull();
    expect(addressPlace('Tangub City', '')?.place).toBe('Tangub, Misamis Occidental');
    // A province box it does not know, and a name only one town has.
    expect(addressPlace('Old Kaabakan', 'BARMM')?.place).toBe('Old Kaabakan, Cotabato');
  });

  it('reads Maguindanao as both of the provinces it was split into', () => {
    expect(addressPlace('Datu Odin Sinsuat', 'Maguindanao')).toMatchObject({
      place: 'Datu Odin Sinsuat, Maguindanao del Norte',
      precision: 'city',
    });
  });

  it('never names a street, a barangay or a lot, only the province', () => {
    for (const typed of [
      '123 Rizal St',
      'Purok 5',
      'Brgy. Lower Lamac',
      'Lower Lamac',
      'Barangay Poblacion',
      'Sitio Malinao',
      'Blk 4 Lot 2',
      'Villa Verde Subdivision',
    ]) {
      expect(addressPlace(typed, 'Misamis Occidental')).toEqual({
        place: 'Misamis Occidental',
        latitude: 8.4859,
        longitude: 123.8048,
        precision: 'province',
      });
    }
  });

  it('does not add "City" to a municipality', () => {
    // Quezon, Bukidnon is not Quezon City.
    expect(addressPlace('Quezon', 'Bukidnon')).toMatchObject({
      place: 'Quezon, Bukidnon',
      precision: 'city',
    });
    expect(addressPlace('Quezon', '')).toMatchObject({ place: 'Quezon', precision: 'province' });
  });

  it('understands the other names a province goes by', () => {
    expect(addressPlace('Somewhere', 'NCR')?.place).toBe('Metro Manila');
    expect(addressPlace('Somewhere', 'National Capital Region')?.place).toBe('Metro Manila');
    expect(addressPlace('Somewhere', 'Province of Cebu')?.place).toBe('Cebu');
    expect(addressPlace('Somewhere', 'Cebu Province')?.place).toBe('Cebu');
    expect(addressPlace('Somewhere', 'Mountain Province')?.place).toBe('Mountain Province');
    expect(addressPlace('Nabunturan', 'Compostela Valley')?.place).toBe(
      'Nabunturan, Davao de Oro',
    );
  });

  it('does not say the province twice', () => {
    expect(addressPlace('Bohol', 'Bohol')?.place).toBe('Bohol');
    expect(addressPlace('Cebu Province', 'Cebu')?.place).toBe('Cebu');
    expect(addressPlace('Misamis Occidental', 'Misamis Occidental')?.place).toBe(
      'Misamis Occidental',
    );
  });

  it('reads a province written in the city box, and a town in the province box', () => {
    expect(addressPlace('Bohol', '')).toMatchObject({ place: 'Bohol', precision: 'province' });
    // Lahug is a barangay of Cebu City: the city is named, never the barangay.
    expect(addressPlace('Lahug', 'Cebu City')).toMatchObject({
      place: 'Cebu City, Cebu',
      precision: 'city',
    });
    expect(addressPlace('Poblacion', 'Jimenez')).toMatchObject({
      place: 'Jimenez, Misamis Occidental',
      precision: 'city',
    });
  });

  it('finds a table city after a purok or a barangay, but not in a province name', () => {
    expect(addressPlace('Purok 3, Ozamiz City', 'Misamis Occidental')).toMatchObject({
      place: 'Ozamiz City, Misamis Occidental',
      latitude: 8.1463,
      precision: 'city',
    });
    expect(addressPlace('Lahug, Cebu City', 'Cebu')?.place).toBe('Cebu City, Cebu');
    // Dalaguete is a town in Cebu province, not a district of Cebu City.
    expect(addressPlace('Dalaguete, Cebu', 'Cebu')).toMatchObject({
      place: 'Dalaguete, Cebu',
      latitude: 9.7612,
      precision: 'city',
    });
  });

  it('places nothing it cannot place', () => {
    expect(addressPlace('Atlantis', 'Narnia')).toBeNull();
    expect(addressPlace('', 'Cebu')).toBeNull();
    expect(addressPlace(null, null)).toBeNull();
    expect(addressPlace('   ', undefined)).toBeNull();
  });

  it('knows the province of every city in the table, and every place is in the Philippines', () => {
    for (const city of CITY_NAMES) {
      expect(provincesOfCity(city).length).toBeGreaterThan(0);
      // Each of those provinces is one the table can place.
      for (const province of provincesOfCity(city)) {
        expect(addressPlace('Nowhere', province)).toMatchObject({
          place: province,
          precision: 'province',
        });
      }
    }
  });

  it('keeps every coordinate inside the country', () => {
    for (const city of CITY_NAMES) {
      for (const province of provincesOfCity(city)) {
        const at = addressPlace(city, province);
        expect(at).not.toBeNull();
        expect(at!.precision).toBe('city');
        expect(at!.place).toBe(`${city.split(',')[0]}, ${province}`);
        expect(at!.latitude).toBeGreaterThan(4.5);
        expect(at!.latitude).toBeLessThan(21.5);
        expect(at!.longitude).toBeGreaterThan(116);
        expect(at!.longitude).toBeLessThan(127);
      }
    }
  });

  it('finds every town in the country by its name and province, at its own centre', () => {
    const misplaced: string[] = [];
    for (const [name, province, lat, lon] of PH_TOWNS) {
      const at = addressPlace(name, province);
      // The job board's point where it has the city, which is within a few
      // kilometres of Wikidata's — except Davao City's, which is the middle
      // of the city's huge territory, 22 km inland, and kept on purpose
      // (marketing-assets/scripts/build-cities.mjs draws it downtown).
      const off = at ? Math.hypot(at.latitude - lat, at.longitude - lon) * 111 : Infinity;
      const allowed = name === 'Davao City' ? 25 : 5;
      if (!at || at.precision !== 'city' || off > allowed) {
        misplaced.push(`${name}, ${province}: ${at ? `${at.place} ${off.toFixed(1)} km off` : 'not found'}`);
      }
    }
    expect(misplaced).toEqual([]);
  });
});

describe('addressLocation', () => {
  it('is "City, Province" in the table\'s spelling', () => {
    expect(addressLocation('Mandaue City', 'Cebu')).toBe('Mandaue, Cebu');
    expect(addressLocation('cebu', 'cebu province')).toBe('Cebu City, Cebu');
    expect(addressLocation('Makati City', 'NCR')).toBe('Makati, Metro Manila');
  });

  it('keeps the address\'s own words for a place the table does not know', () => {
    expect(addressLocation('plaridel', 'Misamis Occidental')).toBe('Plaridel, Misamis Occidental');
    expect(addressLocation('City of Naga', 'Cebu')).toBe('City of Naga, Cebu');
    expect(addressLocation('Atlantis', 'Narnia')).toBe('Atlantis, Narnia');
  });

  it('does not say the province twice', () => {
    expect(addressLocation('Talisay', 'Cebu')).toBe('Talisay, Cebu');
    expect(addressLocation('Bohol', 'Bohol')).toBe('Bohol');
    expect(addressLocation('Quezon', '')).toBe('Quezon');
  });

  it('is nothing without a city', () => {
    expect(addressLocation('', 'Cebu')).toBeNull();
    expect(addressLocation(null, null)).toBeNull();
  });
});
