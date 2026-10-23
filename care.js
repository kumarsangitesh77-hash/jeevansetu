import config from '../config.js';
import { canonicalize } from '../lib/text.js';
import directory from '../data/hospitals.json' with { type: 'json' };
import emergencyData from '../data/emergency-contacts.json' with { type: 'json' };
import { searchNearbyHospitals, reverseGeocode } from './googleMaps.js';

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// Facility types that make sense for each triage level. An emergency should never
// be routed to a telemedicine kiosk; a routine query should not consume a trauma bed.
const LEVEL_PREFERENCE = {
  emergency: ['trauma', 'tertiary', 'speciality', 'emergency'],
  urgent: ['urgent_care', 'speciality', 'emergency', 'tertiary'],
  routine: ['clinic', 'phc', 'telemedicine', 'urgent_care']
};

// Maps a red-flag clinical group to the capability that can actually treat it.
// Ranking on this is what makes "nearest" useful rather than merely nearest.
const GROUP_CAPABILITY = {
  cardiac: { specialties: ['cardiology'], services: ['cath lab', 'ccu'] },
  neuro: { specialties: ['neurology'], services: ['ct scan', 'icu'] },
  respiratory: { specialties: ['emergency & general medicine'], services: ['ventilator', 'icu', 'nebulisation'] },
  airway: { specialties: ['emergency & general medicine'], services: ['emergency ward', 'minor ot'] },
  trauma: { specialties: ['trauma surgery', 'burns', 'orthopaedics', 'plastic surgery'], services: ['trauma bay', 'burns ward', 'ot'] },
  circulatory: { specialties: ['emergency & general medicine'], services: ['icu', 'blood bank'] },
  gi: { specialties: ['emergency & general medicine'], services: ['icu', 'iv fluids'] },
  renal: { specialties: ['emergency & general medicine'], services: ['icu', 'lab'] },
  infection: { specialties: ['emergency & general medicine', 'public health'], services: ['icu', 'lab'] },
  allergy: { specialties: ['emergency & general medicine'], services: ['emergency ward', 'icu'] },
  toxicology: { specialties: ['emergency & general medicine'], services: ['icu', 'blood bank'] },
  obstetric: { specialties: ['obstetrics', 'gynaecology', 'neonatology'], services: ['labour room', 'nicu', 'sncu'] },
  pediatric: { specialties: ['paediatrics', 'neonatology'], services: ['picu', 'nicu', 'paediatric emergency'] },
  vitals: { specialties: ['emergency & general medicine'], services: ['icu', 'emergency ward'] },
  mental: { specialties: ['psychiatry', 'crisis intervention'], services: ['crisis helpline desk', 'counselling'] }
};

// A self-harm crisis routes to mental-health capability, not a trauma bay.
const CRISIS_CAPABILITY = GROUP_CAPABILITY.mental;

const normalizeList = (list) => (list || []).map(s => canonicalize(String(s)));

function matchesCapability(capability, specialties, services) {
  let specialtyMatch = false;
  let serviceMatch = false;
  for (const want of capability.specialties) {
    if (specialties.some(s => s.includes(want) || want.includes(s))) specialtyMatch = true;
  }
  for (const want of capability.services) {
    if (services.some(s => s.includes(want) || want.includes(s))) serviceMatch = true;
  }
  return { specialtyMatch, serviceMatch };
}

