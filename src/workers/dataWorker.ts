import * as satellite from 'satellite.js';

export type WorkerMessage = 
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'TOGGLE' }
  | { type: 'SET_PRETEXT_MODE', payload: boolean }
  | { type: 'SET_VIEW_LOCATION', lat: number, lon: number };

export type DataEvent =
  | { type: 'FLIGHTS_UPDATED', data: any[] }
  | { type: 'SATELLITES_UPDATED', data: any[] }
  | { type: 'ORBITS_UPDATED', data: any[] }
  | { type: 'CITIES_UPDATED', data: any[] }
  | { type: 'SATELLITE_SWARM_UPDATED', payload: any[] };

let flightInterval: number | null = null;
let satelliteInterval: number | null = null;
let cityInterval: number | null = null;
let isRunning = false;
let allSatellites: any[] = [];

// History for trails
const flightHistory: Record<string, {lat: number, lon: number, alt: number}[]> = {};

// Hardcoded robust city/country data with real populations to guarantee requirements are met
const CITIES_DATA = [
  // South Korea Dense Data (Typography Map Effect)
  { id: 'city_kr_seoul', name: 'Seoul', country: 'South Korea', lat: 37.5665, lon: 126.9780, pop: 9700000 },
  { id: 'city_kr_busan', name: 'Busan', country: 'South Korea', lat: 35.1796, lon: 129.0756, pop: 3400000 },
  { id: 'city_kr_incheon', name: 'Incheon', country: 'South Korea', lat: 37.4563, lon: 126.7052, pop: 2900000 },
  { id: 'city_kr_daegu', name: 'Daegu', country: 'South Korea', lat: 35.8714, lon: 128.6014, pop: 2400000 },
  { id: 'city_kr_daejeon', name: 'Daejeon', country: 'South Korea', lat: 36.3504, lon: 127.3845, pop: 1500000 },
  { id: 'city_kr_gwangju', name: 'Gwangju', country: 'South Korea', lat: 35.1595, lon: 126.8526, pop: 1450000 },
  { id: 'city_kr_suwon', name: 'Suwon', country: 'South Korea', lat: 37.2636, lon: 127.0286, pop: 1200000 },
  { id: 'city_kr_ulsan', name: 'Ulsan', country: 'South Korea', lat: 35.5384, lon: 129.3114, pop: 1140000 },
  { id: 'city_kr_jeju', name: 'Jeju', country: 'South Korea', lat: 33.4996, lon: 126.5312, pop: 670000 },
  { id: 'city_kr_jeonju', name: 'Jeonju', country: 'South Korea', lat: 35.8242, lon: 127.1480, pop: 650000 },
  { id: 'city_kr_goyang', name: 'Goyang', country: 'South Korea', lat: 37.6584, lon: 126.8320, pop: 1000000 },
  { id: 'city_kr_yongin', name: 'Yongin', country: 'South Korea', lat: 37.2411, lon: 127.1776, pop: 1000000 },
  { id: 'city_kr_changwon', name: 'Changwon', country: 'South Korea', lat: 35.2280, lon: 128.6811, pop: 1040000 },
  // Japan Dense Data
  { id: 'city_jp_tokyo', name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503, pop: 13929286 },
  { id: 'city_jp_osaka', name: 'Osaka', country: 'Japan', lat: 34.6937, lon: 135.5023, pop: 2691000 },
  { id: 'city_jp_kyoto', name: 'Kyoto', country: 'Japan', lat: 35.0116, lon: 135.7681, pop: 1475000 },
  { id: 'city_jp_sapporo', name: 'Sapporo', country: 'Japan', lat: 43.0618, lon: 141.3545, pop: 1952000 },
  { id: 'city_jp_fukuoka', name: 'Fukuoka', country: 'Japan', lat: 33.5902, lon: 130.4017, pop: 1539000 },
  { id: 'city_jp_kobe', name: 'Kobe', country: 'Japan', lat: 34.6901, lon: 135.1955, pop: 1537000 },
  { id: 'city_jp_nagoya', name: 'Nagoya', country: 'Japan', lat: 35.1815, lon: 136.9066, pop: 2296000 },
  { id: 'city_jp_hiroshima', name: 'Hiroshima', country: 'Japan', lat: 34.3853, lon: 132.4553, pop: 1194000 },
  { id: 'city_jp_sendai', name: 'Sendai', country: 'Japan', lat: 38.2682, lon: 140.8694, pop: 1082000 },
  // Other World Cities
  { id: 'city_us_ny', name: 'New York', country: 'USA', lat: 40.7128, lon: -74.0060, pop: 8419000 },
  { id: 'city_us_la', name: 'Los Angeles', country: 'USA', lat: 34.0522, lon: -118.2437, pop: 3898000 },
  { id: 'city_uk_london', name: 'London', country: 'UK', lat: 51.5074, lon: -0.1278, pop: 8982000 },
  { id: 'city_fr_paris', name: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522, pop: 2148000 },
  { id: 'city_cn_beijing', name: 'Beijing', country: 'China', lat: 39.9042, lon: 116.4074, pop: 21540000 },
  { id: 'city_in_mumbai', name: 'Mumbai', country: 'India', lat: 19.0760, lon: 72.8777, pop: 20411000 },
  { id: 'city_au_sydney', name: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093, pop: 5312000 }
];

