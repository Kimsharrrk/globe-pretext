import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class GlobeApp {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public globeGroup: THREE.Group;
  
  private container: HTMLElement;
  private reqId: number = 0;
  private orbitsGroup: THREE.Group;
  private flightsGroup: THREE.Group;
  private bordersGroup: THREE.Group;
  private beamsGroup: THREE.Group;
  private networksGroup: THREE.Group;

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
    this.beamsGroup = new THREE.Group();
    this.networksGroup = new THREE.Group();
    
    this.scene.add(this.globeGroup);
    this.scene.add(this.orbitsGroup);
    this.scene.add(this.flightsGroup);
    this.scene.add(this.bordersGroup);
    this.scene.add(this.beamsGroup);
    this.scene.add(this.networksGroup);
    
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
    this.initInteraction();

    // 6. Resize Handler
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Start Loop
    this.animate();
  }

  private initGlobe() {
    const textureLoader = new THREE.TextureLoader();
    
    // Radius of Earth = 100 units
    const geometry = new THREE.SphereGeometry(100, 64, 64);
    
    const material = new THREE.MeshPhongMaterial({
      map: textureLoader.load('/textures/earth-blue-marble.jpg'),
      bumpMap: textureLoader.load('/textures/earth-topology.png'),
      bumpScale: 1.0,
      specularMap: textureLoader.load('/textures/earth-water.png'),
      specular: new THREE.Color(0x333333),
      shininess: 15,
    });

    const earthMesh = new THREE.Mesh(geometry, material);
    this.globeGroup.add(earthMesh);

    // Optional: Atmospheric Glow (simple additive blending sphere)
    const atmGeometry = new THREE.SphereGeometry(102, 64, 64);
    const atmMaterial = new THREE.MeshPhongMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false
    });
    const atmMesh = new THREE.Mesh(atmGeometry, atmMaterial);
    this.globeGroup.add(atmMesh);
  }

  // Removed duplicate orbitsGroup
  public addOrbits(orbits: any[]) {
    if (!this.scene.children.includes(this.orbitsGroup)) {
      this.globeGroup.add(this.orbitsGroup);
    }
    
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
      const line = new THREE.Line(geometry, material);
      this.orbitsGroup.add(line);
    }
  }

  public addFlightPaths(flights: any[]) {
    while (this.flightsGroup.children.length > 0) {
      const child = this.flightsGroup.children[0] as THREE.Line;
      this.flightsGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    const material = new THREE.LineDashedMaterial({
      color: 0xffff00,
      linewidth: 1,
      scale: 1,
      dashSize: 1.5,
      gapSize: 1.5,
      transparent: true,
      opacity: 0.4
    });

    for (const f of flights) {
      if (!f.history || f.history.length < 2) continue;
      const points = f.history.map((p: any) => {
        const phi = (90 - p.lat) * (Math.PI / 180);
        const theta = p.lon * (Math.PI / 180);
        const r = 100 + (p.alt / 63.71);
        return new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          -r * Math.sin(phi) * Math.sin(theta)
        );
      });
      // add current
      const phi = (90 - f.lat) * (Math.PI / 180);
      const theta = f.lon * (Math.PI / 180);
      const r = 100 + (f.alt / 63.71);
      points.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        -r * Math.sin(phi) * Math.sin(theta)
      ));
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances(); 
      this.flightsGroup.add(line);
    }
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
      const line = new THREE.Line(geometry, material);
      this.beamsGroup.add(line);
    }
  }

  public drawNetworkArcs(cities: any[]) {
    // Clear existing
    while (this.networksGroup.children.length > 0) {
      const child = this.networksGroup.children[0] as THREE.Line;
      this.networksGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    // Connect top 50 cities randomly to create a beautiful global network
    const topCities = [...cities].sort((a, b) => b.pop - a.pop).slice(0, 50);
    
    const material = new THREE.LineBasicMaterial({
      color: 0xff00ff,
      transparent: true,
      opacity: 0.2
    });

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
        const line = new THREE.Line(geometry, material);
        this.networksGroup.add(line);
      }
    }
  }

  private async loadBorders() {
    try {
      const res = await fetch('/countries.geo.json');
      const data = await res.json();
      
      const material = new THREE.LineBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.3 });
      
      data.features.forEach((feature: any) => {
        if (!feature.geometry) return;
        if (feature.geometry.type === 'Polygon') {
          this.drawPolygon(feature.geometry.coordinates[0], material);
        } else if (feature.geometry.type === 'MultiPolygon') {
          feature.geometry.coordinates.forEach((poly: any) => {
            this.drawPolygon(poly[0], material);
          });
        }
      });
      this.bordersGroup.visible = false; // Hidden initially
    } catch (e) {
      console.warn('Could not load borders:', e);
    }
  }

  private drawPolygon(coords: number[][], material: THREE.Material) {
    const points: THREE.Vector3[] = [];
    coords.forEach(coord => {
      points.push(this.latLonToVector3Local(coord[1], coord[0], 0.1));
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
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

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private initInteraction() {
    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycast
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.globeGroup.children);

      if (intersects.length > 0) {
        // Trigger a custom event or callback
        const hitPoint = intersects[0].point;
        console.log('Globe clicked at 3D point:', hitPoint);
        // We can pass this out to UI
      }
    });
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
