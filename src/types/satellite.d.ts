declare module 'satellite.js' {
  export function twoline2satrec(tleLine1: string, tleLine2: string): any;
  export function propagate(satrec: any, time: Date): any;
  export function gstime(time: Date): any;
  export function eciToGeodetic(positionEci: any, gmst: any): any;
  export const degreesLat: (rad: number) => number;
  export const degreesLong: (rad: number) => number;
}
