import * as THREE from 'three';

/**
 * Converts Latitude and Longitude to a Three.js Vector3 point on a sphere.
 * @param lat Latitude in degrees
 * @param lon Longitude in degrees
 * @param radius The radius of the globe (default: 100)
 * @returns THREE.Vector3
 */
export function latLonToVector3(lat: number, lon: number, radius: number = 100): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = lon * (Math.PI / 180);

  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = -radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

/**
 * Projects a 3D coordinate to 2D screen space.
 * @param pos 3D position
 * @param camera Three.js Camera
 * @param rendererWidth Width of the renderer/canvas
 * @param rendererHeight Height of the renderer/canvas
 * @returns {x, y, z} where x and y are screen coordinates, and z is depth (used for culling)
 */
export function projectToScreen(
  pos: THREE.Vector3,
  camera: THREE.Camera,
  rendererWidth: number,
  rendererHeight: number
): { x: number; y: number; z: number } {
  const vector = pos.clone().project(camera);
  
  // vector.z > 1 means it's behind the camera near/far plane
  return {
    x: (vector.x + 1) * rendererWidth / 2,
    y: -(vector.y - 1) * rendererHeight / 2,
    z: vector.z
  };
}

/**
 * Checks if a point on the sphere is visible to the camera (not occluded by the sphere itself)
 * @param pos The point on the sphere
 * @param globeCenter The center of the globe (usually 0,0,0)
 * @param cameraPosition The position of the camera
 * @param globeRadius The radius of the globe
 * @returns boolean
 */
export function isPointVisible(
  pos: THREE.Vector3, 
  globeCenter: THREE.Vector3, 
  cameraPosition: THREE.Vector3
): boolean {
  // Vector from globe center to point
  const normal = pos.clone().sub(globeCenter).normalize();
  
  // Vector from point to camera
  const viewVector = cameraPosition.clone().sub(pos).normalize();
  
  // If dot product is > 0, the point is facing the camera
  return normal.dot(viewVector) > 0;
}
