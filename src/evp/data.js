/* Assembles the static JSON files into the object the engine expects.
   Used by the browser (fetched from /data) and by the Node scripts. */
import { RoadNetwork } from './network.js';

export const DATA_FILES = ['network', 'junctions', 'hospitals', 'places', 'ambulances', 'boundary', 'cameras'];

function cctvCameras(manifest) {
  const clips = new Map((manifest?.clips || []).map((c) => [c.id, c]));
  return (manifest?.cameras || []).map((cam) => {
    const clip = clips.get(cam.clip);
    return clip ? { ...cam, src: clip.src, poster: clip.poster, durationS: clip.durationS, footage: clip.footage } : cam;
  });
}

// Junction ID → its cameras, in the order of the junction's approaches.
function camerasByJunction(cameras, junctions) {
  return new Map(junctions.map((j) => [j.id, j.arms.map((a) => cameras.find((c) => c.junctionId === j.id && c.arm === a.id)).filter(Boolean)]));
}

export function assembleData(raw) {
  const cameras = cctvCameras(raw.cameras);
  return {
    network: new RoadNetwork(raw.network),
    attribution: raw.network.attribution,
    junctions: raw.junctions.junctions,
    hospitals: raw.hospitals.hospitals,
    places: raw.places.places,
    bases: raw.places.bases,
    ambulances: raw.ambulances.ambulances,
    boundary: raw.boundary,
    // Junction CCTV: one camera per signalised approach, each playing a clip
    // from the stand-in footage library (see scripts/fetch-cctv.mjs).
    cameras,
    camerasByJ: camerasByJunction(cameras, raw.junctions.junctions),
    cctvClips: raw.cameras?.clips || [],
    cameraNote: raw.cameras?.note || null,
  };
}
