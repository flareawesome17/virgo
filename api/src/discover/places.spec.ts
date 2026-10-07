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
      place: 'Mandaue',
      latitude: 10.3237,
      longitude: 123.9227,
    });
    expect(addressPlace('Makati City', 'Metro Manila')?.place).toBe('Makati');
  });

  it('takes the "City of" prefix off', () => {
    expect(addressPlace('City of Naga', 'Camarines Sur')?.place).toBe('Naga');
  });

  it('reads the province before trusting a town name two places share', () => {
    // The City of Naga in Cebu is not Naga in Bicol, 400 km away.
    expect(addressPlace('City of Naga', 'Cebu')).toEqual({
      place: 'Cebu',
      latitude: 10.3157,
      longitude: 123.8854,
    });
    expect(addressPlace('San Juan', 'Batangas')?.place).toBe('Batangas');
    expect(addressPlace('San Juan', 'NCR')?.place).toBe('San Juan');
  });

  it('folds case and goes through the aliases', () => {
    expect(addressPlace('cebu', 'cebu')?.place).toBe('Cebu City');
    expect(addressPlace('  CDO ', 'Misamis Oriental')?.place).toBe('Cagayan de Oro');
    expect(addressPlace('paranaque', 'metro manila')?.place).toBe('Parañaque');
  });

  it('finds a table entry that carries its province', () => {
    expect(addressPlace('Talisay', 'Cebu')?.place).toBe('Talisay, Cebu');
    expect(addressPlace('Talisay City', 'Cebu')?.place).toBe('Talisay, Cebu');
    expect(addressPlace('San Fernando', 'Pampanga')?.place).toBe('San Fernando, Pampanga');
  });

  it('falls back to the province for a municipality it does not know', () => {
    expect(addressPlace('Plaridel', 'Misamis Occidental')).toEqual({
      place: 'Misamis Occidental',
      latitude: 8.4859,
      longitude: 123.8048,
    });
    expect(addressPlace('Plaridel', 'Bulacan')?.place).toBe('Bulacan');
  });

  it('does not add "City" to a municipality', () => {
    // Quezon, Bukidnon is not Quezon City.
    expect(addressPlace('Quezon', 'Bukidnon')?.place).toBe('Bukidnon');
    expect(addressPlace('Quezon', '')?.place).toBe('Quezon');
  });

  it('understands the other names a province goes by', () => {
    expect(addressPlace('Somewhere', 'NCR')?.place).toBe('Metro Manila');
    expect(addressPlace('Somewhere', 'National Capital Region')?.place).toBe('Metro Manila');
    expect(addressPlace('Somewhere', 'Province of Cebu')?.place).toBe('Cebu');
    expect(addressPlace('Somewhere', 'Cebu Province')?.place).toBe('Cebu');
    expect(addressPlace('Somewhere', 'Mountain Province')?.place).toBe('Mountain Province');
    expect(addressPlace('Nabunturan', 'Compostela Valley')?.place).toBe('Davao de Oro');
  });

  it('reads a province written in the city box, and a city in the province box', () => {
    expect(addressPlace('Bohol', '')?.place).toBe('Bohol');
    expect(addressPlace('Lahug', 'Cebu City')?.place).toBe('Cebu City');
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
        expect(addressPlace('Nowhere in particular', province)?.place).toBe(province);
      }
    }
  });

  it('keeps every coordinate inside the country', () => {
    for (const city of CITY_NAMES) {
      for (const province of provincesOfCity(city)) {
        const at = addressPlace(city, province);
        expect(at).not.toBeNull();
        expect(at!.place).toBe(city);
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