function decorate(facility, lat, lng, geoProvided, ranking) {
  const distanceKm = haversineKm(lat, lng, facility.lat, facility.lng);
  const specialties = normalizeList(facility.specialties);
  const services = normalizeList(facility.services);

  // Distance is the dominant term: inside a city, extra kilometres of travel matter
  // more than a facility being a marginally better type match.
  let score = Math.max(0, distanceKm);

  const prefs = LEVEL_PREFERENCE[ranking.level] || LEVEL_PREFERENCE.routine;
  const typeRank = prefs.indexOf(facility.type);
  score += typeRank === -1 ? prefs.length * 1.5 : typeRank * 1.5;

  let matchedCapability = false;

  if (ranking.level !== 'routine') {
    if (facility.open24x7) score -= 8;
    if (ranking.level === 'emergency' && facility.emergency) score -= 10;

    const capabilities = ranking.crisis
      ? [CRISIS_CAPABILITY]
      : ranking.groups.map(g => GROUP_CAPABILITY[g]).filter(Boolean);

    for (const capability of capabilities) {
      const { specialtyMatch, serviceMatch } = matchesCapability(capability, specialties, services);
      if (specialtyMatch) { score -= 12; matchedCapability = true; }
      if (serviceMatch) { score -= 6; matchedCapability = true; }
    }
  }

  return {
    id: facility.id,
    name: facility.name,
    type: facility.type,
    address: facility.address,
    distance: formatDistance(distanceKm),
    distanceKm: Number(distanceKm.toFixed(2)),
    distanceApproximate: !geoProvided,
    lat: facility.lat,
    lng: facility.lng,
    phone: facility.phone,
    ambulancePhone: facility.ambulancePhone,
    emergency: facility.emergency,
    open24x7: facility.open24x7,
    hours: facility.hours || '24x7',
    specialty: (facility.specialties || []).join(' and '),
    specialties: facility.specialties || [],
    services: facility.services || [],
    beds: facility.beds,
    insurance: facility.insurance || [],
    languages: facility.languages || [],
    demoOccupancyPct: facility.demoOccupancyPct,
    demoAvgWaitMinutes: facility.demoAvgWaitMinutes,
    suitableForLevel: ranking.level,
    matchedCapability,
    mapsUrl: `https://www.openstreetmap.org/directions?to=${facility.lat},${facility.lng}`,
    isDemoData: true,
    _score: score
  };
}

/**
 * @param {object} query
 * @param {number} [query.lat]
 * @param {number} [query.lng]
 * @param {'routine'|'urgent'|'emergency'} [query.level]
 * @param {boolean} [query.emergencyOnly]
 * @param {boolean} [query.crisis]    route to mental-health capability
 * @param {string[]} [query.groups]   triage flag groups, e.g. ['cardiac']
 * @param {string} [query.specialty]
 * @param {string} [query.service]
 * @param {string} [query.q]          free-text search over name/address/specialty
 * @param {number} [query.radiusKm]
 * @param {number} [query.limit]
 * @param {string[]} [query.types]
 * @param {boolean} [query.useRealData]  use Google Places instead of synthetic data
 */