let globalCities: any[] = [];

async function fetchGlobalCities() {
  if (globalCities.length > 0) return globalCities;
  try {
    const res = await fetch('/global-cities.json');
    const data = await res.json();
    globalCities = data;
    return globalCities;
  } catch(e) {
    console.error('Failed to load global cities', e);
    return [];
  }
}

const processCities = async () => {
  const points = await fetchGlobalCities();
  if (points && points.length > 0) {
    postMessage({ type: 'CITIES_UPDATED', data: points });
  } else {
    // Fallback if fetch fails
    const fallback = CITIES_DATA.map(c => ({...c}));
    postMessage({ type: 'CITIES_UPDATED', data: fallback });
  }
};

const fetchFlights = async () => {
  if (!isRunning) return;
  try {
    const res = await fetch('/api/flights');
    if (!res.ok) throw new Error(`OpenSky fetch failed: ${res.status}`);
    const data = await res.json();
    
    const states = data.states.slice(0, 100);
    const flights = states.map((s: any) => {
      const id = `flight_${s[0]}`;
      const f = {
        id,
        callsign: s[1]?.trim() || 'UNKNOWN',
        lon: s[5],
        lat: s[6],
        alt: (s[7] || 10000) / 1000,
        velocity: (s[9] || 0) * 3.6,
        heading: s[10] || 0
      };
      
      if (!flightHistory[id]) flightHistory[id] = [];
      flightHistory[id].push({lat: f.lat, lon: f.lon, alt: f.alt});
      if (flightHistory[id].length > 5) flightHistory[id].shift();
      
      return { ...f, history: flightHistory[id] };
    }).filter((f: any) => f.lat !== null && f.lon !== null);

    postMessage({ type: 'FLIGHTS_UPDATED', data: flights });
  } catch (err) {
    const mockFlights = Array.from({length: 50}).map((_, i) => {
      const id = `flight_mock_${i}`;
      // Move mock flights to simulate real movement
      if (!flightHistory[id]) {
        flightHistory[id] = [];
        flightHistory[id].push({
          lat: (Math.random() - 0.5) * 160,
          lon: (Math.random() - 0.5) * 360,
          alt: 10 + Math.random() * 2
        });
      }
      const last = flightHistory[id][flightHistory[id].length - 1];
      const nextLat = last.lat + (Math.random() - 0.5) * 0.5;
      const nextLon = last.lon + (Math.random() - 0.5) * 0.5;
      
      flightHistory[id].push({ lat: nextLat, lon: nextLon, alt: last.alt });
      if (flightHistory[id].length > 5) flightHistory[id].shift();

      return {
        id,
        callsign: `MOCK-${100+i}`,
        lat: nextLat,
        lon: nextLon,
        alt: last.alt,
        velocity: 800 + Math.random() * 100,
        heading: 90,
        history: flightHistory[id]
      };
    });
    postMessage({ type: 'FLIGHTS_UPDATED', data: mockFlights });
  }
};

async function fetchCelesTrak() {
  try {
    const res = await fetch('/active.txt');
    const text = await res.text();
    const lines = text.split('\n');
    allSatellites = [];
    for (let i = 0; i < lines.length; i += 3) {
      if (lines[i] && lines[i+1] && lines[i+2]) {
         const name = lines[i].trim();
         const tle1 = lines[i+1].trim();
         const tle2 = lines[i+2].trim();
         if (!tle1.startsWith('1 ') || !tle2.startsWith('2 ')) continue;
         const satrec = satellite.twoline2satrec(tle1, tle2);
         if (satrec) {
            (satrec as any).name = name;
            let type = 'payload';
            if (name.includes('DEB')) type = 'debris';
            else if (name.includes('R/B')) type = 'rocket';
            else if (name.includes('STARLINK')) type = 'starlink';
            (satrec as any).type = type;
            allSatellites.push(satrec);
         }
      }
    }
    allSatellites = allSatellites.slice(0, 4000);
  } catch(e) {
    console.warn("[Worker] Failed to fetch CelesTrak", e);
  }
}

