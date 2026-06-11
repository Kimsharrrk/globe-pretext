import './style.css';
import { GlobeApp } from './components/Globe';
import { TextLayer } from './components/TextLayer';
import type { TextData } from './components/TextLayer';
import { latLonToVector3 } from './utils/coordinates';
import * as THREE from 'three';

document.addEventListener('DOMContentLoaded', () => {
  try {
    const globeApp = new GlobeApp('globe-container');
    const textLayer = new TextLayer('text-overlay', globeApp.camera, document.getElementById('globe-container')!);
    
    console.log('Globe and TextLayer initialized successfully');

    // State for TextLayer
    let activeTextData: TextData[] = [];

    // Setup Web Worker
    const worker = new Worker(new URL('./workers/dataWorker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      const { type, data } = e.data;
      
      if (type === 'FLIGHTS_UPDATED') {
        let flightTextData: TextData[] = [];
        for (const f of data) {
           flightTextData.push({
             id: f.id,
             position: latLonToVector3(f.lat, f.lon, 100 + (f.alt / 63.71)),
             text: `✈ ${f.callsign}\nSpd: ${Math.round(f.velocity)}km/h`,
             color: '#ffff00',
             fontSize: 10
           });
           
           if (f.history) {
             for (let i = 0; i < f.history.length; i++) {
                const hist = f.history[i];
                const alpha = ((i + 1) / (f.history.length + 1)).toFixed(2);
                flightTextData.push({
                  id: `${f.id}_trail_${i}`,
                  position: latLonToVector3(hist.lat, hist.lon, 100 + (hist.alt / 63.71)),
                  text: '•', 
                  color: `rgba(255, 255, 0, ${alpha})`,
                  fontSize: 10
                });
             }
           }
        }
        
        activeTextData = [...activeTextData.filter(d => !d.id.startsWith('flight_')), ...flightTextData];
        globeApp.addFlightPaths(data);
      }
      
      if (type === 'SATELLITE_SWARM_UPDATED') {
        globeApp.updateSatelliteSwarm(data);
        
        const topSats = data.filter((s: any) => s.type === 'payload').slice(0, 20);
        const satTextData: TextData[] = topSats.map((s: any) => ({
          id: `sat_${s.name}`,
          lat: s.lat,
          lon: s.lon,
          position: latLonToVector3(s.lat, s.lon, 100 + (s.alt / 63.71)),
          text: `🛰 ${s.name}`,
          color: '#00ccff',
          fontSize: 9
        }));
        
        activeTextData = [...activeTextData.filter(d => !d.id.startsWith('sat_')), ...satTextData];
        if ((window as any).showSatBeams !== false) {
          globeApp.updateSatellitesBeams(topSats);
        } else {
          globeApp.updateSatellitesBeams([]);
        }
      }

      if (type === 'ORBITS_UPDATED') {
        globeApp.addOrbits(data);
      }

      if (type === 'ORBIT_READY') {
        const orbitVectors = data.map((p: any) => latLonToVector3(p.lat, p.lon, 100 + (p.alt / 63.71)));
        globeApp.drawSelectedSatelliteOrbit(orbitVectors);
      }

      if (type === 'CITIES_UPDATED') {
        (window as any).currentCityData = data;
        if ((window as any).showNetworks !== false) {
          globeApp.drawNetworkArcs(data);
        } else {
          globeApp.drawNetworkArcs([]);
        }
        if ((window as any).showSpikes) {
          globeApp.updatePopulationSpikes(data, true);
        } else {
          globeApp.updatePopulationSpikes([], false);
        }
        
        const cityTextData: TextData[] = data.map((c: any) => {
          const logPop = Math.log10(c.pop || 50000);
          const size = Math.max(8, Math.pow(Math.max(0, logPop - 4.5), 1.5) * 6);
          const color = size > 16 ? '#00ffff' : size > 12 ? '#aaffaa' : '#aaaaaa';
          
          return {
            id: `city_${c.name}`,
            lat: c.lat,
            lon: c.lon,
            position: latLonToVector3(c.lat, c.lon, 100.1),
            text: c.name, 
            color: color,
            fontSize: size
          };
        });
        
        activeTextData = [...activeTextData.filter(d => !d.id.startsWith('city_')), ...cityTextData];

        // Store raw data globally so the popup UI can access weather, news, etc.
        (window as any).cityDetails = data;
      }
    };

    worker.postMessage({ type: 'START' });

    // Dashboard UI Toggles
    const layerPretext = document.getElementById('layer-pretext') as HTMLInputElement;
    const layer3dSpikes = document.getElementById('layer-3d-spikes') as HTMLInputElement;
    const layerNetworks = document.getElementById('layer-networks') as HTMLInputElement;
    const layerPause = document.getElementById('layer-pause') as HTMLInputElement;

    let isPretextMode = false;
    (window as any).showNetworks = true;
    (window as any).showSatBeams = true;
    (window as any).showSpikes = false;

    if (layerPretext) {
      layerPretext.addEventListener('change', (e) => {
        isPretextMode = (e.target as HTMLInputElement).checked;
        globeApp.setPretextMode(isPretextMode);
        worker.postMessage({ type: 'SET_PRETEXT_MODE', payload: isPretextMode });
      });
    }

    if (layer3dSpikes) {
      layer3dSpikes.addEventListener('change', (e) => {
        (window as any).showSpikes = (e.target as HTMLInputElement).checked;
        const cities = (window as any).currentCityData || [];
        globeApp.updatePopulationSpikes(cities, (window as any).showSpikes);
        globeApp.tiltForSpikes((window as any).showSpikes);
      });
    }

    if (layerNetworks) {
      layerNetworks.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        (window as any).showNetworks = checked;
        (window as any).showSatBeams = checked;
        
        if (checked) {
          const cities = (window as any).currentCityData || [];
          globeApp.drawNetworkArcs(cities);
        } else {
          globeApp.drawNetworkArcs([]);
          globeApp.updateSatellitesBeams([]);
        }
      });
    }

    if (layerPause) {
      layerPause.addEventListener('change', () => {
        worker.postMessage({ type: 'TOGGLE' });
      });
    }

    const flyToSelect = document.getElementById('fly-to-select') as HTMLSelectElement;
    if (flyToSelect) {
      flyToSelect.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value;
        if (val) {
          const [lat, lon] = val.split(',').map(Number);
          globeApp.flyTo(lat, lon);
          // Reset selection so user can re-click
          setTimeout(() => flyToSelect.value = '', 500);
        }
      });
    }

    const layerSnapping = document.getElementById('layer-snapping') as HTMLInputElement;
    const layerUnroll = document.getElementById('layer-unroll') as HTMLInputElement;
    const layerSatellites = document.getElementById('layer-satellites') as HTMLInputElement;
    const crosshair = document.getElementById('crosshair');

    let isSnappingEnabled = false;

    if (layerSnapping) {
      layerSnapping.addEventListener('change', (e) => {
        isSnappingEnabled = (e.target as HTMLInputElement).checked;
        if (crosshair) crosshair.style.display = isSnappingEnabled ? 'block' : 'none';
      });
    }

    if (layerUnroll) {
      layerUnroll.addEventListener('change', (e) => {
        const isUnrolled = (e.target as HTMLInputElement).checked;
        if (globeApp.unrollMap) {
          globeApp.unrollMap(isUnrolled);
        }
      });
    }

    if (layerSatellites) {
      layerSatellites.addEventListener('change', (e) => {
        const isSatsOn = (e.target as HTMLInputElement).checked;
        if (globeApp.toggleSatellites) {
          globeApp.toggleSatellites(isSatsOn);
        }
      });
    }

    // Magnetic Snapping Logic
    let snapTimeout: any;
    globeApp.controls.addEventListener('change', () => {
      if (!isSnappingEnabled) return;
      
      clearTimeout(snapTimeout);
      snapTimeout = setTimeout(() => {
        const centerRay = new THREE.Raycaster();
        centerRay.setFromCamera(new THREE.Vector2(0, 0), globeApp.camera);
        if (globeApp.earthMesh) {
          const intersects = centerRay.intersectObject(globeApp.earthMesh);
        if (intersects.length > 0) {
           const point = intersects[0].point;
           // Convert 3D point to lat/lon (assuming radius 100)
           const lat = 90 - (Math.acos(point.y / 100)) * (180 / Math.PI);
           let lon = ((270 + (Math.atan2(point.x, point.z) * (180 / Math.PI))) % 360) - 180;
           
           const cities = (window as any).currentCityData || [];
           let nearestCity = null;
           let minDist = 5; // Snap threshold (~500km)
           
           for (const c of cities) {
             // Simple euclidean distance on lat/lon for fast snapping
             const dist = Math.sqrt(Math.pow(c.lat - lat, 2) + Math.pow(c.lon - lon, 2));
             if (dist < minDist) {
               minDist = dist;
               nearestCity = c;
             }
           }

           if (nearestCity) {
             globeApp.flyTo(nearestCity.lat, nearestCity.lon);
             // Make crosshair pulse
             if (crosshair) {
               crosshair.style.borderColor = '#00ff00';
               crosshair.style.boxShadow = '0 0 20px #00ff00';
               setTimeout(() => {
                 crosshair.style.borderColor = 'rgba(255,255,255,0.5)';
                 crosshair.style.boxShadow = '0 0 10px rgba(0,255,255,0.5)';
               }, 1000);
             }
           }
         }
        }
      }, 500); // 300ms after user stops dragging
    });

    // UI Interaction
    const infoPanel = document.getElementById('info-panel');
    const infoTitle = document.getElementById('info-title');
    const infoSubtitle = document.getElementById('info-subtitle');
    const infoDesc = document.getElementById('info-desc');
    const infoClose = document.getElementById('info-close');

    if (infoClose && infoPanel) {
      infoClose.addEventListener('click', () => {
        infoPanel.style.display = 'none';
        globeApp.drawSelectedSatelliteOrbit([]); // Clear orbit line
      });
    }

    // Global Click Handler for Interactions
    globeApp.renderer.domElement.addEventListener('pointerdown', (e) => {
      // Don't trigger if user is just clicking on UI
      if ((e.target as HTMLElement).closest('#ui-layer')) return;

      const result = globeApp.handleGlobalClick(e.clientX, e.clientY);
      
      if (result && infoPanel && infoTitle && infoSubtitle && infoDesc) {
        if (result.type === 'satellite') {
          const s = result.data;
          infoPanel.style.display = 'block';
          infoTitle.textContent = s.name;
          infoSubtitle.textContent = s.type === 'payload' ? 'ACTIVE SATELLITE' : 'SPACE DEBRIS/ROCKET';
          
          infoDesc.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
              <div style="color: #888;">ID</div><div style="text-align: right;">${s.id}</div>
              <div style="color: #888;">Altitude</div><div style="text-align: right;">${Math.round(s.alt)} km</div>
              <div style="color: #888;">Lat / Lon</div><div style="text-align: right;">${s.lat.toFixed(2)}° / ${s.lon.toFixed(2)}°</div>
            </div>
            <div style="margin-top: 15px; color: #00ffff; font-size: 12px; cursor: pointer;">
              ▶ Orbit Tracking Active
            </div>
          `;

          // Ask worker for orbit line projection
          worker.postMessage({ type: 'GET_ORBIT', payload: s.name });

        } else if (result.type === 'city') {
          const c = result.data;
          infoPanel.style.display = 'block';
          infoTitle.textContent = c.name;
          infoSubtitle.textContent = c.country || 'Global City';
          
          infoDesc.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
              <div style="color: #888;">Population</div><div style="text-align: right;">${(c.pop || 0).toLocaleString()}</div>
              <div style="color: #888;">Local Time</div><div style="text-align: right;">${c.time || 'N/A'}</div>
              <div style="color: #888;">Weather</div><div style="text-align: right;">${c.weather || 'N/A'}</div>
            </div>
            <div style="margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px;">
              <strong style="color: #ffaa00;">Latest News:</strong><br>
              ${c.news || 'No active headlines'}
            </div>
          `;
          globeApp.drawSelectedSatelliteOrbit([]); // Clear orbit if a city is clicked
        }
      } else {
        // Clicked empty space
        if (infoPanel) infoPanel.style.display = 'none';
        globeApp.drawSelectedSatelliteOrbit([]);
      }
    });
    
    const overlay = document.getElementById('text-overlay') as HTMLCanvasElement;
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        const rect = overlay.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const hit = textLayer.getHitData(clickX, clickY, activeTextData);
        
        if (hit && infoPanel && infoTitle && infoDesc && infoSubtitle) {
          infoTitle.innerText = hit.text.split('\n')[0].replace('📍', '').replace('✈', '').replace('🛰', '').trim();
          
          if (hit.id.startsWith('city_')) {
            const rawCity = (window as any).cityDetails?.find((c: any) => c.id === hit.id);
            if (rawCity) {
              infoSubtitle.innerText = `${rawCity.country} | Pop: ${(rawCity.pop / 1000000).toFixed(1)}M`;
              infoDesc.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                  <span><strong>Time:</strong> ${rawCity.time}</span>
                  <span><strong>Weather:</strong> ${rawCity.weather}</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px;">
                  <strong>Latest News</strong><br/>
                  ${rawCity.news}
                </div>
                <div style="margin-top: 10px; color: #00ffff; font-weight: bold;">
                  Trending: #Tech #AI #Global
                </div>
              `;
            }
          } else if (hit.id.startsWith('flight_')) {
            infoSubtitle.innerText = 'Flight Information';
            infoDesc.innerHTML = `Velocity: ${hit.text.split('Spd: ')[1]}`;
          } else if (hit.id.startsWith('sat_')) {
            infoSubtitle.innerText = 'Satellite Info';
            infoDesc.innerHTML = `Status: Active<br/>Orbit: LEO (Low Earth Orbit)`;
          }
          
          infoPanel.style.display = 'block';
          infoPanel.style.opacity = '1';
        } else if (infoPanel) {
          infoPanel.style.display = 'none';
        }
      });
    }

    globeApp.onRender = () => {
      // Pass the live data from worker to the TextLayer
      textLayer.render(activeTextData);
    };

  } catch (error) {
    console.error('Failed to initialize App:', error);
  }
});