export async function findCareOptions(query = {}) {
  const level = ['routine', 'urgent', 'emergency'].includes(query.level) ? query.level : 'routine';
  const crisis = query.crisis === true || query.crisis === 'true';
  const groups = Array.isArray(query.groups)
    ? query.groups.filter(g => typeof g === 'string').map(g => canonicalize(g)).slice(0, 12)
    : [];

  const geoProvided = Number.isFinite(query.lat) && Number.isFinite(query.lng);
  const lat = geoProvided ? query.lat : config.geo.defaultLat;
  const lng = geoProvided ? query.lng : config.geo.defaultLng;

  const specialty = canonicalize(query.specialty || '');
  const service = canonicalize(query.service || '');
  const q = canonicalize(query.q || '');
  const radiusKm = Number.isFinite(query.radiusKm) ? query.radiusKm : config.geo.defaultRadiusKm;
  const types = Array.isArray(query.types) && query.types.length ? query.types : null;
  const useRealData = query.useRealData === true && config.googleMaps.enabled && geoProvided;

  // If using real Google Places data
  if (useRealData) {
    try {
      const ranking = { level, groups, crisis };
      
      // Get real hospitals from Google Places
      let facilities = await searchNearbyHospitals(lat, lng, radiusKm);
      
      // Decorate with scoring for ranking
      facilities = facilities.map(f => decorate(f, lat, lng, true, ranking));
      
      // Apply filters
      if (query.emergencyOnly === true || query.emergencyOnly === 'true' || level === 'emergency') {
        facilities = facilities.filter(f => f.type === 'Hospital');
      }
      if (types) facilities = facilities.filter(f => types.includes(f.type));
      if (specialty) {
        facilities = facilities.filter(f =>
          f.specialties.some(s => canonicalize(s).includes(specialty))
        );
      }
      if (service) {
        facilities = facilities.filter(f =>
          f.services.some(s => canonicalize(s).includes(service))
        );
      }
      if (q) {
        facilities = facilities.filter(f => {
          const haystack = canonicalize(`${f.name} ${f.address} ${f.specialty} ${f.services.join(' ')}`);
          return haystack.includes(q);
        });
      }
      
      facilities.sort((a, b) => a._score - b._score);
      
      const limit = Math.min(Math.max(Number.isFinite(query.limit) ? query.limit : 6, 1), 50);
      const results = facilities.slice(0, limit).map(({ _score, ...rest }) => rest);
      
      // Try to get address via reverse geocoding
      let userAddress = null;
      try {
        userAddress = await reverseGeocode(lat, lng);
      } catch (e) {
        // Silently fail on geocoding
      }
      
      return {
        level,
        crisis,
        rankedByGroups: groups,
        count: results.length,
        totalAvailable: facilities.length,
        origin: {
          lat,
          lng,
          source: 'client_gps',
          address: userAddress,
          radiusKm
        },
        isDemoData: false,
        note: 'Real-time facility data from Google Places API',
        results
      };
    } catch (error) {
      console.warn('Google Places integration failed, falling back to synthetic data:', error.message);
      // Fall through to synthetic data below
    }
  }

  // Synthetic demo data fallback
  const ranking = { level, groups, crisis };
  let facilities = directory.facilities.map(f => decorate(f, lat, lng, geoProvided, ranking));

  if (query.emergencyOnly === true || query.emergencyOnly === 'true' || level === 'emergency') {
    facilities = facilities.filter(f => f.emergency === true);
  }
  if (types) facilities = facilities.filter(f => types.includes(f.type));
  if (specialty) {
    facilities = facilities.filter(f =>
      f.specialties.some(s => canonicalize(s).includes(specialty))
    );
  }
  if (service) {
    facilities = facilities.filter(f =>
      f.services.some(s => canonicalize(s).includes(service))
    );
  }
  if (q) {
    facilities = facilities.filter(f => {
      const haystack = canonicalize(`${f.name} ${f.address} ${f.specialty} ${f.services.join(' ')}`);
      return haystack.includes(q);
    });
  }

  // Only apply the radius cut when real coordinates were supplied; otherwise every
  // distance is measured from a default city centre and filtering would mislead.
  if (geoProvided && Number.isFinite(radiusKm)) {
    facilities = facilities.filter(f => f.distanceKm <= radiusKm);
  }

  facilities.sort((a, b) => a._score - b._score);

  const limit = Math.min(
    Math.max(Number.isFinite(query.limit) ? query.limit : 6, 1),
    directory.facilities.length
  );
  const results = facilities.slice(0, limit).map(({ _score, ...rest }) => rest);

  return {
    level,
    crisis,
    rankedByGroups: groups,
    count: results.length,
    totalAvailable: facilities.length,
    origin: {
      lat,
      lng,
      source: geoProvided ? 'client' : 'default',
      city: geoProvided ? null : config.geo.defaultCity,
      radiusKm: geoProvided ? radiusKm : null
    },
    isDemoData: true,
    note: directory._comment,
    results
  };
}

export function getFacilityById(id) {
  const facility = directory.facilities.find(f => f.id === id);
  if (!facility) return null;
  const decorated = decorate(facility, config.geo.defaultLat, config.geo.defaultLng, false, {
    level: 'routine',
    groups: [],
    crisis: false
  });
  const { _score, ...rest } = decorated;
  return rest;
}

export function getEmergencyContacts(language = 'en', category = null) {
  const lang = ['en', 'hi', 'hinglish'].includes(language) ? language : 'en';
  const nameKey = lang === 'hi' ? 'nameHi' : lang === 'hinglish' ? 'nameHinglish' : 'name';

  let contacts = emergencyData.contacts || [];
  if (category) contacts = contacts.filter(c => c.category === category);

  return {
    contacts: [...contacts]
      .sort((a, b) => a.priority - b.priority)
      .map(c => ({
        id: c.id,
        number: c.number,
        name: c[nameKey] || c.name,
        nameEn: c.name,
        purpose: c.purpose,
        category: c.category,
        languages: c.languages,
        available: c.available,
        telUri: `tel:${c.number}`,
        isDemoData: false
      })),
    whatToSay: emergencyData.whatToSay[lang] || emergencyData.whatToSay.en,
    disclaimer: emergencyData.disclaimer,
    verifiedAsOf: emergencyData.verifiedAsOf
  };
}

export default { findCareOptions, getFacilityById, getEmergencyContacts, haversineKm };