let mockSatellites: any[] = [];

async function fetchSatellites() {
  if (allSatellites.length === 0) {
    if (mockSatellites.length === 0) {
       for(let i=0; i<3000; i++) {
          mockSatellites.push({
            id: `sat_mock_${i}`,
            name: `MOCK-${i}`,
            type: i % 10 === 0 ? 'starlink' : i % 3 === 0 ? 'debris' : 'payload',
            lat: (Math.random() - 0.5) * 180,
            lon: (Math.random() - 0.5) * 360,
            alt: 400 + Math.random() * 800,
            speedLat: (Math.random() - 0.5) * 1.5,
            speedLon: (Math.random() - 0.5) * 1.5
          });
       }
    }
    const results = mockSatellites.map(sat => {
       sat.lat += sat.speedLat;
       sat.lon += sat.speedLon;
       if (sat.lat > 90 || sat.lat < -90) sat.speedLat *= -1;
       if (sat.lon > 180) sat.lon -= 360;
       if (sat.lon < -180) sat.lon += 360;
       return {
         id: sat.id,
         name: sat.name,
         type: sat.type,
         lat: sat.lat,
         lon: sat.lon,
         alt: sat.alt
       };
    });
    postMessage({ type: 'SATELLITE_SWARM_UPDATED', data: results });
    return;
  }

  const now = new Date();
  const gmst = satellite.gstime(now);
  const results = [];
  for (const sat of allSatellites) {
    const positionAndVelocity = satellite.propagate(sat, now);
    const positionEci = positionAndVelocity.position as any;
    if (positionEci && typeof positionEci.x === 'number') {
      const positionGd = satellite.eciToGeodetic(positionEci, gmst);
      results.push({
        id: `sat_${(sat as any).name}`,
        name: (sat as any).name,
        type: (sat as any).type,
        lat: satellite.degreesLat(positionGd.latitude),
        lon: satellite.degreesLong(positionGd.longitude),
        alt: positionGd.height
      });
    }
  }
  postMessage({ type: 'SATELLITE_SWARM_UPDATED', data: results });
}

const handleMessage = (type: string, payload?: any) => {
  switch (type) {
    case 'SET_PRETEXT_MODE':
      processCities();
      break;
    case 'GET_ORBIT': {
      const satName = payload;
      const sat = allSatellites.find((s: any) => s.name === satName);
      if (sat) {
        // Calculate orbit for the next 100 minutes (approx 1 orbit for LEO)
        const orbitPoints = [];
        const now = new Date();
        for (let i = 0; i <= 100; i++) {
          const t = new Date(now.getTime() + i * 60000);
          const posVel = satellite.propagate(sat, t);
          const posEci = posVel.position as any;
          if (posEci && typeof posEci.x === 'number') {
            const posGd = satellite.eciToGeodetic(posEci, satellite.gstime(t));
            orbitPoints.push({
              lat: satellite.degreesLat(posGd.latitude),
              lon: satellite.degreesLong(posGd.longitude),
              alt: posGd.height
            });
          }
        }
        postMessage({ type: 'ORBIT_READY', data: orbitPoints });
      }
      break;
    }
    case 'START':
      if (!isRunning) {
        isRunning = true;
        fetchFlights();
        flightInterval = setInterval(fetchFlights, 10000) as any;
        processCities();
        cityInterval = setInterval(processCities, 60000) as any;
        fetchCelesTrak().then(() => {
          fetchSatellites();
          satelliteInterval = setInterval(fetchSatellites, 1000) as any;
        });
      }
      break;
    case 'TOGGLE':
      if (isRunning) {
        isRunning = false;
        if (flightInterval) clearInterval(flightInterval);
        if (cityInterval) clearInterval(cityInterval);
        if (satelliteInterval) clearInterval(satelliteInterval);
      } else {
        isRunning = true;
        fetchFlights();
        flightInterval = setInterval(fetchFlights, 10000) as any;
        processCities();
        cityInterval = setInterval(processCities, 60000) as any;
        fetchCelesTrak().then(() => {
          fetchSatellites();
          satelliteInterval = setInterval(fetchSatellites, 1000) as any;
        });
      }
      break;
  }
};

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  handleMessage(e.data.type, (e.data as any).payload);
};
