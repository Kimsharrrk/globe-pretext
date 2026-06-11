import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from 'gsap';

export class GlobeApp {
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public camera: THREE.PerspectiveCamera;
  public controls: OrbitControls;
  public earthMesh: THREE.Mesh | null = null;
  public globeGroup: THREE.Group;
  private atmMesh: THREE.Mesh | null = null;
  
  private container: HTMLElement;
  private reqId: number = 0;
  private orbitsGroup: THREE.Group;
  private flightsGroup: THREE.Group;
  private satGroup: THREE.Group;
  private beamsGroup: THREE.Group;
  private satSwarmGeometry: THREE.BufferGeometry;
  private satSwarmPoints: THREE.Points;
  private bordersGroup: THREE.Group;
  private networksGroup: THREE.Group;

  private satellitesData: any[] = [];
  private selectedSatelliteOrbit: THREE.Line | null = null;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container ${containerId} not found`);
    this.container = container;

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.scene = new THREE.Scene();
    
    // Add globe, orbits, flights, and borders group
    this.globeGroup = new THREE.Group();
    this.orbitsGroup = new THREE.Group();
    this.flightsGroup = new THREE.Group();
    this.bordersGroup = new THREE.Group();
    this.satGroup = new THREE.Group();
    this.beamsGroup = new THREE.Group();
    this.networksGroup = new THREE.Group();
    
    this.scene.add(this.globeGroup);
    // Add sub-groups to globeGroup so they undergo the same scene transformations
    this.globeGroup.add(this.orbitsGroup);
    this.globeGroup.add(this.flightsGroup);
    this.globeGroup.add(this.bordersGroup);
    this.globeGroup.add(this.satGroup);
    this.globeGroup.add(this.beamsGroup);
    this.globeGroup.add(this.networksGroup);

    this.satSwarmGeometry = new THREE.BufferGeometry();
    const satMaterial = new THREE.PointsMaterial({
      size: 3.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.satSwarmPoints = new THREE.Points(this.satSwarmGeometry, satMaterial);
    this.globeGroup.add(this.satSwarmPoints);
    
    this.scene.background = new THREE.Color(0x000000);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(145, 143, 145);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // 4. Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 105;
    this.controls.maxDistance = 600;

    this.initGlobe();
    this.initLights();
    this.loadBorders();


    // 6. Resize Handler
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Start Loop
    this.animate();
  }

  private initGlobe() {
    const textureLoader = new THREE.TextureLoader();
    
    // Radius of Earth = 100 units
    const geometry = new THREE.SphereGeometry(100, 64, 64);
    this.setupMorphGeometry(geometry);
    
    const material = new THREE.MeshPhongMaterial({
      map: textureLoader.load('/textures/earth-blue-marble.jpg'),
      bumpMap: textureLoader.load('/textures/earth-topology.png'),
      bumpScale: 5,
      specularMap: textureLoader.load('/textures/earth-water.png'),
      specular: new THREE.Color('grey'),
      shininess: 50
    });
    this.earthMesh = new THREE.Mesh(geometry, material);
    this.globeGroup.add(this.earthMesh);

    const atmGeometry = new THREE.SphereGeometry(102, 64, 64);
    this.setupMorphGeometry(atmGeometry);
    const atmMaterial = new THREE.MeshPhongMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.atmMesh = new THREE.Mesh(atmGeometry, atmMaterial);
    this.globeGroup.add(this.atmMesh);
  }

  // Removed duplicate orbitsGroup
  public addOrbits(orbits: any[]) {
    // Clear existing
    while(this.orbitsGroup.children.length > 0) { 
      const child = this.orbitsGroup.children[0] as THREE.Line;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
      this.orbitsGroup.remove(child); 
    }

    const material = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 });
    
    for (const orbit of orbits) {
      const points = orbit.points.map((p: any) => {
        // use latLonToVector3 logic manually since we can't easily import it without circular deps or we can just do the math
        const phi = (90 - p.lat) * (Math.PI / 180);
        const theta = p.lon * (Math.PI / 180);
        const r = 100 + p.alt;
        return new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          -r * Math.sin(phi) * Math.sin(theta)
        );
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.setupMorphGeometry(geometry);
      const line = new THREE.Line(geometry, material);
      this.orbitsGroup.add(line);
    }
  }

  public addFlightPaths(_flights: any[]) {
    // Flight rendering disabled to reduce visual clutter
  }

  private latLonToVector3Local(lat: number, lon: number, alt: number): THREE.Vector3 {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = lon * (Math.PI / 180);
    const r = 100 + alt;
    return new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      -r * Math.sin(phi) * Math.sin(theta)
    );
  }

  public setPretextMode(enabled: boolean) {
    const earthMesh = this.globeGroup.children[0] as THREE.Mesh;
    if (earthMesh) {
      if (enabled) {
        earthMesh.material = new THREE.MeshBasicMaterial({ color: 0x000000, depthWrite: true });
        this.bordersGroup.visible = true;
        this.scene.background = new THREE.Color(0x050510);
      } else {
        const textureLoader = new THREE.TextureLoader();
        earthMesh.material = new THREE.MeshPhongMaterial({
          map: textureLoader.load('/textures/earth-blue-marble.jpg'),
          bumpMap: textureLoader.load('/textures/earth-topology.png'),
          bumpScale: 1.0,
          specularMap: textureLoader.load('/textures/earth-water.png'),
          specular: new THREE.Color(0x333333),
          shininess: 15,
        });
        this.bordersGroup.visible = false;
        this.scene.background = new THREE.Color(0x000000);
      }
    }
  }

  public updateSatelliteSwarm(data: any[]) {
    this.satellitesData = data;
    const count = data.length;
    if (count === 0) return;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    const colorStarlink = new THREE.Color('#00ffff');
    const colorDebris = new THREE.Color('#ff4444');
    const colorPayload = new THREE.Color('#aaffaa');
    const colorRocket = new THREE.Color('#aaaaaa');

    const t = (window as any).uMorph || 0;

    for (let i = 0; i < count; i++) {
      const s = data[i];
      const pos = this.latLonToVector3Local(s.lat, s.lon, s.alt / 63.71);
      
      if (t > 0) {
         const flatX = (s.lon / 180) * 100 * Math.PI;
         const flatY = (s.lat / 90) * 100 * (Math.PI / 2);
         const alt = pos.length() - 100;
         pos.lerp(new THREE.Vector3(flatX, flatY, alt), t);
      }
      
      positions[i*3] = pos.x;
      positions[i*3+1] = pos.y;
      positions[i*3+2] = pos.z;

      let c = colorPayload;
      if (s.type === 'starlink') c = colorStarlink;
      else if (s.type === 'debris') c = colorDebris;
      else if (s.type === 'rocket') c = colorRocket;

      colors[i*3] = c.r;
      colors[i*3+1] = c.g;
      colors[i*3+2] = c.b;
    }

    this.satSwarmGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.satSwarmGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.satSwarmGeometry.attributes.position.needsUpdate = true;
    this.satSwarmGeometry.attributes.color.needsUpdate = true;
    this.satSwarmGeometry.computeBoundingSphere();
  }

  public handleGlobalClick(clientX: number, clientY: number): any {
    this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.params.Points.threshold = 3.0; // Make it easier to click points
    this.raycaster.params.Line = { threshold: 1.5 }; // Make it easier to click lines

    // Raycast satellites
    if (this.satSwarmPoints && this.satSwarmPoints.visible) {
      const intersects = this.raycaster.intersectObject(this.satSwarmPoints);
      if (intersects.length > 0) {
        const index = intersects[0].index;
        if (index !== undefined && this.satellitesData[index]) {
          return { type: 'satellite', data: this.satellitesData[index] };
        }
      }
    }

    // Raycast spikes (Cities)
    if (this.spikesMesh && this.spikesMesh.visible) {
      const intersects = this.raycaster.intersectObject(this.spikesMesh);
      if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;
        const cities = (window as any).currentCityData || [];
        if (instanceId !== undefined && cities[instanceId]) {
          return { type: 'city', data: cities[instanceId] };
        }
      }
    }

    // Raycast network lines
    if (this.networksGroup && this.networksGroup.children.length > 0) {
      const intersects = this.raycaster.intersectObjects(this.networksGroup.children);
      if (intersects.length > 0) {
        return { type: 'network', data: intersects[0].object };
      }
    }

    return null;
  }

  public drawSelectedSatelliteOrbit(orbitPoints: THREE.Vector3[]) {
    if (this.selectedSatelliteOrbit) {
      this.globeGroup.remove(this.selectedSatelliteOrbit);
      this.selectedSatelliteOrbit.geometry.dispose();
      (this.selectedSatelliteOrbit.material as THREE.Material).dispose();
      this.selectedSatelliteOrbit = null;
    }

    if (!orbitPoints || orbitPoints.length === 0) return;

    const geometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    this.setupMorphGeometry(geometry);
    
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.6,
      linewidth: 2
    });

    this.selectedSatelliteOrbit = new THREE.Line(geometry, material);
    this.globeGroup.add(this.selectedSatelliteOrbit);
  }

  public toggleSatellites(enabled: boolean) {
    if (this.satSwarmPoints) {
      this.satSwarmPoints.visible = enabled;
    }
  }

  public updateSatellitesBeams(satellites: any[]) {
    while (this.beamsGroup.children.length > 0) {
      const child = this.beamsGroup.children[0] as THREE.Line;
      this.beamsGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    const material = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6
    });

    for (const sat of satellites) {
      const topPos = this.latLonToVector3Local(sat.lat, sat.lon, sat.alt / 63.71);
      const groundPos = this.latLonToVector3Local(sat.lat, sat.lon, 0);
      
      const geometry = new THREE.BufferGeometry().setFromPoints([topPos, groundPos]);
      this.setupMorphGeometry(geometry);
      const line = new THREE.Line(geometry, material);
      this.beamsGroup.add(line);
    }
    const t = (window as any).uMorph || 0;
    if (t > 0) this.applyMorph();
  }

  public highlightedNetworkArc: THREE.Line | null = null;

  public highlightNetworkArc(line: THREE.Line) {
    this.clearHighlightedNetworkArc();
    this.highlightedNetworkArc = line;
    const mat = line.material as THREE.LineBasicMaterial;
    mat.opacity = 1.0;
    mat.color.setHex(0xffff00); // Highlight with bright yellow
  }

  public clearHighlightedNetworkArc() {
    if (this.highlightedNetworkArc) {
      const mat = this.highlightedNetworkArc.material as THREE.LineBasicMaterial;
      mat.opacity = 0.25;
      mat.color.setHex(0xff00ff); // Restore to neon magenta
      this.highlightedNetworkArc = null;
    }
  }

  public drawNetworkArcs(cities: any[]) {
    // Clear existing
    if (this.highlightedNetworkArc) {
      this.highlightedNetworkArc = null;
    }
    while (this.networksGroup.children.length > 0) {
      const child = this.networksGroup.children[0] as THREE.Line;
      this.networksGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    // Connect top 50 cities randomly to create a beautiful global network
    const topCities = [...cities].sort((a, b) => b.pop - a.pop).slice(0, 50);

    for (let i = 0; i < topCities.length; i++) {
      // Connect each city to 3 other random top cities
      for (let j = 0; j < 3; j++) {
        const target = topCities[Math.floor(Math.random() * topCities.length)];
        if (target.id === topCities[i].id) continue;

        const start = this.latLonToVector3Local(topCities[i].lat, topCities[i].lon, 0);
        const end = this.latLonToVector3Local(target.lat, target.lon, 0);
        
        // Calculate distance to determine arc height
        const dist = start.distanceTo(end);
        const midPoint = start.clone().lerp(end, 0.5).normalize().multiplyScalar(100 + dist * 0.3); // Arc height

        const curve = new THREE.QuadraticBezierCurve3(start, midPoint, end);
        const points = curve.getPoints(20);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.setupMorphGeometry(geometry);
        
        // Instantiate unique material for each line so we can highlight it individually
        const material = new THREE.LineBasicMaterial({
          color: 0xff00ff,
          transparent: true,
          opacity: 0.25
        });

        const line = new THREE.Line(geometry, material);
        line.userData = {
          isNetworkArc: true,
          startCity: topCities[i].name,
          endCity: target.name,
          baseOpacity: 0.25
        };
        this.networksGroup.add(line);
      }
    }
  }

  private spikesMesh: THREE.InstancedMesh | null = null;

  public updatePopulationSpikes(cities: any[], visible: boolean) {
    if (!visible) {
      if (this.spikesMesh) this.spikesMesh.visible = false;
      return;
    }
    
    if (!this.spikesMesh) {
      const geometry = new THREE.BoxGeometry(0.06, 1, 0.06);
      geometry.translate(0, 0.5, 0); 
      const material = new THREE.MeshPhongMaterial({
        color: 0x00ffcc,
        emissive: 0x008855,
        shininess: 30
      });
      this.spikesMesh = new THREE.InstancedMesh(geometry, material, cities.length);
      this.globeGroup.add(this.spikesMesh);
    }
    
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const t = (window as any).uMorph || 0;
    
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      const logPop = Math.log10(c.pop || 50000);
      const height = Math.max(0.5, Math.pow(Math.max(0, logPop - 4.5), 3.0) * 2.0);
      
      const pos = this.latLonToVector3Local(c.lat, c.lon, 0);
      
      if (t > 0) {
         const flatX = (c.lon / 180) * 100 * Math.PI;
         const flatY = (c.lat / 90) * 100 * (Math.PI / 2);
         const alt = pos.length() - 100;
         pos.lerp(new THREE.Vector3(flatX, flatY, alt), t);
      }
      dummy.position.copy(pos);
      
      const normal = pos.clone().normalize();
      if (t > 0.5) {
        dummy.lookAt(dummy.position.clone().add(new THREE.Vector3(0, 0, 1)));
        dummy.rotateX(Math.PI / 2);
      } else {
        dummy.lookAt(dummy.position.clone().add(normal));
        dummy.rotateX(Math.PI / 2);
      }
      
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      this.spikesMesh.setMatrixAt(i, dummy.matrix);
      
      const pop = c.pop || 50000;
      if (pop > 20000000) color.setHex(0xff00ff);       // Hot Pink (Beijing)
      else if (pop > 10000000) color.setHex(0xff3300);  // Orange-Red (Tokyo)
      else if (pop > 5000000) color.setHex(0xffcc00);   // Yellow-Gold (Seoul, NY)
      else if (pop > 2000000) color.setHex(0x33ff33);   // Neon Green (Busan)
      else if (pop > 1000000) color.setHex(0x00ffff);   // Cyan (Daejeon)
      else color.setHex(0x555555);                      // Muted Gray (Jeju, Jeonju)
      
      this.spikesMesh.setColorAt(i, color);
    }
    this.spikesMesh.instanceMatrix.needsUpdate = true;
    if (this.spikesMesh.instanceColor) this.spikesMesh.instanceColor.needsUpdate = true;
    
    this.spikesMesh.visible = true;
    
    this.spikesMesh.visible = true;
  }

  public flyTo(lat: number, lon: number) {
    const r = 100 * 1.25; // Zoom in to 1.25x globe radius
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = lon * (Math.PI / 180);
    const targetPos = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      -r * Math.sin(phi) * Math.sin(theta)
    );

    gsap.to(this.camera.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 2.0,
      ease: "power2.inOut",
      onUpdate: () => {
        this.camera.lookAt(0, 0, 0);
        this.controls.update();
      }
    });
  }

  public tiltForSpikes(enabled: boolean) {
    if (enabled) {
      // Tilt down slightly to see 3D heights
      gsap.to(this.controls, {
        maxPolarAngle: Math.PI / 1.5,
        minPolarAngle: Math.PI / 4,
        duration: 1.5
      });
      
      // If looking straight down, move camera Y down
      if (this.camera.position.y > 100) {
        gsap.to(this.camera.position, {
          y: 50,
          duration: 1.5,
          onUpdate: () => this.controls.update()
        });
      }
    } else {
      gsap.to(this.controls, {
        maxPolarAngle: Math.PI,
        minPolarAngle: 0,
        duration: 1.5
      });
    }
  }

  public unrollMap(enabled: boolean) {
    if (enabled) {
      gsap.to(this.camera.position, { x: 0, y: 0, z: 350, duration: 2.0, ease: "power2.inOut" });
      gsap.to(this.controls.target, { x: 0, y: 0, z: 0, duration: 2.0, ease: "power2.inOut" });
      
      this.controls.enableRotate = false;
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
      };
      this.controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN
      };
    } else {
      this.controls.enableRotate = true;
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      };
      this.controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
      };
    }

    gsap.to(window, {
      uMorph: enabled ? 1 : 0,
      duration: 2.0,
      ease: "power2.inOut",
      onUpdate: () => {
        this.applyMorph();
        this.controls.update(); 
      }
    });
  }

  private applyMorph() {
    const t = (window as any).uMorph || 0;
    
    // Morph geometries with spherePos/flatPos
    this.globeGroup.traverse((child: any) => {
      if (child.geometry && child.geometry.attributes.spherePos && child.geometry.attributes.flatPos) {
        const pos = child.geometry.attributes.position;
        const sPos = child.geometry.attributes.spherePos.array;
        const fPos = child.geometry.attributes.flatPos.array;
        
        for (let i = 0; i < pos.count; i++) {
          pos.setXYZ(
            i,
            THREE.MathUtils.lerp(sPos[i*3], fPos[i*3], t),
            THREE.MathUtils.lerp(sPos[i*3+1], fPos[i*3+1], t),
            THREE.MathUtils.lerp(sPos[i*3+2], fPos[i*3+2], t)
          );
        }
        pos.needsUpdate = true;
      }
    });

    // 2D Polish: Fade out the globe and atmosphere to emphasize the flat map data
    if (this.earthMesh && this.earthMesh.material) {
      (this.earthMesh.material as THREE.Material).transparent = true;
      (this.earthMesh.material as THREE.Material).opacity = THREE.MathUtils.lerp(1.0, 0.05, t);
    }
    if (this.atmMesh && this.atmMesh.material) {
      (this.atmMesh.material as THREE.Material).transparent = true;
      (this.atmMesh.material as THREE.Material).opacity = THREE.MathUtils.lerp(0.8, 0.0, t);
    }

    // Re-trigger dynamic updates to apply morphs
    if ((window as any).showSpikes) {
      this.updatePopulationSpikes((window as any).currentCityData || [], true);
    }
  }

  private setupMorphGeometry(geometry: THREE.BufferGeometry) {
    const pos = geometry.attributes.position;
    const count = pos.count;
    const flatPositions = new Float32Array(count * 3);
    const spherePositions = new Float32Array(count * 3);
    
    const vertex = new THREE.Vector3();
    for(let i=0; i<count; i++){
        vertex.fromBufferAttribute(pos, i);
        spherePositions[i*3] = vertex.x;
        spherePositions[i*3+1] = vertex.y;
        spherePositions[i*3+2] = vertex.z;
        
        const r = vertex.length();
        if (r < 0.1) continue; 
        
        const lat = Math.asin(vertex.y / r) * 180 / Math.PI;
        const lon = Math.atan2(-vertex.z, vertex.x) * 180 / Math.PI;
        
        const flatX = (lon / 180) * 100 * Math.PI;
        const flatY = (lat / 90) * 100 * (Math.PI / 2);
        const flatZ = r - 100; // preserve relative height
        
        flatPositions[i*3] = flatX;
        flatPositions[i*3+1] = flatY;
        flatPositions[i*3+2] = flatZ;
    }
    
    geometry.setAttribute('spherePos', new THREE.BufferAttribute(spherePositions, 3));
    geometry.setAttribute('flatPos', new THREE.BufferAttribute(flatPositions, 3));
  }

  private async loadBorders() {
    try {
      const res = await fetch('/countries.geo.json');
      const data = await res.json();
      const material = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 });
      
      data.features.forEach((feature: any) => {
        if (feature.geometry.type === 'Polygon') {
          this.createPolygon(feature.geometry.coordinates[0], material);
        } else if (feature.geometry.type === 'MultiPolygon') {
          feature.geometry.coordinates.forEach((poly: any) => this.createPolygon(poly[0], material));
        }
      });
    } catch(e) {
      console.warn("Failed to load borders", e);
    }
  }

  private createPolygon(coords: number[][], material: THREE.Material) {
    const points: THREE.Vector3[] = [];
    coords.forEach(c => {
      points.push(this.latLonToVector3Local(c[1], c[0], 0.1));
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.setupMorphGeometry(geometry); // Add morph targets
    const line = new THREE.Line(geometry, material);
    this.bordersGroup.add(line);
  }

  // Helper to get real sun position based on UTC time
  private getSunPosition(date: Date): { lat: number; lon: number } {
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getUTCFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    let lon = 180 - (hour * 15);
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;
    return { lat: declination, lon };
  }

  private sunLight!: THREE.DirectionalLight;

  private initLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.scene.add(this.sunLight);
  }

  private onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }

  public onRender?: () => void;

  private animate() {
    this.reqId = requestAnimationFrame(this.animate.bind(this));
    
    // Real-time Sun position for day/night shading
    const sun = this.getSunPosition(new Date());
    const phi = (90 - sun.lat) * (Math.PI / 180);
    const theta = sun.lon * (Math.PI / 180);
    const r = 500;
    this.sunLight.position.set(
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
      -r * Math.sin(phi) * Math.cos(theta)
    );

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    
    if (this.onRender) {
      this.onRender();
    }
  }

  public dispose() {
    cancelAnimationFrame(this.reqId);
    window.removeEventListener('resize', this.onWindowResize.bind(this));
    // Clean up Three.js resources if needed
  }
}
