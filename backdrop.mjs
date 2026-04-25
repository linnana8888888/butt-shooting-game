// backdrop.mjs — v8: 3D backdrop geometry per level (replaces skydome shader)
// Simple procedural geometry that matches each level's theme

import * as THREE from 'three';

export function createBackdrop(scene) {
  let _meshes = [];

  function clear() {
    for (const m of _meshes) {
      scene.remove(m);
      m.traverse(o => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) {
            o.material.forEach(mat => mat.dispose());
          } else {
            o.material.dispose();
          }
        }
      });
    }
    _meshes = [];
  }

  function addMesh(mesh) {
    scene.add(mesh);
    _meshes.push(mesh);
  }

  // Desert Dunes: distant mesas and rock formations
  function buildDesert() {
    clear();
    const mesaColor = 0xD4A574;
    const skyColor = 0xFF8C42;

    // Distant mesas (flat-top mountains)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 60 + Math.random() * 20;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      
      const width = 8 + Math.random() * 6;
      const height = 12 + Math.random() * 8;
      const depth = 6 + Math.random() * 4;
      
      const geo = new THREE.BoxGeometry(width, height, depth);
      const mat = new THREE.MeshLambertMaterial({ 
        color: mesaColor,
        flatShading: true,
      });
      const mesa = new THREE.Mesh(geo, mat);
      mesa.position.set(x, height / 2, z);
      mesa.rotation.y = Math.random() * Math.PI * 2;
      addMesh(mesa);
    }

    // Distant rock spires
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 30;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      
      const height = 6 + Math.random() * 10;
      const radius = 1.5 + Math.random() * 1.5;
      
      const geo = new THREE.CylinderGeometry(radius * 0.6, radius, height, 6);
      const mat = new THREE.MeshLambertMaterial({ 
        color: 0xC4956A,
        flatShading: true,
      });
      const spire = new THREE.Mesh(geo, mat);
      spire.position.set(x, height / 2, z);
      addMesh(spire);
    }
  }

  // Porcelain Lab: tiled walls and pipes
  function buildLab() {
    clear();
    const wallColor = 0xE8E4DC;
    const pipeColor = 0xB8B2A8;

    // Four walls forming a distant box
    const wallHeight = 20;
    const wallDist = 55;
    const wallThickness = 2;

    // North wall
    const northGeo = new THREE.BoxGeometry(wallDist * 2, wallHeight, wallThickness);
    const northMat = new THREE.MeshLambertMaterial({ color: wallColor });
    const north = new THREE.Mesh(northGeo, northMat);
    north.position.set(0, wallHeight / 2, -wallDist);
    addMesh(north);

    // South wall
    const south = new THREE.Mesh(northGeo, northMat);
    south.position.set(0, wallHeight / 2, wallDist);
    addMesh(south);

    // East wall
    const eastGeo = new THREE.BoxGeometry(wallThickness, wallHeight, wallDist * 2);
    const east = new THREE.Mesh(eastGeo, northMat);
    east.position.set(wallDist, wallHeight / 2, 0);
    addMesh(east);

    // West wall
    const west = new THREE.Mesh(eastGeo, northMat);
    west.position.set(-wallDist, wallHeight / 2, 0);
    addMesh(west);

    // Pipes along walls
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const dist = wallDist - 1;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      
      const pipeGeo = new THREE.CylinderGeometry(0.5, 0.5, wallHeight * 0.6, 8);
      const pipeMat = new THREE.MeshLambertMaterial({ color: pipeColor });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.position.set(x, wallHeight * 0.3, z);
      addMesh(pipe);
    }
  }

  // Sewer Depths: dripping pipes and dark walls
  function buildSewer() {
    clear();
    const wallColor = 0x2A3A2E;
    const pipeColor = 0x4A5A4E;

    // Circular tunnel walls
    const segments = 24;
    const tunnelRadius = 50;
    const tunnelHeight = 18;

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const nextAngle = ((i + 1) / segments) * Math.PI * 2;
      
      const x1 = Math.cos(angle) * tunnelRadius;
      const z1 = Math.sin(angle) * tunnelRadius;
      const x2 = Math.cos(nextAngle) * tunnelRadius;
      const z2 = Math.sin(nextAngle) * tunnelRadius;
      
      const segmentWidth = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
      const geo = new THREE.BoxGeometry(segmentWidth, tunnelHeight, 2);
      const mat = new THREE.MeshLambertMaterial({ color: wallColor });
      const segment = new THREE.Mesh(geo, mat);
      
      const midAngle = (angle + nextAngle) / 2;
      segment.position.set(
        Math.cos(midAngle) * tunnelRadius,
        tunnelHeight / 2,
        Math.sin(midAngle) * tunnelRadius
      );
      segment.rotation.y = midAngle + Math.PI / 2;
      addMesh(segment);
    }

    // Hanging pipes
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 35 + Math.random() * 10;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      
      const length = 8 + Math.random() * 6;
      const pipeGeo = new THREE.CylinderGeometry(0.4, 0.4, length, 8);
      const pipeMat = new THREE.MeshLambertMaterial({ color: pipeColor });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.position.set(x, tunnelHeight - length / 2, z);
      addMesh(pipe);
    }
  }

  // Toxic Swamp: dead trees and toxic fog barriers
  function buildSwamp() {
    clear();
    const treeColor = 0x3A2A1A;
    const fogColor = 0x4A6A2E;

    // Dead tree silhouettes in distance
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 45 + Math.random() * 20;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      
      const trunkHeight = 12 + Math.random() * 8;
      const trunkRadius = 0.8 + Math.random() * 0.6;
      
      const trunkGeo = new THREE.CylinderGeometry(trunkRadius * 0.7, trunkRadius, trunkHeight, 6);
      const trunkMat = new THREE.MeshLambertMaterial({ 
        color: treeColor,
        flatShading: true,
      });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, trunkHeight / 2, z);
      addMesh(trunk);

      // Bare branches
      const branchCount = 3 + Math.floor(Math.random() * 3);
      for (let b = 0; b < branchCount; b++) {
        const branchAngle = Math.random() * Math.PI * 2;
        const branchLength = 2 + Math.random() * 2;
        const branchY = trunkHeight * (0.5 + Math.random() * 0.3);
        
        const branchGeo = new THREE.CylinderGeometry(0.15, 0.25, branchLength, 4);
        const branch = new THREE.Mesh(branchGeo, trunkMat);
        branch.position.set(x, branchY, z);
        branch.rotation.z = Math.PI / 3 + Math.random() * 0.5;
        branch.rotation.y = branchAngle;
        addMesh(branch);
      }
    }

    // Toxic fog banks (translucent planes)
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 15;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      
      const width = 8 + Math.random() * 6;
      const height = 6 + Math.random() * 4;
      
      const fogGeo = new THREE.PlaneGeometry(width, height);
      const fogMat = new THREE.MeshBasicMaterial({ 
        color: fogColor,
        transparent: true,
        opacity: 0.3 + Math.random() * 0.2,
        side: THREE.DoubleSide,
      });
      const fog = new THREE.Mesh(fogGeo, fogMat);
      fog.position.set(x, height / 2 + 2, z);
      fog.rotation.y = angle;
      addMesh(fog);
    }
  }

  // Void Dimension: floating crystals and void portals
  function buildVoid() {
    clear();
    const crystalColor = 0x8844FF;
    const portalColor = 0x4400AA;

    // Floating crystal shards
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 25;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = 5 + Math.random() * 15;
      
      const height = 4 + Math.random() * 6;
      const radius = 0.8 + Math.random() * 0.8;
      
      const geo = new THREE.ConeGeometry(radius, height, 6);
      const mat = new THREE.MeshLambertMaterial({ 
        color: crystalColor,
        emissive: crystalColor,
        emissiveIntensity: 0.3,
        flatShading: true,
      });
      const crystal = new THREE.Mesh(geo, mat);
      crystal.position.set(x, y, z);
      crystal.rotation.x = Math.random() * Math.PI;
      crystal.rotation.z = Math.random() * Math.PI;
      addMesh(crystal);
    }

    // Void portal rings
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 55 + Math.random() * 15;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = 8 + Math.random() * 6;
      
      const outerRadius = 4 + Math.random() * 2;
      const innerRadius = outerRadius * 0.7;
      
      const ringGeo = new THREE.RingGeometry(innerRadius, outerRadius, 16);
      const ringMat = new THREE.MeshBasicMaterial({ 
        color: portalColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(x, y, z);
      ring.rotation.y = angle;
      addMesh(ring);

      // Portal center glow
      const glowGeo = new THREE.CircleGeometry(innerRadius * 0.9, 16);
      const glowMat = new THREE.MeshBasicMaterial({ 
        color: 0x6600CC,
        transparent: true,
        opacity: 0.4,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(ring.position);
      glow.rotation.copy(ring.rotation);
      addMesh(glow);
    }
  }

  function loadLevel(levelIdx) {
    switch (levelIdx) {
      case 0: buildDesert(); break;
      case 1: buildLab(); break;
      case 2: buildSewer(); break;
      case 3: buildSwamp(); break;
      case 4: buildVoid(); break;
      default: clear(); break;
    }
  }

  return { loadLevel, clear };
}
