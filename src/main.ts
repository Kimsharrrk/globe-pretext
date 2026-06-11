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
      
      if (type === 'SATELLITES_UPDATED') {
        const satTextData: TextData[] = data.map((s: any) => ({
          id: s.id,
          position: latLonToVector3(s.lat, s.lon, 100 + (s.alt / 63.71)),
          text: `🛰 ${s.name}`,
          color: '#00ff00',
          fontSize: 12
        }));
        
        activeTextData = [...activeTextData.filter(d => !d.id.startsWith('sat_')), ...satTextData];
        globeApp.updateSatellitesBeams(data);
      }

      if (type === 'ORBITS_UPDATED') {
        globeApp.addOrbits(data);
      }

      if (type === 'CITIES_UPDATED') {
        globeApp.drawNetworkArcs(data);
        const cityTextData: TextData[] = data.map((c: any) => {
          // Typography map effect: scale font size based on population
          // Using a logarithmic scale allows both small cities to form the background
          // and massive cities (like Beijing, Seoul) to pop out immensely.
          const logPop = Math.log10(c.pop || 50000);
          // Scale from ~4.5 (30k) to ~7.5 (30M) into 8px to 48px
          const size = Math.max(8, Math.min(48, (logPop - 4.5) * 14));
          
          let color = '#444455'; // Background small cities
          if (c.pop > 5000000) color = '#ffffff'; // Mega cities pop out
          else if (c.pop > 1000000) color = '#aaaaaa'; // Large cities

          return {
            id: c.id,
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

    // UI Toggle
    const toggleBtn = document.getElementById('toggle-update');
    let isPaused = false;
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        toggleBtn.innerText = isPaused ? 'Resume Updates' : 'Pause Updates';
        worker.postMessage({ type: 'TOGGLE' });
      });
    }

    const togglePretextBtn = document.getElementById('toggle-pretext-mode');
    let isPretextMode = false;
    if (togglePretextBtn) {
      togglePretextBtn.addEventListener('click', () => {
        isPretextMode = !isPretextMode;
        globeApp.setPretextMode(isPretextMode);
        worker.postMessage({ type: 'SET_PRETEXT_MODE', payload: isPretextMode });
        if (isPretextMode) {
          togglePretextBtn.style.background = 'rgba(0,80,0,0.9)';
          togglePretextBtn.innerText = 'STANDARD MODE';
        } else {
          togglePretextBtn.style.background = 'rgba(0,20,0,0.8)';
          togglePretextBtn.innerText = 'MATRIX PRETEXT MODE';
        }
      });
    }

    // UI Interaction
    const infoPanel = document.getElementById('info-panel');
    const infoTitle = document.getElementById('info-title');
    const infoSubtitle = document.getElementById('info-subtitle');
    const infoDesc = document.getElementById('info-desc');
    const popupClose = document.getElementById('info-close');
    
    if (popupClose && infoPanel) {
      popupClose.addEventListener('click', () => {
        infoPanel.style.display = 'none';
      });
    }

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
