import config from '../config.js';

const GOOGLE_PLACES_API = 'https://places.googleapis.com/v1/places:searchNearby';
const GOOGLE_GEOCODING_API = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Search for nearby medical facilities using Google Places API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusKm - Search radius in kilometers (max 50km for Google Places)
 * @returns {Promise<Array>} Array of facility objects
 */
export async function searchNearbyHospitals(lat, lng, radiusKm = 10) {
  if (!config.googleMaps.enabled || !config.googleMaps.apiKey) {
    throw new Error('Google Maps API not configured');
  }

  // Google Places API has a max radius of 50000 meters (50km)
  const radiusMeters = Math.min(radiusKm * 1000, 50000);

  try {
    const response = await fetch(GOOGLE_PLACES_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.googleMaps.apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.location,places.types,places.rating,places.userRatingCount,places.formattedAddress,places.businessStatus'
      },
      body: JSON.stringify({
        includedTypes: ['hospital', 'doctor', 'pharmacy', 'health'],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: {
              latitude: lat,
              longitude: lng
            },
            radius: radiusMeters
          }
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Google Places API error: ${response.status} ${errorData.error?.message || ''}`);
    }

    const data = await response.json();
    const places = data.places || [];

    return places.map((place, index) => ({
      id: `google_${index}`,
      name: place.displayName?.text || 'Unknown Facility',
      type: mapPlaceType(place.types || []),
      lat: place.location?.latitude || 0,
      lng: place.location?.longitude || 0,
      address: place.formattedAddress || '',
      rating: place.rating || null,
      reviewCount: place.userRatingCount || 0,
      status: place.businessStatus || 'OPERATIONAL',
      distance: calculateDistance(lat, lng, place.location?.latitude, place.location?.longitude),
      isReal: true
    }));
  } catch (error) {
    console.error('Google Places search failed:', error.message);
    throw error;
  }
}

/**
 * Reverse geocode coordinates to human-readable address
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string>} Formatted address
 */
export async function reverseGeocode(lat, lng) {
  if (!config.googleMaps.enabled || !config.googleMaps.apiKey) {
    throw new Error('Google Maps API not configured');
  }

  try {
    const url = `${GOOGLE_GEOCODING_API}?latlng=${lat},${lng}&key=${config.googleMaps.apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      throw new Error(`Geocoding failed: ${data.status}`);
    }

    return data.results[0].formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (error) {
    console.error('Reverse geocoding failed:', error.message);
    throw error;
  }
}

/**
 * Map Google Places types to app facility types
 * @param {Array<string>} types - Google Places types
 * @returns {string} Mapped type
 */
function mapPlaceType(types) {
  if (types.includes('hospital')) return 'Hospital';
  if (types.includes('doctor')) return 'Clinic';
  if (types.includes('pharmacy')) return 'Pharmacy';
  if (types.includes('health')) return 'Health Center';
  return 'Medical Facility';
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  if (!lat2 || !lng2) return null;

  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Round to 1 decimal
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}
