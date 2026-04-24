// scenery.mjs — v8: Kenney Nature Kit background props via GLTFLoader
// Props are placed outside the arena boundary (radius > ARENA/2 + buffer)
// and cleared/replaced on level change.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// Cache loaded GLTFs so we don't re-fetch on level change
const _cache = new Map();

function loadGLTF(url) {
  if (_cache.has(url)) return _cache.get(url);
  const p = new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf), undefined, reject);
  });
  _cache.set(url, p);
  return p;
}

// ─── Per-level prop configs ───────────────────────────────────────────────────
// Each entry: { file, count, ring: [minR, maxR], scale: [min, max], yOffset }
// ring is distance from arena center; arena is 32 units wide so half = 16.
// Props go at radius 18–30 so they're clearly outside the play area.

const LEVEL_CONFIGS = [
  // Level 0 — Desert Dunes: cacti, rocks, palm trees
  [
    { file: 'cactus_tall.glb',    count: 8,  ring: [18, 26], scale: [1.2, 2.0], yOffset: 0 },
    { file: 'cactus_short.glb',   count: 6,  ring: [18, 24], scale: [1.0, 1.6], yOffset: 0 },
    { file: 'rock_largeA.glb',    count: 5,  ring: [19, 28], scale: [1.5, 2.5], yOffset: 0 },
    { file: 'rock_tallA.glb',     count: 4,  ring: [20, 27], scale: [1.2, 2.0], yOffset: 0 },
    { file: 'tree_palmBend.glb',  count: 4,  ring: [20, 28], scale: [1.5, 2.2], yOffset: 0 },
    { file: 'tree_palmShort.glb', count: 3,  ring: [18, 25], scale: [1.2, 1.8], yOffset: 0 },
    { file: 'rock_smallA.glb',    count: 8,  ring: [17, 22], scale: [0.8, 1.4], yOffset: 0 },
  ],
  // Level 1 — Porcelain Lab: rocks, mushrooms, stumps (indoor-ish)
  [
    { file: 'rock_largeB.glb',      count: 6,  ring: [18, 26], scale: [1.2, 2.0], yOffset: 0 },
    { file: 'rock_tallB.glb',       count: 4,  ring: [19, 27], scale: [1.0, 1.8], yOffset: 0 },
    { file: 'mushroom_redGroup.glb',count: 5,  ring: [17, 24], scale: [1.5, 2.5], yOffset: 0 },
    { file: 'mushroom_tanGroup.glb',count: 4,  ring: [18, 25], scale: [1.2, 2.0], yOffset: 0 },
    { file: 'stump_round.glb',      count: 5,  ring: [17, 23], scale: [1.0, 1.6], yOffset: 0 },
    { file: 'rock_smallB.glb',      count: 8,  ring: [17, 22], scale: [0.8, 1.4], yOffset: 0 },
    { file: 'plant_bush.glb',       count: 6,  ring: [17, 23], scale: [1.0, 1.8], yOffset: 0 },
  ],
  // Level 2 — Sewer Depths: logs, stumps, lily pads, mushrooms
  [
    { file: 'log_large.glb',        count: 5,  ring: [18, 26], scale: [1.2, 2.0], yOffset: 0 },
    { file: 'log.glb',              count: 4,  ring: [17, 23], scale: [0.8, 1.4], yOffset: 0 },
    { file: 'stump_old.glb',        count: 5,  ring: [18, 25], scale: [1.0, 1.8], yOffset: 0 },
    { file: 'mushroom_red.glb',     count: 6,  ring: [17, 24], scale: [1.2, 2.0], yOffset: 0 },
    { file: 'lily_large.glb',       count: 5,  ring: [17, 22], scale: [1.0, 1.8], yOffset: 0.05 },
    { file: 'lily_small.glb',       count: 6,  ring: [17, 21], scale: [0.8, 1.4], yOffset: 0.05 },
    { file: 'rock_largeA.glb',      count: 4,  ring: [19, 27], scale: [1.2, 2.0], yOffset: 0 },
  ],
  // Level 3 — Toxic Swamp: dead trees, mushrooms, grass, stumps, lily pads
  [
    { file: 'tree_thin_dark.glb',   count: 7,  ring: [18, 28], scale: [1.5, 2.5], yOffset: 0 },
    { file: 'tree_small_dark.glb',  count: 5,  ring: [19, 26], scale: [1.2, 2.0], yOffset: 0 },
    { file: 'mushroom_redGroup.glb',count: 6,  ring: [17, 24], scale: [1.5, 2.5], yOffset: 0 },
    { file: 'mushroom_tanGroup.glb',count: 4,  ring: [17, 23], scale: [1.2, 2.0], yOffset: 0 },
    { file: 'grass_large.glb',      count: 8,  ring: [17, 22], scale: [1.0, 1.8], yOffset: 0 },
    { file: 'lily_large.glb',       count: 6,  ring: [17, 22], scale: [1.2, 2.0], yOffset: 0.05 },
    { file: 'stump_old.glb',        count: 4,  ring: [18, 25], scale: [1.0, 1.6], yOffset: 0 },
  ],
  // Level 4 — Void Dimension: dark rocks, cliff blocks, dead trees
  [
    { file: 'cliff_block_rock.glb', count: 6,  ring: [18, 27], scale: [1.5, 2.5], yOffset: 0 },
    { file: 'cliff_large_rock.glb', count: 4,  ring: [20, 28], scale: [1.2, 2.0], yOffset: 0 },
    { file: 'rock_tallA.glb',       count: 5,  ring: [18, 26], scale: [1.2, 2.2], yOffset: 0 },
    { file: 'rock_tallB.glb',       count: 4,  ring: [19, 27], scale: [1.0, 1.8], yOffset: 0 },
    { file: 'tree_thin_dark.glb',   count: 6,  ring: [18, 28], scale: [1.5, 2.5], yOffset: 0 },
    { file: 'rock_largeB.glb',      count: 5,  ring: [19, 26], scale: [1.5, 2.5], yOffset: 0 },
  ],
];

