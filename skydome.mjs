// skydome.mjs — gradient skydome shader

export class SkyDome {
  constructor(scene, THREE) {
    this._scene = scene;
    this._THREE = THREE;

    const vertexShader = /* glsl */`
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */`
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        float t = max(0.0, pow(max(0.0, h), exponent));
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `;

    this._material = new THREE.ShaderMaterial({
      uniforms: {
        topColor:    { value: new THREE.Color(0x7FC4E0) },
        bottomColor: { value: new THREE.Color(0xE8D7A8) },
        offset:      { value: 33.0 },
        exponent:    { value: 0.6 },
      },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const geo = new THREE.SphereGeometry(400, 32, 16);
    this._mesh = new THREE.Mesh(geo, this._material);
    this._mesh.name = 'skyDome';
    scene.add(this._mesh);
  }

  setColors(topHex, bottomHex) {
    this._material.uniforms.topColor.value.setHex(topHex);
    this._material.uniforms.bottomColor.value.setHex(bottomHex);
  }

  dispose() {
    this._scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    this._material.dispose();
  }
}
