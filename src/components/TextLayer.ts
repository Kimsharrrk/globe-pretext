import * as THREE from 'three';
import { projectToScreen, isPointVisible } from '../utils/coordinates';
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';
import type { PreparedTextWithSegments } from '@chenglou/pretext';

export interface TextData {
  id: string;
  lat?: number;
  lon?: number;
  position: THREE.Vector3; // 3D position on the globe
  text: string;
  color: string;
  fontSize: number;
}

export class TextLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: THREE.Camera;
  private rendererDom: HTMLElement;
  private globeCenter: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private globeRadius: number = 100;

  // Cache for Pretext PreparedText to avoid re-preparing every frame
  private textCache: Map<string, { prepared: PreparedTextWithSegments, text: string }> = new Map();

  constructor(canvasId: string, camera: THREE.Camera, rendererDom: HTMLElement) {
    const el = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!el) throw new Error(`Canvas #${canvasId} not found`);
    this.canvas = el;
    this.ctx = this.canvas.getContext('2d')!;
    this.camera = camera;
    this.rendererDom = rendererDom;

    this.resize();
    window.addEventListener('resize', this.resize.bind(this));
  }

  private resize() {
    const width = this.rendererDom.clientWidth;
    const height = this.rendererDom.clientHeight;
    
    // Scale for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  public render(dataPoints: TextData[]) {
    const width = this.rendererDom.clientWidth;
    const height = this.rendererDom.clientHeight;

    // Clear the canvas entirely for the new frame to ensure clean text rendering
    this.ctx.clearRect(0, 0, width, height);

    // Calculate distance to determine zoom level
    const dist = this.camera.position.length();
    const radius = this.globeRadius;
    
    // Level 1: Space view (dist > radius * 2.5) -> show only satellites
    // Level 2: Continent view (radius * 1.2 < dist <= radius * 2.5) -> show cities
    // Level 3: City view (dist <= radius * 1.2) -> show weather/news
    let zoomLevel = 1;
    if (dist <= radius * 1.2) zoomLevel = 3;
    else if (dist <= radius * 2.5) zoomLevel = 2;

    const drawnBoxes: { x: number, y: number, w: number, h: number }[] = [];
    // Sort data by fontSize descending to prioritize rendering large cities first
    const sortedData = [...dataPoints].sort((a, b) => (b.fontSize || 10) - (a.fontSize || 10));

    for (const data of sortedData) {
      // Zoom Level Filtering
      if (zoomLevel === 1 && !data.id.startsWith('sat_') && !data.id.startsWith('city_')) continue;
      if (zoomLevel === 2 && !data.id.startsWith('city_')) continue;
      if (zoomLevel === 3 && data.id.startsWith('sat_')) continue;

      let worldPos = data.position;
      const t = (window as any).uMorph || 0;
      if (t > 0 && data.lat !== undefined && data.lon !== undefined) {
         const flatX = (data.lon / 180) * 100 * Math.PI;
         const flatY = (data.lat / 90) * 100 * (Math.PI / 2);
         // Preserve alt/radius relative to 100
         const alt = data.position.length() - 100;
         worldPos = new THREE.Vector3().lerpVectors(data.position, new THREE.Vector3(flatX, flatY, alt), t);
      }

      // 1. Check if point is facing the camera (not on the back side of the globe)
      if (!isPointVisible(worldPos, this.globeCenter, this.camera.position)) {
        continue;
      }

      // 2. Project 3D coordinate to 2D screen coordinate
      const screenPos = projectToScreen(worldPos, this.camera, width, height);

      // If outside screen, clip
      if (screenPos.x < 0 || screenPos.x > width || screenPos.y < 0 || screenPos.y > height) {
        continue;
      }

      // 3. Prepare Text using Pretext
      const font = `900 ${data.fontSize}px Inter, sans-serif`;
      const cacheKey = `${data.id}_${font}`;
      
      let cached = this.textCache.get(cacheKey);
      if (!cached || cached.text !== data.text) {
        cached = {
          prepared: prepareWithSegments(data.text, font),
          text: data.text
        };
        this.textCache.set(cacheKey, cached);
      }

      // 4. Layout Text
      const maxWidth = 200;
      const lineHeight = data.fontSize * 1.2;
      const result = layoutWithLines(cached.prepared, maxWidth, lineHeight);

      // 5. Collision Detection
      this.ctx.font = font;
      let textWidth = 0;
      for (const line of result.lines) {
        const metrics = this.ctx.measureText(line.text);
        if (metrics.width > textWidth) textWidth = metrics.width;
      }

      // 2D Bounding Box (AABB)
      const padding = 2;
      const box = {
        x: screenPos.x + 5, // Slight offset so text doesn't cover the dot
        y: screenPos.y - padding,
        w: textWidth + padding * 2,
        h: result.lines.length * lineHeight + padding * 2
      };

      // Check against already drawn boxes
      let hasCollision = false;
      for (const b of drawnBoxes) {
        if (box.x < b.x + b.w && box.x + box.w > b.x &&
            box.y < b.y + b.h && box.y + box.h > b.y) {
          hasCollision = true;
          break;
        }
      }

      // Skip this text if it overlaps with a higher-priority one
      if (hasCollision) continue;

      drawnBoxes.push(box);

      // 6. Draw Text to Canvas 2D
      // Draw stroke first to make it pop and super thick
      this.ctx.fillStyle = data.color;
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 3;
      this.ctx.textBaseline = 'top';

      let currentY = screenPos.y;
      for (const line of result.lines) {
        this.ctx.strokeText(line.text, screenPos.x + 8, currentY); 
        this.ctx.fillText(line.text, screenPos.x + 8, currentY); 
        currentY += lineHeight;
      }

      // Optional: Draw a small dot at the exact coordinate
      this.ctx.beginPath();
      this.ctx.arc(screenPos.x, screenPos.y, 2, 0, Math.PI * 2);
      this.ctx.fillStyle = data.color;
      this.ctx.fill();
    }
  }

  public getHitData(mouseX: number, mouseY: number, dataPoints: TextData[]): TextData | null {
    const width = this.rendererDom.clientWidth;
    const height = this.rendererDom.clientHeight;
    
    let closestData: TextData | null = null;
    let minDistance = 20; // 20px hit radius

    const distCamera = this.camera.position.length();
    let zoomLevel = 1;
    if (distCamera <= this.globeRadius * 1.2) zoomLevel = 3;
    else if (distCamera <= this.globeRadius * 2.5) zoomLevel = 2;

    for (const data of dataPoints) {
      if (zoomLevel === 1 && !data.id.startsWith('sat_') && !data.id.startsWith('city_')) continue;
      if (zoomLevel === 2 && !data.id.startsWith('city_')) continue;
      if (zoomLevel === 3 && data.id.startsWith('sat_')) continue;

      if (!isPointVisible(data.position, this.globeCenter, this.camera.position)) continue;

      const screenPos = projectToScreen(data.position, this.camera, width, height);
      if (screenPos.x < 0 || screenPos.x > width || screenPos.y < 0 || screenPos.y > height) continue;

      const dx = screenPos.x - mouseX;
      const dy = screenPos.y - mouseY;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d < minDistance) {
        minDistance = d;
        closestData = data;
      }
    }

    return closestData;
  }

  public cleanupCache() {
    this.textCache.clear();
  }
}
