/* Assembles the static JSON files into the object the engine expects.
   Used by the browser (fetched from /data) and by the Node scripts. */
import { RoadNetwork } from './network.js';

export const DATA_FILES = ['network', 'junctions', 'hospitals', 'places', 'ambulances', 'boundary'];

export function assembleData(raw) {
  return {
    network: new RoadNetwork(raw.network),
    attribution: raw.network.attribution,
    junctions: raw.junctions.junctions,
    hospitals: raw.hospitals.hospitals,
    places: raw.places.places,
    bases: raw.places.bases,
    ambulances: raw.ambulances.ambulances,
    boundary: raw.boundary,
  };
}
