import { addressLocation, addressPlace, CITY_NAMES, provincesOfCity } from './places';

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
    // The City of Naga in Cebu is not Naga in Bicol, 400 km away: placed at
    // Cebu's capital, and still named for itself.
    expect(addressPlace('City of Naga', 'Cebu')).toEqual({
      place: 'City of Naga, Cebu',
      latitude: 10.3157,
      longitude: 123.8854,
      precision: 'province',
    });
    expect(addressPlace('San Juan', 'Batangas')).toMatchObject({
      place: 'San Juan, Batangas',
      precision: 'province',
    });
    expect(addressPlace('San Juan', 'NCR')).toMatchObject({
      place: 'San Juan, Metro Manila',
      precision: 'city',
    });
    // Calamba in Misamis Occidental, not Calamba in Laguna.
    expect(addressPlace('Calamba', 'Misamis Occidental')).toMatchObject({
      place: 'Calamba, Misamis Occidental',
      latitude: 8.4859,
      precision: 'province',
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

  it("names a municipality it does not know, at the province's capital", () => {
    expect(addressPlace('Plaridel', 'Misamis Occidental')).toEqual({
      place: 'Plaridel, Misamis Occidental',
      latitude: 8.4859,
      longitude: 123.8048,
      precision: 'province',
    });
    expect(addressPlace('Plaridel', 'Bulacan')?.place).toBe('Plaridel, Bulacan');
    expect(addressPlace('oroquieta city', 'misamis occidental')?.place).toBe(
      'Oroquieta City, Misamis Occidental',
    );
    expect(addressPlace('Don Victoriano Chiongbian', 'Misamis Occidental')?.place).toBe(
      'Don Victoriano Chiongbian, Misamis Occidental',
    );
    // The whole address in the one box, or a purok before the town.
    expect(addressPlace('Jimenez, Misamis Occidental', 'Misamis Occidental')?.place).toBe(
      'Jimenez, Misamis Occidental',
    );
    expect(addressPlace('Purok 3, Clarin', 'Misamis Occidental')?.place).toBe(
      'Clarin, Misamis Occidental',
    );
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
      precision: 'province',
    });
  });

  it('never names a street, a barangay or a lot', () => {
    for (const typed of [
      '123 Rizal St',
      'Purok 5',
      'Brgy. Lower Lamac',
      'Barangay Poblacion',
      'Sitio Malinao',
      'Blk 4 Lot 2',
      'Zone 3',
      'Villa Verde Subdivision',
      'Somewhere near the old church by the river',
    ]) {
      expect(addressPlace(typed, 'Misamis Occidental')).toMatchObject({
        place: 'Misamis Occidental',
        precision: 'province',
      });
    }
  });

  it('does not add "City" to a municipality', () => {
    // Quezon, Bukidnon is not Quezon City.
    expect(addressPlace('Quezon', 'Bukidnon')?.place).toBe('Quezon, Bukidnon');
    expect(addressPlace('Quezon', '')?.place).toBe('Quezon');
  });

  it('understands the other names a province goes by', () => {
    expect(addressPlace('Somewhere', 'NCR')?.place).toBe('Somewhere, Metro Manila');
    expect(addressPlace('Somewhere', 'National Capital Region')?.place).toBe(
      'Somewhere, Metro Manila',
    );
    expect(addressPlace('Somewhere', 'Province of Cebu')?.place).toBe('Somewhere, Cebu');
    expect(addressPlace('Somewhere', 'Cebu Province')?.place).toBe('Somewhere, Cebu');
    expect(addressPlace('Somewhere', 'Mountain Province')?.place).toBe(
      'Somewhere, Mountain Province',
    );
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

  it('reads a province written in the city box, and a city in the province box', () => {
    expect(addressPlace('Bohol', '')).toMatchObject({ place: 'Bohol', precision: 'province' });
    // Lahug is a barangay of Cebu City: the city is named, never the barangay.
    expect(addressPlace('Lahug', 'Cebu City')).toMatchObject({
      place: 'Cebu City, Cebu',
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
          place: `Nowhere, ${province}`,
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