// ─── Scenery manager ──────────────────────────────────────────────────────────
export function createScenery(scene, baseUrl = './assets/nature/') {
  let _props = [];   // { mesh } currently in scene
  let _loading = false;

  function clear() {
    for (const p of _props) scene.remove(p);
    _props = [];
  }

  // Place props for a given level index
  async function loadLevel(levelIdx) {
    clear();
    const cfg = LEVEL_CONFIGS[levelIdx] ?? LEVEL_CONFIGS[0];
    _loading = true;

    // Load all GLTFs for this level in parallel
    const promises = cfg.map(async (entry) => {
      const url = baseUrl + entry.file;
      try {
        const gltf = await loadGLTF(url);
        return { entry, gltf };
      } catch (e) {
        console.warn(`[scenery] failed to load ${entry.file}:`, e);
        return null;
      }
    });

    const results = await Promise.all(promises);
    _loading = false;

    for (const res of results) {
      if (!res) continue;
      const { entry, gltf } = res;
      const [minR, maxR] = entry.ring;
      const [minS, maxS] = entry.scale;

      for (let i = 0; i < entry.count; i++) {
        // Clone the scene so each instance is independent
        const obj = gltf.scene.clone(true);

        // Random angle, random radius in ring
        const angle = Math.random() * Math.PI * 2;
        const r = minR + Math.random() * (maxR - minR);
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const scale = minS + Math.random() * (maxS - minS);
        const rotY = Math.random() * Math.PI * 2;

        obj.position.set(x, entry.yOffset, z);
        obj.rotation.y = rotY;
        obj.scale.setScalar(scale);

        // Make props cast/receive shadows if renderer supports it
        obj.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = false;
          }
        });

        scene.add(obj);
        _props.push(obj);
      }
    }

    console.log(`[scenery] level ${levelIdx}: ${_props.length} props loaded`);
  }

  return { loadLevel, clear };
}
