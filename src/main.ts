import './style.css';
import { GlobeApp } from './components/Globe';
import { TextLayer } from './components/TextLayer';
import type { TextData } from './components/TextLayer';
import { latLonToVector3 } from './utils/coordinates';

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
          const pop = c.pop || 50000;
          const logPop = Math.log10(pop);
          const size = Math.max(8, Math.pow(Math.max(0, logPop - 4.5), 1.5) * 6);
          
          let color = '#888888';
          if (pop > 20000000) color = '#ff00ff';       // Hot Pink (Beijing)
          else if (pop > 10000000) color = '#ff3300';  // Orange-Red (Tokyo)
          else if (pop > 5000000) color = '#ffcc00';   // Yellow-Gold (Seoul, NY)
          else if (pop > 2000000) color = '#33ff33';   // Neon Green (Busan)
          else if (pop > 1000000) color = '#00ffff';   // Cyan (Daejeon)
          else color = '#888888';                      // Muted Gray (Jeju, Jeonju)
          
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

    const layerUnroll = document.getElementById('layer-unroll') as HTMLInputElement;
    const layerSatellites = document.getElementById('layer-satellites') as HTMLInputElement;

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

    // Help & Legend UI toggling
    const legendPanel = document.getElementById('legend-panel');
    const legendClose = document.getElementById('legend-close');
    const legendToggle = document.getElementById('legend-toggle');

    if (legendClose && legendPanel && legendToggle) {
      legendClose.addEventListener('click', () => {
        legendPanel.style.display = 'none';
        legendToggle.style.display = 'flex';
      });
      legendToggle.addEventListener('click', () => {
        legendPanel.style.display = 'block';
        legendToggle.style.display = 'none';
      });
    }

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
        globeApp.clearHighlightedNetworkArc();  // Clear highlighted network arc
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
          globeApp.clearHighlightedNetworkArc();
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
          globeApp.clearHighlightedNetworkArc();
          infoPanel.style.display = 'block';
          infoTitle.textContent = c.name;
          infoSubtitle.textContent = c.country || 'Global City';
          
          infoDesc.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; font-size: 13px;">
              <div style="color: #aaa;">국가 (Country)</div>
              <div style="text-align: right; font-weight: 500;">${c.country}</div>
              <div style="color: #aaa;">인구수 (Population)</div>
              <div style="text-align: right; font-weight: 500; color: #ffcc00;">${(c.pop || 0).toLocaleString()}명</div>
              <div style="color: #aaa;">현지 시간 (Local Time)</div>
              <div style="text-align: right; font-weight: 500;">${c.time || 'N/A'}</div>
              <div style="color: #aaa;">현재 날씨 (Weather)</div>
              <div style="text-align: right; font-weight: 500; color: #00ffff;">${c.weather || 'N/A'}</div>
            </div>
            <div style="margin-top: 15px; padding: 12px; background: rgba(255,255,255,0.06); border-radius: 8px; font-size: 12px; border-left: 3px solid #ffaa00;">
              <strong style="color: #ffaa00; display: block; margin-bottom: 5px;">📰 실시간 뉴스 (Latest News)</strong>
              <span style="color: #ddd; line-height: 1.4;">${c.news || 'No active headlines'}</span>
            </div>
          `;
          globeApp.drawSelectedSatelliteOrbit([]); // Clear orbit if a city is clicked
        } else if (result.type === 'network') {
          const line = result.data;
          globeApp.highlightNetworkArc(line);
          infoPanel.style.display = 'block';
          infoTitle.textContent = 'Network Connection';
          infoSubtitle.textContent = 'Active Network Arc';
          infoDesc.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 10px; text-align: center;">
              <div style="font-size: 16px; font-weight: bold; color: #ffaa00;">${line.userData.startCity}</div>
              <div style="color: #888;">⟷</div>
              <div style="font-size: 16px; font-weight: bold; color: #ffaa00;">${line.userData.endCity}</div>
            </div>
            <p style="margin-top: 15px; font-size: 13px; color: #aaa; text-align: center;">
              This arc represents a high-speed data connection between these two global cities.
            </p>
          `;
          globeApp.drawSelectedSatelliteOrbit([]);
        }
      } else {
        // Clicked empty space
        if (infoPanel) infoPanel.style.display = 'none';
        globeApp.drawSelectedSatelliteOrbit([]);
        globeApp.clearHighlightedNetworkArc();
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
              globeApp.clearHighlightedNetworkArc();
              infoSubtitle.innerText = `${rawCity.country} | Pop: ${(rawCity.pop / 1000000).toFixed(1)}M`;
              infoDesc.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; font-size: 13px;">
                  <div style="color: #aaa;">국가 (Country)</div>
                  <div style="text-align: right; font-weight: 500;">${rawCity.country}</div>
                  <div style="color: #aaa;">인구수 (Population)</div>
                  <div style="text-align: right; font-weight: 500; color: #ffcc00;">${(rawCity.pop || 0).toLocaleString()}명</div>
                  <div style="color: #aaa;">현지 시간 (Local Time)</div>
                  <div style="text-align: right; font-weight: 500;">${rawCity.time || 'N/A'}</div>
                  <div style="color: #aaa;">현재 날씨 (Weather)</div>
                  <div style="text-align: right; font-weight: 500; color: #00ffff;">${rawCity.weather || 'N/A'}</div>
                </div>
                <div style="margin-top: 15px; padding: 12px; background: rgba(255,255,255,0.06); border-radius: 8px; font-size: 12px; border-left: 3px solid #ffaa00;">
                  <strong style="color: #ffaa00; display: block; margin-bottom: 5px;">📰 실시간 뉴스 (Latest News)</strong>
                  <span style="color: #ddd; line-height: 1.4;">${rawCity.news || 'No active headlines'}</span>
                </div>
              `;
            }

          } else if (hit.id.startsWith('sat_')) {
            globeApp.clearHighlightedNetworkArc();
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
