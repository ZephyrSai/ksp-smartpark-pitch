/* ============================================================
   WĀHA 3D scenes — low-poly "claymation" park world (Three.js)
   One shared WebGL context is handed from slide to slide.
   ============================================================ */
(function () {
  const S = (window.WAHA_SCENES = { ready: false, scenes: {}, active: null });

  /* ---------- palette (mirrors DESIGN.md clay tokens) ---------- */
  const C = {
    pink: 0xff4d8b, teal: 0x2e6e63, tealDeep: 0x1a3a3a, lavender: 0xb8a4ed,
    peach: 0xffb084, ochre: 0xe8b94a, mint: 0xa4d4c5, coral: 0xff6b5a,
    cream: 0xf5f0e0, sand: 0xefe6cf, ink: 0x2a2a2a,
    grass: 0x8fbf8f, grassDeep: 0x6da879, leaf: 0x74b087, pine: 0x4e8a6a,
    water: 0x6fc2c9, trunk: 0xa8795a, white: 0xfffaf0,
    night: 0x16352f, nightPath: 0x59705e, warm: 0xffd9a0,
    wifi: 0x7fd1f0, amber: 0xf59e0b, green: 0x22c55e, red: 0xef4444
  };

  /* ---------- renderer (single shared context) ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  let currentMount = null;

  /* ---------- tiny helpers ---------- */
  const mat = (color, o = {}) =>
    new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.92, metalness: 0.02, flatShading: true }, o));

  function jitter(geo, amp) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i,
        p.getX(i) + (Math.sin(i * 12.9898) * 43758.5453 % 1) * amp - amp / 2,
        p.getY(i) + (Math.sin(i * 78.233) * 12578.1459 % 1) * amp - amp / 2,
        p.getZ(i) + (Math.sin(i * 39.425) * 26251.4569 % 1) * amp - amp / 2);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function mesh(geo, m, x = 0, y = 0, z = 0, cast = true, recv = false) {
    const ms = new THREE.Mesh(geo, m);
    ms.position.set(x, y, z);
    ms.castShadow = cast; ms.receiveShadow = recv;
    return ms;
  }

  function lights(scene, opts = {}) {
    const hemi = new THREE.HemisphereLight(opts.sky || 0xfff8ec, opts.ground || 0xcfc2a4, opts.hemi ?? 0.62);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(opts.sun || 0xffe9c4, opts.dir ?? 0.72);
    dir.position.set(opts.dx ?? 8, opts.dy ?? 14, opts.dz ?? 6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const d = opts.shadowSpan ?? 14;
    dir.shadow.camera.left = -d; dir.shadow.camera.right = d;
    dir.shadow.camera.top = d; dir.shadow.camera.bottom = -d;
    dir.shadow.camera.far = 60;
    dir.shadow.bias = -0.0005;
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0xffffff, opts.amb ?? 0.12));
    return { hemi, dir };
  }

  function makeTree(kind, s = 1) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.09 * s, 0.13 * s, 0.5 * s, 6), mat(C.trunk), 0, 0.25 * s, 0);
    g.add(trunk);
    if (kind === 'pine') {
      g.add(mesh(new THREE.ConeGeometry(0.45 * s, 0.7 * s, 7), mat(C.pine), 0, 0.75 * s, 0));
      g.add(mesh(new THREE.ConeGeometry(0.33 * s, 0.55 * s, 7), mat(C.pine), 0, 1.15 * s, 0));
    } else if (kind === 'palm') {
      trunk.geometry = new THREE.CylinderGeometry(0.07 * s, 0.11 * s, 1.1 * s, 6);
      trunk.position.y = 0.55 * s;
      for (let i = 0; i < 5; i++) {
        const frond = mesh(new THREE.BoxGeometry(0.75 * s, 0.05 * s, 0.2 * s), mat(C.leaf), 0, 1.12 * s, 0);
        frond.geometry.translate(0.34 * s, 0, 0);
        frond.rotation.y = (i / 5) * Math.PI * 2;
        frond.rotation.z = -0.35;
        g.add(frond);
      }
    } else {
      const blob = mesh(jitter(new THREE.IcosahedronGeometry(0.42 * s, 0), 0.05 * s),
        mat(kind === 'mint' ? C.mint : C.leaf), 0, 0.72 * s, 0);
      g.add(blob);
    }
    return g;
  }

  function makeLamp(s = 1, glow = C.warm) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.03 * s, 0.045 * s, 0.9 * s, 5), mat(0x555f5c), 0, 0.45 * s, 0));
    const bulb = mesh(new THREE.SphereGeometry(0.09 * s, 8, 6), new THREE.MeshBasicMaterial({ color: glow }), 0, 0.94 * s, 0, false);
    g.add(bulb);
    g.userData.bulb = bulb;
    return g;
  }

  function ringPulse(color, y = 0.06) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    r.rotation.x = -Math.PI / 2;
    r.position.y = y;
    r.userData.t = 0;
    return r;
  }
  function stepRings(list, dt, speed = 1.6, max = 2.6) {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      r.userData.t += dt * speed;
      const k = r.userData.t;
      r.scale.setScalar(1 + k * max);
      r.material.opacity = Math.max(0, 0.9 - k);
      if (k > 1) { r.parent && r.parent.remove(r); list.splice(i, 1); }
    }
  }

  function makeWorker(color = C.coral) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.34, 8), mat(color), 0, 0.24, 0));
    g.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), mat(0xffd7b0), 0, 0.52, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.05, 8), mat(C.ochre), 0, 0.60, 0)); // hard hat brim
    g.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(C.ochre), 0, 0.62, 0));
    return g;
  }

  function beamBetween(a, b, color, radius = 0.03, opacity = 0.55) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return m;
  }

  // unit-height cylinder stretched between two points (reusable, re-aimable)
  function unitBeam(color, radius = 0.03, opacity = 0.55) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
    m.userData.aim = (a, b) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      m.scale.set(1, dir.length(), 1);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    };
    return m;
  }

  /* ---------- mini orbit rig ---------- */
  function orbitRig(cam, opts = {}) {
    const rig = {
      theta: opts.theta ?? 0.6, phi: opts.phi ?? 1.05, r: opts.r ?? 14,
      target: opts.target || new THREE.Vector3(0, 0.6, 0),
      auto: opts.auto ?? 0.10, dragging: false, enabled: true,
      sway: opts.sway ?? 0, baseTheta: opts.theta ?? 0.6, _t: 0,
      minPhi: 0.25, maxPhi: 1.35,
      apply() {
        cam.position.set(
          rig.target.x + rig.r * Math.sin(rig.phi) * Math.sin(rig.theta),
          rig.target.y + rig.r * Math.cos(rig.phi),
          rig.target.z + rig.r * Math.sin(rig.phi) * Math.cos(rig.theta));
        cam.lookAt(rig.target);
      },
      update(dt) {
        if (rig.enabled && !rig.dragging) {
          if (rig.sway) { rig._t += dt; rig.theta = rig.baseTheta + Math.sin(rig._t * 0.3) * rig.sway; }
          else rig.theta += rig.auto * dt;
        }
        rig.apply();
      },
      drag(dx, dy) {
        if (!rig.enabled) return;
        rig.theta -= dx * 0.006;
        rig.baseTheta = rig.theta;
        rig.phi = Math.min(rig.maxPhi, Math.max(rig.minPhi, rig.phi - dy * 0.004));
      }
    };
    rig.apply();
    return rig;
  }

  /* ---------- shared pointer routing ---------- */
  let downPos = null, moved = 0;
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downPos = [e.clientX, e.clientY]; moved = 0;
    if (S.active && S.active.rig) S.active.rig.dragging = true;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!downPos) return;
    moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (S.active && S.active.rig && S.active.rig.dragging) S.active.rig.drag(e.movementX, e.movementY);
  });
  window.addEventListener('pointerup', (e) => {
    if (S.active && S.active.rig) S.active.rig.dragging = false;
    if (downPos && moved < 6 && S.active && S.active.onClick && currentMount) {
      const r = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
      S.active.onClick(nx, ny);
    }
    downPos = null;
  });

  /* ============================================================
     SCENE FACTORIES
     ============================================================ */

  /* ---------- 0 · HERO — living park island ---------- */
  function heroScene(dusk = false) {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const L = lights(scene, dusk
      ? { sun: 0xffb084, sky: 0xf3e0ff, ground: 0xc9a58c, dir: 1.0, hemi: 0.7 }
      : {});
    const rig = orbitRig(cam, { r: 13.5, phi: 1.02, theta: 0.5, target: new THREE.Vector3(0, 0.5, 0) });

    // island
    const island = mesh(jitter(new THREE.CylinderGeometry(5.2, 5.7, 0.8, 24, 2), 0.06), mat(C.grass), 0, -0.4, 0, false, true);
    scene.add(island);
    const under = mesh(new THREE.CylinderGeometry(5.0, 3.4, 1.6, 24), mat(0xcbb287), 0, -1.55, 0, false);
    scene.add(under);

    // pond
    const pond = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 20), mat(C.water, { roughness: 0.35 }), 2.1, 0.02, 1.3, false);
    scene.add(pond);

    // path
    const path = mesh(new THREE.TorusGeometry(2.9, 0.3, 6, 40), mat(C.sand), 0, 0.03, 0, false, true);
    path.rotation.x = -Math.PI / 2; path.scale.y = 0.75;
    scene.add(path);

    // trees
    const treeSpots = [[-2.6, -1.6, 'blob', 1.4], [-1.4, -3.0, 'pine', 1.2], [-3.4, 0.8, 'palm', 1.3],
      [0.6, -3.4, 'mint', 1.1], [3.4, -1.4, 'blob', 1.0], [-0.8, 3.4, 'pine', 1.5],
      [1.2, 3.6, 'mint', 1.0], [-3.2, 2.4, 'blob', 0.9], [4.0, 0.9, 'palm', 1.1]];
    treeSpots.forEach(([x, z, k, s]) => { const t = makeTree(k, s); t.position.set(x, 0, z); t.traverse(o => o.castShadow = true); scene.add(t); });

    // kiosk
    const kiosk = new THREE.Group();
    kiosk.add(mesh(new THREE.BoxGeometry(1.1, 0.7, 0.9), mat(C.cream), 0, 0.35, 0));
    kiosk.add(mesh(new THREE.ConeGeometry(0.85, 0.5, 4), mat(dusk ? C.lavender : C.peach), 0, 0.95, 0));
    kiosk.position.set(-1.2, 0, 1.6); kiosk.rotation.y = 0.5;
    kiosk.traverse(o => o.castShadow = true);
    scene.add(kiosk);

    // lamps
    [[1.0, -1.9], [-2.9, -0.5], [2.6, 2.6]].forEach(([x, z]) => { const l = makeLamp(1, dusk ? 0xffc46b : C.warm); l.position.set(x, 0, z); scene.add(l); });

    // drone with scan cone
    const drone = new THREE.Group();
    drone.add(mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), mat(C.ink)));
    for (let i = 0; i < 4; i++) {
      const rot = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.02, 8), mat(0x888888), Math.cos(i * Math.PI / 2 + Math.PI / 4) * 0.26, 0.07, Math.sin(i * Math.PI / 2 + Math.PI / 4) * 0.26);
      drone.add(rot);
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.5, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: dusk ? C.lavender : C.wifi, transparent: true, opacity: 0.16, depthWrite: false }));
    cone.position.y = -0.8; cone.rotation.x = Math.PI;
    drone.add(cone);
    scene.add(drone);

    // clouds
    const clouds = [];
    for (let i = 0; i < 3; i++) {
      const cl = new THREE.Group();
      for (let j = 0; j < 3; j++) cl.add(mesh(jitter(new THREE.IcosahedronGeometry(0.4 + j * 0.14, 0), 0.05), mat(0xffffff, { roughness: 1 }), j * 0.5 - 0.4, 0, 0, false));
      cl.position.set(-4 + i * 4.2, 3.4 + i * 0.5, -2.5 + i * 1.6);
      cl.userData.v = 0.12 + i * 0.05;
      clouds.push(cl); scene.add(cl);
    }

    // sensing pips
    const rings = [];
    let pipT = 0;

    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        drone.position.set(Math.cos(t * 0.4) * 4.6, 2.6 + Math.sin(t * 1.3) * 0.22, Math.sin(t * 0.4) * 4.6);
        drone.rotation.y = -t * 0.4 + Math.PI / 2;
        clouds.forEach(cl => { cl.position.x += cl.userData.v * dt; if (cl.position.x > 7) cl.position.x = -7; });
        pipT -= dt;
        if (pipT <= 0) {
          pipT = 2.6 + Math.random() * 2;
          const a = Math.random() * Math.PI * 2, rr = 1 + Math.random() * 3.4;
          const ring = ringPulse([C.pink, C.ochre, C.wifi, C.mint][Math.floor(Math.random() * 4)], 0.08);
          ring.position.set(Math.cos(a) * rr, 0.08, Math.sin(a) * rr);
          scene.add(ring); rings.push(ring);
        }
        stepRings(rings, dt, 1.4, 2.2);
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- 1 · CANVAS — district massing ---------- */
  function canvasScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    lights(scene, { shadowSpan: 12 });
    const rig = orbitRig(cam, { r: 15, phi: 0.92, theta: -0.5, auto: 0.09, target: new THREE.Vector3(0, 0.2, 0) });

    const plate = mesh(new THREE.CylinderGeometry(6.4, 6.8, 0.6, 10), mat(C.sand), 0, -0.3, 0, false, true);
    scene.add(plate);

    const districts = [
      { x: -2.4, z: -1.6, w: 3.4, d: 2.6, h: 0.24, c: C.grassDeep },   // north meadow
      { x: 1.9, z: -2.2, w: 2.6, d: 1.9, h: 0.5, c: C.mint },          // gardens
      { x: 3.0, z: 0.6, w: 2.0, d: 2.4, h: 0.9, c: C.lavender },       // royal arts complex
      { x: -3.0, z: 1.8, w: 2.4, d: 2.2, h: 0.4, c: C.ochre },         // cultural / souq
      { x: 0.2, z: 2.9, w: 2.6, d: 1.6, h: 0.3, c: C.peach },          // promenade
      { x: -0.2, z: 0.4, w: 1.8, d: 1.4, h: 0.14, c: C.water }         // central wadi lake
    ];
    districts.forEach(d => {
      const b = mesh(new THREE.BoxGeometry(d.w, d.h, d.d), mat(d.c, d.c === C.water ? { roughness: 0.3 } : {}), d.x, d.h / 2, d.z, true, true);
      scene.add(b);
    });
    // wadi ribbon
    for (let i = 0; i < 7; i++) {
      const seg = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 10), mat(C.water, { roughness: 0.3 }),
        -0.2 + Math.sin(i * 0.9) * 1.1, 0.06, 0.4 + (i - 3) * 0.75, false);
      scene.add(seg);
    }
    // trees sprinkled
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 3.6;
      const t = makeTree(['blob', 'pine', 'mint'][i % 3], 0.7 + Math.random() * 0.5);
      t.position.set(Math.cos(a) * r, 0.15, Math.sin(a) * r);
      t.traverse(o => o.castShadow = true);
      scene.add(t);
    }
    // metro line arc
    const metro = new THREE.Group();
    const curvePts = [];
    for (let i = 0; i <= 30; i++) { const a = -0.7 + i / 30 * 2.2; curvePts.push(new THREE.Vector3(Math.cos(a) * 5.6, 0.12, Math.sin(a) * 5.6)); }
    const metroCurve = new THREE.CatmullRomCurve3(curvePts);
    metro.add(new THREE.Mesh(new THREE.TubeGeometry(metroCurve, 40, 0.06, 5), mat(C.ink)));
    for (let i = 0; i < 5; i++) {
      const p = metroCurve.getPoint(i / 4);
      metro.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8), mat(C.pink), p.x, 0.15, p.z));
    }
    scene.add(metro);
    const train = mesh(new THREE.BoxGeometry(0.5, 0.16, 0.2), mat(C.teal));
    scene.add(train);

    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        const k = (t * 0.05) % 1;
        const p = metroCurve.getPoint(k), p2 = metroCurve.getPoint((k + 0.01) % 1);
        train.position.set(p.x, 0.22, p.z);
        train.lookAt(p2.x, 0.22, p2.z);
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- 2 · SILOS — disconnected towers ---------- */
  // the operational core (first 8) plus the venue long tail — BMS, access, ticketing, fire
  const SILO_DEFS = [
    { c: 0x59c9a5, label: 'IRR' }, { c: C.ochre, label: 'LGT' }, { c: C.coral, label: 'PAVA' },
    { c: C.lavender, label: 'PRK' }, { c: C.wifi, label: 'WIFI' }, { c: C.pink, label: 'CCTV' },
    { c: C.amber, label: 'INC' }, { c: C.mint, label: 'OPS' },
    { c: 0x7f9fc7, label: 'BMS' }, { c: 0xc78fb3, label: 'ACC' },
    { c: 0x9fd08f, label: 'TKT' }, { c: 0xb35a4a, label: 'FIRE' }
  ];
  function makeTower(color, h = 1.6) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.9, h * 0.55, 0.9), mat(C.cream), 0, h * 0.275, 0));
    g.add(mesh(new THREE.BoxGeometry(0.72, h * 0.35, 0.72), mat(color), 0, h * 0.72, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), mat(C.ink), 0, h * 0.9 + 0.25, 0));
    const beacon = mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: C.red }), 0, h * 0.9 + 0.52, 0, false);
    g.add(beacon);
    g.userData.beacon = beacon;
    return g;
  }
  function silosScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    lights(scene, { shadowSpan: 12 });
    const rig = orbitRig(cam, { r: 15, phi: 1.0, theta: 0.35, auto: 0.06, target: new THREE.Vector3(0, 0.4, 0) });
    const towers = [];
    const rings = [];
    SILO_DEFS.forEach((d, i) => {
      const gx = (i % 4) - 1.5, gz = Math.floor(i / 4) - 1;
      const island = mesh(jitter(new THREE.CylinderGeometry(1.05, 1.25, 0.5, 9), 0.04), mat(C.grass), gx * 2.9, -0.25, gz * 3.4, false, true);
      scene.add(island);
      const tw = makeTower(d.c);
      tw.position.set(gx * 2.9, 0, gz * 3.4);
      tw.userData.phase = Math.random() * Math.PI * 2;
      tw.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial) o.castShadow = true; });
      scene.add(tw); towers.push(tw);
      // little fence posts to show isolation
      for (let f = 0; f < 6; f++) {
        const a = f / 6 * Math.PI * 2;
        scene.add(mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), mat(0xb9ab8d), gx * 2.9 + Math.cos(a) * 1.0, 0.11, gz * 3.4 + Math.sin(a) * 1.0));
      }
    });
    let alarmT = 0.8;
    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        towers.forEach(tw => {
          const on = Math.sin(t * 5 + tw.userData.phase) > 0.2;
          tw.userData.beacon.material.color.setHex(on ? C.red : 0x5a3a3a);
        });
        alarmT -= dt;
        if (alarmT <= 0) {
          alarmT = 1.6 + Math.random() * 1.6;
          const tw = towers[Math.floor(Math.random() * towers.length)];
          const ring = ringPulse(C.red, 0.05);
          ring.position.set(tw.position.x, 0.05, tw.position.z);
          scene.add(ring); rings.push(ring);
        }
        stepRings(rings, dt, 1.5, 2.0);
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- 3 · UNIFY — towers around a core ---------- */
  function unifyScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    lights(scene, { shadowSpan: 12 });
    const rig = orbitRig(cam, { r: 15, phi: 1.0, theta: 0.2, auto: 0.12, target: new THREE.Vector3(0, 1.0, 0) });

    const plate = mesh(new THREE.CylinderGeometry(6.6, 7.0, 0.5, 12), mat(C.sand), 0, -0.25, 0, false, true);
    scene.add(plate);

    // core
    const core = mesh(jitter(new THREE.IcosahedronGeometry(0.85, 1), 0.04), mat(C.pink, { emissive: C.pink, emissiveIntensity: 0.35, roughness: 0.6 }), 0, 1.8, 0);
    scene.add(core);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.045, 8, 40), mat(C.ochre, { emissive: C.ochre, emissiveIntensity: 0.4 }));
    halo.position.y = 1.8;
    scene.add(halo);
    scene.add(mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.3, 8), mat(C.cream), 0, 0.65, 0));

    const pulses = [];
    const towerTops = [];
    SILO_DEFS.forEach((d, i) => {
      const a = i / SILO_DEFS.length * Math.PI * 2;
      const x = Math.cos(a) * 5.3, z = Math.sin(a) * 5.3;
      const tw = makeTower(d.c, 1.35);
      tw.position.set(x, 0, z);
      tw.userData.beacon.material.color.setHex(C.green);
      tw.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial) o.castShadow = true; });
      scene.add(tw);
      const top = new THREE.Vector3(x, 1.35, z);
      towerTops.push({ top, color: d.c });
      scene.add(beamBetween(top, new THREE.Vector3(0, 1.8, 0), d.c, 0.022, 0.4));
    });

    let spawnT = 0;
    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        core.rotation.y = t * 0.6; core.rotation.x = Math.sin(t * 0.5) * 0.2;
        core.scale.setScalar(1 + Math.sin(t * 2.2) * 0.05);
        halo.rotation.x = Math.PI / 2 + Math.sin(t * 0.8) * 0.25;
        halo.rotation.z = t * 0.5;
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = 0.34;
          const src = towerTops[Math.floor(Math.random() * towerTops.length)];
          const up = Math.random() > 0.3; // data up vs control down
          const p = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5),
            new THREE.MeshBasicMaterial({ color: up ? src.color : 0xffffff }));
          p.userData = { from: up ? src.top : new THREE.Vector3(0, 1.8, 0), to: up ? new THREE.Vector3(0, 1.8, 0) : src.top, k: 0 };
          scene.add(p); pulses.push(p);
        }
        for (let i = pulses.length - 1; i >= 0; i--) {
          const p = pulses[i];
          p.userData.k += dt * 0.9;
          p.position.lerpVectors(p.userData.from, p.userData.to, Math.min(1, p.userData.k));
          if (p.userData.k >= 1) { scene.remove(p); pulses.splice(i, 1); }
        }
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- 4 · STACK — architecture layers ---------- */
  function stackScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    lights(scene, { shadowSpan: 12 });
    const rig = orbitRig(cam, { r: 13.5, phi: 1.08, theta: 0.5, auto: 0.08, target: new THREE.Vector3(0, 2.1, 0) });

    const defs = [
      { c: C.peach, w: 5.6, label: 'field' },
      { c: C.mint, w: 4.9, label: 'translator' },
      { c: C.ochre, w: 4.2, label: 'data' },
      { c: C.lavender, w: 3.5, label: 'ai' },
      { c: C.pink, w: 2.8, label: 'experience' }
    ];
    const slabs = defs.map((d, i) => {
      const s = mesh(new THREE.BoxGeometry(d.w, 0.42, d.w * 0.62), mat(d.c), 0, i * 1.05, 0, true, true);
      s.userData = { baseY: i * 1.05, i };
      scene.add(s);
      return s;
    });
    // tiny devices on the field slab
    [['blob', -2.2, 0.7], ['pine', -1.2, -1.0], ['mint', 2.1, 0.9]].forEach(([k, x, z]) => {
      const t = makeTree(k, 0.55); t.position.set(x, 0.21, z); slabs[0].add(t);
    });
    [[-0.3, 0.9, C.pink], [1.3, -0.8, C.wifi], [2.3, -0.2, C.coral]].forEach(([x, z, c]) => {
      slabs[0].add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat(c), x, 0.36, z));
    });
    // experience slab: little screen
    const screen = mesh(new THREE.BoxGeometry(1.1, 0.7, 0.08), mat(C.tealDeep, { emissive: 0x1f5f52, emissiveIntensity: 0.6 }), 0, 0.75, 0);
    slabs[4].add(screen);

    // corner rails + pulses
    const pulses = [];
    let spawnT = 0;
    let selected = -1;
    S.setLayer = (i) => { selected = i; };

    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        slabs.forEach((s, i) => {
          s.position.y = s.userData.baseY + Math.sin(t * 1.1 + i * 0.7) * 0.06;
          const isSel = selected === i;
          const target = isSel ? 1.14 : (selected === -1 ? 1 : 0.94);
          s.scale.x += (target - s.scale.x) * dt * 6;
          s.scale.z = s.scale.x;
          const em = isSel ? 0.22 : 0.0;
          s.material.emissive = new THREE.Color(defs[i].c);
          s.material.emissiveIntensity += (em - s.material.emissiveIntensity) * dt * 6;
        });
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = 0.4;
          const up = Math.random() > 0.35;
          const cx = [-1.15, 1.15][Math.floor(Math.random() * 2)];
          const cz = [-0.7, 0.7][Math.floor(Math.random() * 2)];
          const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5),
            new THREE.MeshBasicMaterial({ color: up ? 0xe8b94a : 0xff4d8b }));
          p.userData = { up, x: cx, z: cz, y: up ? -0.2 : 4.4 };
          scene.add(p); pulses.push(p);
        }
        for (let i = pulses.length - 1; i >= 0; i--) {
          const p = pulses[i];
          p.userData.y += (p.userData.up ? 1 : -1) * dt * 1.7;
          p.position.set(p.userData.x, p.userData.y, p.userData.z);
          if (p.userData.y > 4.6 || p.userData.y < -0.4) { scene.remove(p); pulses.splice(i, 1); }
        }
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- 5 · OPS — single pane of glass (interactive) ---------- */
  // titles carry the POI indices (into POIS) they can plausibly occur at,
  // so the zone chip always matches the alert text
  const ALERT_TYPES = [
    { k: 'irrigation', color: 0x59c9a5, icon: '💧', name: 'Irrigation', titles: [{ t: 'Line pressure drop — Valve W-214', p: [0, 1] }, { t: 'Flow anomaly — Zone G3 drip line', p: [1, 6] }], auto: true },
    { k: 'lighting', color: 0xe8b94a, icon: '💡', name: 'Lighting', titles: [{ t: 'Ballast fault — Promenade L-88', p: [8] }, { t: 'Feeder pillar offline — East Loop', p: [2, 9] }], auto: true },
    { k: 'pava', color: 0xff6b5a, icon: '📢', name: 'PAVA', titles: [{ t: 'Amplifier offline — PAVA Zone 4', p: [5, 2] }, { t: 'Speaker line fault — Wadi South', p: [7] }], auto: false },
    { k: 'parking', color: 0xb8a4ed, icon: '🅿️', name: 'Parking', titles: [{ t: 'Lot P3 at 92% — reroute advised', p: [4] }, { t: 'Barrier stuck — Gate 5 entry', p: [4, 5] }], auto: true },
    { k: 'wifi', color: 0x7fd1f0, icon: '📶', name: 'Wi-Fi', titles: [{ t: 'AP degraded — Event Lawn', p: [2] }, { t: 'Backhaul latency — Garden Node 12', p: [1, 8] }], auto: true },
    { k: 'cctv', color: 0xff4d8b, icon: '📹', name: 'CCTV', titles: [{ t: 'Camera offline — Gate 5', p: [5] }, { t: 'Video loss — Promenade Cam 31', p: [8, 9] }], auto: false },
    { k: 'incident', color: 0xf59e0b, icon: '⚠️', name: 'Incident', titles: [{ t: 'Crowd build-up — Fountain Plaza', p: [6] }, { t: 'Unattended object — Arts Complex', p: [3] }], auto: false },
    { k: 'ops', color: 0xa4d4c5, icon: '🌿', name: 'Park ops', titles: [{ t: 'Bin cluster full — Oasis Garden', p: [1] }, { t: 'Turf trimming due — North Meadow', p: [0] }], auto: false }
  ];
  // positions follow the real masterplan: circular core (ring radius 8),
  // wadi through the middle, parking outside the loop to the SE
  const POIS = [
    { x: -2.6, z: -4.4, zone: 'North Meadow' }, { x: 2.6, z: -4.2, zone: 'Oasis Garden' },
    { x: 4.9, z: -1.6, zone: 'Event Lawn' }, { x: 4.6, z: 1.9, zone: 'Arts Complex' },
    { x: 8.3, z: 5.4, zone: 'Parking P3' }, { x: 0.4, z: 7.9, zone: 'South Gate' },
    { x: -4.4, z: 3.0, zone: 'Fountain Plaza' }, { x: -0.3, z: -0.4, zone: 'Central Wadi' },
    { x: -7.9, z: 0.6, zone: 'West Promenade' }, { x: 2.3, z: 4.7, zone: 'Palm Walk' }
  ];

  function opsScene() {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a1a1a, 42, 95);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 160);
    const L = lights(scene, { sky: 0x9fd8cf, ground: 0x0a2a24, sun: 0xbfe8ff, dir: 0.55, hemi: 0.5, amb: 0.22, dx: 12, dy: 26, dz: 8, shadowSpan: 18 });

    // --- masterplan terrain: circular core + glowing loop + city grid ---
    const RING = 8;
    scene.add(mesh(new THREE.BoxGeometry(30, 0.6, 26), mat(0x111f22), 0, -0.3, 0, false, true));

    // surrounding city blocks (instanced), sparse warm-lit ones like the night render
    const CITY = [];
    for (let gx = -14; gx <= 14; gx++) for (let gz = -11; gz <= 11; gz++) {
      const x = gx * 1.02 + (Math.random() - 0.5) * 0.22, z = gz * 1.02 + (Math.random() - 0.5) * 0.22;
      const r = Math.hypot(x, z);
      if (r < RING + 1.7) continue;                       // park + loop stays clear
      if (Math.abs(x) > 14.2 || Math.abs(z) > 12.2) continue;
      if (z < -(RING - 1) && Math.abs(x - 0.3) < 3.6) continue; // golf finger stays green
      if (Math.random() < 0.24) continue;
      CITY.push({ x, z, h: 0.18 + Math.random() * (r > 11.5 ? 0.8 : 0.45), warm: Math.random() < 0.16 });
    }
    const cityMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.72, 1, 0.72),
      new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), CITY.length);
    {
      const d = new THREE.Object3D();
      const cA = new THREE.Color(0x223038), cB = new THREE.Color(0x2a3a44), cW = new THREE.Color(0x4c402a);
      CITY.forEach((b, i) => {
        d.position.set(b.x, b.h / 2, b.z);
        d.scale.set(1, b.h, 1);
        d.updateMatrix();
        cityMesh.setMatrixAt(i, d.matrix);
        cityMesh.setColorAt(i, b.warm ? cW : (Math.random() < 0.5 ? cA : cB));
      });
      scene.add(cityMesh);
    }

    // radial avenues, warm-lit like the reference render
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + 0.35;
      const len = 9;
      const road = mesh(new THREE.BoxGeometry(0.34, 0.05, len),
        mat(0x6a5636, { emissive: 0x8a6a30, emissiveIntensity: 0.55 }),
        Math.cos(a) * (RING + len / 2 - 0.4), 0.05, Math.sin(a) * (RING + len / 2 - 0.4), false);
      road.rotation.y = -a + Math.PI / 2;
      scene.add(road);
    }

    // park core
    scene.add(mesh(new THREE.CylinderGeometry(RING - 0.1, RING - 0.1, 0.24, 64), mat(0x1d4a3a), 0, 0.12, 0, false, true));
    // meadow / garden patches
    [[-2.6, -4.2, 2.3, 0x27584a], [2.8, -3.8, 2.0, 0x235444], [4.8, -1.4, 1.8, 0x2a5c48],
     [-4.3, 2.8, 2.1, 0x235141], [2.2, 4.4, 1.7, 0x27584a], [-5.6, -1.6, 1.6, 0x224f40]].forEach(([x, z, r2, c]) => {
      scene.add(mesh(new THREE.CylinderGeometry(r2, r2, 0.1, 18), mat(c), x, 0.24, z, false, true));
    });
    // the Loop — glowing ring promenade around the core
    const loop = new THREE.Mesh(new THREE.TorusGeometry(RING, 0.26, 8, 96),
      mat(0xe8b94a, { emissive: 0xcf9a30, emissiveIntensity: 0.7 }));
    loop.rotation.x = Math.PI / 2;
    loop.position.y = 0.26;
    loop.scale.z = 0.35;
    scene.add(loop);
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * Math.PI * 2;
      scene.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
        Math.cos(a) * RING, 0.44, Math.sin(a) * RING, false));
    }

    // wadi — winding water ribbon with lakes through the core
    const wadiCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.2, 0, -6.4), new THREE.Vector3(0.8, 0, -3.4), new THREE.Vector3(-0.9, 0, -0.6),
      new THREE.Vector3(0.6, 0, 2.2), new THREE.Vector3(-0.6, 0, 4.6), new THREE.Vector3(0.9, 0, 6.6)]);
    const wadiMat = mat(0x2e7f86, { roughness: 0.3, emissive: 0x11555c, emissiveIntensity: 0.55 });
    const wadi = new THREE.Mesh(new THREE.TubeGeometry(wadiCurve, 60, 0.42, 7), wadiMat);
    wadi.scale.y = 0.22;
    wadi.position.y = 0.27;
    scene.add(wadi);
    [[-0.9, -0.6, 1.2], [0.6, 2.2, 0.95], [-1.2, -6.1, 0.75]].forEach(([x, z, r2]) => {
      scene.add(mesh(new THREE.CylinderGeometry(r2, r2, 0.12, 20), wadiMat, x, 0.26, z, false));
    });

    // golf finger reaching north, as in the masterplan
    const golf = mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.18, 24), mat(0x275c42), 0.3, 0.09, -9.7, false, true);
    golf.scale.set(1.15, 1, 1.3);
    scene.add(golf);
    for (let i = 0; i < 6; i++) {
      const t = makeTree(['pine', 'blob', 'mint'][i % 3], 0.5 + Math.random() * 0.4);
      t.position.set(-1.6 + Math.random() * 3.6, 0.14, -12 + Math.random() * 4);
      t.traverse(o => o.castShadow = true);
      scene.add(t);
    }

    // arts complex landmark inside the ring (east)
    const arts = new THREE.Group();
    arts.add(mesh(new THREE.BoxGeometry(1.8, 0.9, 1.4), mat(C.lavender), 0, 0.45, 0));
    arts.add(mesh(new THREE.ConeGeometry(0.95, 0.6, 4), mat(0xd9cef5), 0, 1.2, 0));
    arts.position.set(4.6, 0.24, 1.9);
    arts.rotation.y = 0.4;
    arts.traverse(o => o.castShadow = true);
    scene.add(arts);
    // depot (crew base) outside the loop, west
    const depot = new THREE.Group();
    depot.add(mesh(new THREE.BoxGeometry(1.5, 0.7, 1.1), mat(C.coral), 0, 0.35, 0));
    depot.add(mesh(new THREE.BoxGeometry(1.7, 0.12, 1.3), mat(C.cream), 0, 0.76, 0));
    depot.position.set(-10.8, 0.1, 4.8);
    depot.traverse(o => o.castShadow = true);
    scene.add(depot);
    const DEPOT = new THREE.Vector3(-10.8, 0, 4.0);

    // parking plot outside the loop (SE) with cars
    scene.add(mesh(new THREE.BoxGeometry(3.4, 0.1, 2.6), mat(0x1c242c), 8.3, 0.06, 5.4, false, true));
    for (let cx = 0; cx < 4; cx++) for (let cz = 0; cz < 3; cz++) {
      if (Math.random() < 0.3) continue;
      scene.add(mesh(new THREE.BoxGeometry(0.44, 0.16, 0.26),
        mat([C.cream, C.wifi, C.coral, C.lavender, 0x8899aa][Math.floor(Math.random() * 5)]),
        7.3 + cx * 0.68, 0.19, 4.7 + cz * 0.68));
    }

    // park trees, kept off the wadi / landmark / meadow paths
    for (let i = 0; i < 85; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * (RING - 0.9);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (Math.abs(x) < 1.5 && Math.abs(z) < 7) continue;              // wadi corridor
      if (Math.hypot(x - 4.6, z - 1.9) < 1.7) continue;                // arts complex
      const t = makeTree(['blob', 'pine', 'mint', 'palm'][Math.floor(Math.random() * 4)], 0.5 + Math.random() * 0.55);
      t.position.set(x, 0.24, z);
      t.traverse(o => o.castShadow = true);
      scene.add(t);
    }
    // palm walk row toward the south gate
    for (let i = 0; i < 5; i++) {
      const p = makeTree('palm', 0.75);
      p.position.set(2.1 + (i % 2) * 0.5, 0.24, 3.4 + i * 0.85);
      p.traverse(o => o.castShadow = true);
      scene.add(p);
    }
    // lamps sprinkled inside the core
    [[-3.4, -2.2], [3.2, -2.8], [1.8, 1.2], [-2.8, 4.2], [-5.9, 0.8], [4.9, 3.9]].forEach(([x, z]) => {
      const l = makeLamp(0.9, 0xffd9a0);
      l.position.set(x, 0.24, z);
      scene.add(l);
    });

    // --- camera rig + 2D/3D toggle ---
    const rig = orbitRig(cam, { r: 26, phi: 0.92, theta: 0.35, auto: 0.05, target: new THREE.Vector3(0, 0, 0) });
    let mode3D = true, camBlend = 1; // 1 = 3D orbit, 0 = top-down
    const topPos = new THREE.Vector3(0, 42, 0.01);

    // --- alerts ---
    const feed = document.getElementById('alert-feed');
    const raycaster = new THREE.Raycaster();
    const alerts = []; // {id, type, poi, group, orb, card, state}
    let alertSeq = 0, spawnT = 2.0, selected = null;
    const rings = [];
    const workers = []; // {group, from, to, k, alert, state}

    const kpi = {
      vis: document.getElementById('kpi-vis'), alerts: document.getElementById('kpi-alerts'),
      crews: document.getElementById('kpi-crews'), flow: document.getElementById('kpi-flow'),
      energy: document.getElementById('kpi-energy')
    };
    let visitors = 12400, flow = 840, energy = 612, reservoir = 68, kpiT = 0;

    function fmtNum(n) { return n.toLocaleString('en-US'); }

    // --- in-map dashboard overlays: gauges, sparkline, system health, zone labels ---
    const gauges = {
      irr: [document.getElementById('g-irr'), document.getElementById('gv-irr')],
      en: [document.getElementById('g-en'), document.getElementById('gv-en')],
      res: [document.getElementById('g-res'), document.getElementById('gv-res')]
    };
    const spark = document.getElementById('spark');
    const sparkCtx = spark ? spark.getContext('2d') : null;
    const footfall = [];

    const statusEl = document.getElementById('sys-status');
    const statusRefs = {};
    if (statusEl) {
      statusEl.innerHTML = '<h5>System health</h5>';
      ALERT_TYPES.forEach(tp => {
        const row = document.createElement('span');
        row.className = 'ss';
        const hex = '#' + tp.color.toString(16).padStart(6, '0');
        row.innerHTML = '<i style="background:' + hex + '"></i>' + tp.name + '<b>OK</b>';
        statusEl.appendChild(row);
        statusRefs[tp.k] = row.querySelector('b');
      });
    }

    const zoneLabelWrap = document.getElementById('zone-labels');
    const zoneLabels = [];
    if (zoneLabelWrap) {
      zoneLabelWrap.innerHTML = '';
      const labeled = [0, 1, 2, 3, 4, 6, 7, 8].map(i => POIS[i])
        .concat([{ x: 0.3, z: -9.7, zone: 'Royal Golf' }]);
      labeled.forEach(p => {
        const el = document.createElement('span');
        el.className = 'zl';
        el.textContent = p.zone;
        zoneLabelWrap.appendChild(el);
        zoneLabels.push({ el, v: new THREE.Vector3(p.x, 0.6, p.z) });
      });
    }
    const projV = new THREE.Vector3();

    function drawSpark() {
      if (!sparkCtx || footfall.length < 2) return;
      const w = spark.width, h = spark.height;
      sparkCtx.clearRect(0, 0, w, h);
      const min = Math.min(...footfall), max = Math.max(...footfall);
      const span = Math.max(80, max - min);
      sparkCtx.beginPath();
      footfall.forEach((v, i) => {
        const x = i / (footfall.length - 1) * (w - 2) + 1;
        const y = h - 3 - ((v - min) / span) * (h - 8);
        i ? sparkCtx.lineTo(x, y) : sparkCtx.moveTo(x, y);
      });
      sparkCtx.strokeStyle = '#7fd1f0';
      sparkCtx.lineWidth = 1.6;
      sparkCtx.stroke();
      sparkCtx.lineTo(w - 1, h); sparkCtx.lineTo(1, h); sparkCtx.closePath();
      sparkCtx.fillStyle = 'rgba(127,209,240,.15)';
      sparkCtx.fill();
    }

    function select(alert) {
      selected = alert;
      alerts.forEach(a => a.card.classList.toggle('sel', a === alert));
    }

    function resolveAlert(alert, how) {
      if (alert.state !== 'open' && alert.state !== 'working') return;
      alert.state = 'resolved';
      alert.orb.material.color.setHex(C.green);
      alert.column.material.color.setHex(C.green);
      alert.card.classList.add('resolved');
      alert.card.classList.remove('sel');
      alert.card.querySelector('.act').style.display = 'none';
      const ok = document.createElement('div');
      ok.className = 'ok';
      ok.textContent = how === 'auto' ? '✓ Auto-remediated by WĀHA' : '✓ Resolved by crew ' + alert.crewName;
      alert.card.appendChild(ok);
      updateKpis();
      setTimeout(() => {
        scene.remove(alert.group);
        alert.card.remove();
        const ix = alerts.indexOf(alert); if (ix > -1) alerts.splice(ix, 1);
        if (selected === alert) selected = null;
        updateKpis();
        if (!alerts.length) feed.innerHTML = '<div class="empty-feed">All quiet. Alerts will stream in live…</div>';
      }, 5200);
    }

    function dispatch(alert) {
      if (alert.state !== 'open') return;
      alert.state = 'working';
      alert.crewName = 'C-' + (3 + Math.floor(Math.random() * 6));
      const w = makeWorker();
      w.position.copy(DEPOT);
      scene.add(w);
      workers.push({ group: w, from: DEPOT.clone(), to: new THREE.Vector3(alert.poi.x, 0, alert.poi.z), k: 0, alert, state: 'go' });
      const btns = alert.card.querySelectorAll('.act .btn');
      btns.forEach(b => { b.disabled = true; b.textContent = '🚐 Crew ' + alert.crewName + ' en route…'; });
      if (btns.length > 1) btns[1].style.display = 'none';
      updateKpis();
    }

    function autofix(alert) {
      if (alert.state !== 'open') return;
      alert.state = 'working';
      const btn = alert.card.querySelectorAll('.act .btn');
      btn.forEach(b => { b.disabled = true; });
      // spark effect
      const ring = ringPulse(0xffffff, 0.1);
      ring.position.set(alert.poi.x, 0.1, alert.poi.z);
      scene.add(ring); rings.push(ring);
      setTimeout(() => resolveAlert(alert, 'auto'), 1300);
    }

    function spawnAlert(forceIncident) {
      if (alerts.length >= 5) return;
      const type = forceIncident ? ALERT_TYPES[6] : ALERT_TYPES[Math.floor(Math.random() * ALERT_TYPES.length)];
      // pick a title whose plausible locations are free, so text and zone chip agree
      const options = type.titles
        .map(x => ({ x, free: x.p.filter(i => !alerts.some(a => a.poi === POIS[i])) }))
        .filter(o => o.free.length);
      if (!options.length) return;
      const pick = options[Math.floor(Math.random() * options.length)];
      const poi = POIS[pick.free[Math.floor(Math.random() * pick.free.length)]];
      const title = pick.x.t;

      // 3D beacon
      const group = new THREE.Group();
      const orb = mesh(jitter(new THREE.IcosahedronGeometry(0.45, 0), 0.04),
        new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.7, flatShading: true }), 0, 2.6, 0, false);
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 2.4, 6),
        new THREE.MeshBasicMaterial({ color: type.color, transparent: true, opacity: 0.35, depthWrite: false }));
      column.position.y = 1.2;
      group.add(orb); group.add(column);
      group.position.set(poi.x, 0.1, poi.z);
      scene.add(group);

      // DOM card
      if (!alerts.length) feed.innerHTML = '';
      const card = document.createElement('button');
      card.className = 'alert-card';
      const hex = '#' + type.color.toString(16).padStart(6, '0');
      card.innerHTML =
        '<div class="ah"><span class="asw" style="background:' + hex + '"></span>' + type.icon + ' ' + type.name + '</div>' +
        '<div class="ab">' + title + '</div>' +
        '<div class="meta"><span>' + poi.zone + '</span><span>SLA ' + (type.k === 'incident' ? '10m' : '45m') + '</span>' +
        (type.auto ? '<span style="color:#22c55e">auto-fixable</span>' : '') + '</div>' +
        '<div class="act"></div>';
      const act = card.querySelector('.act');
      const bd = document.createElement('button');
      bd.className = 'btn oncolor'; bd.textContent = '🚐 Dispatch crew';
      bd.addEventListener('click', (e) => { e.stopPropagation(); dispatch(alert); });
      act.appendChild(bd);
      if (type.auto) {
        const ba = document.createElement('button');
        ba.className = 'btn ghost-dark'; ba.textContent = '⚡ Auto-fix';
        ba.addEventListener('click', (e) => { e.stopPropagation(); autofix(alert); });
        act.appendChild(ba);
      }
      const alert = { id: ++alertSeq, type, poi, group, orb, column, card, state: 'open', born: performance.now() };
      card.addEventListener('click', () => select(alert));
      feed.prepend(card);
      alerts.push(alert);
      updateKpis();
    }

    function updateKpis() {
      const open = alerts.filter(a => a.state !== 'resolved').length;
      kpi.alerts.textContent = open;
      kpi.crews.textContent = workers.filter(w => w.state !== 'done').length;
      ALERT_TYPES.forEach(tp => {
        const b = statusRefs[tp.k];
        if (!b) return;
        const n = alerts.filter(a => a.type.k === tp.k && a.state !== 'resolved').length;
        b.textContent = n ? n + ' FAULT' + (n > 1 ? 'S' : '') : 'OK';
        b.classList.toggle('fault', n > 0);
      });
    }

    // controls
    const btnDim = document.getElementById('btn-dim');
    btnDim.addEventListener('click', () => {
      mode3D = !mode3D;
      btnDim.textContent = mode3D ? '2D plan view' : '3D orbit view';
      btnDim.classList.toggle('on', !mode3D);
      rig.enabled = mode3D;
    });
    document.getElementById('btn-spawn').addEventListener('click', () => spawnAlert(true));

    return {
      scene, camera: cam, rig,
      onClick(nx, ny) {
        raycaster.setFromCamera({ x: nx, y: ny }, cam);
        const orbs = alerts.map(a => a.orb);
        const hit = raycaster.intersectObjects(orbs, false)[0];
        if (hit) {
          const a = alerts.find(al => al.orb === hit.object);
          if (a) select(a);
        }
      },
      update(dt, t) {
        // camera blend between orbit and top-down
        camBlend += ((mode3D ? 1 : 0) - camBlend) * Math.min(1, dt * 3.2);
        rig.update(dt);
        if (camBlend < 0.999) {
          cam.position.lerp(topPos, 1 - camBlend);
          cam.lookAt(0, 0, 0);
        }
        // beacons bob & spin
        alerts.forEach(a => {
          a.orb.rotation.y = t * 2;
          a.orb.position.y = 2.6 + Math.sin(t * 3 + a.id) * 0.16 + (selected === a ? 0.35 : 0);
          const sc = selected === a ? 1.35 : 1;
          a.orb.scale.setScalar(sc + Math.sin(t * 5 + a.id) * 0.06);
        });
        // spawn rhythm
        spawnT -= dt;
        if (spawnT <= 0) { spawnT = 6 + Math.random() * 5; spawnAlert(false); }
        // ring FX on open alerts
        if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
          alerts.filter(a => a.state === 'open').forEach(a => {
            const ring = ringPulse(a.type.color, 0.12);
            ring.position.set(a.poi.x, 0.12, a.poi.z);
            scene.add(ring); rings.push(ring);
          });
        }
        stepRings(rings, dt, 1.3, 2.4);
        // workers
        for (let i = workers.length - 1; i >= 0; i--) {
          const w = workers[i];
          if (w.state === 'go' || w.state === 'return') {
            w.k += dt / 2.6;
            const from = w.state === 'go' ? w.from : w.to;
            const to = w.state === 'go' ? w.to : w.from;
            w.group.position.lerpVectors(from, to, Math.min(1, w.k));
            w.group.position.y = Math.abs(Math.sin(w.k * 26)) * 0.06;
            w.group.lookAt(to.x, 0, to.z);
            if (w.k >= 1) {
              if (w.state === 'go') { w.state = 'fix'; w.k = 0; }
              else { scene.remove(w.group); workers.splice(i, 1); updateKpis(); continue; }
            }
          } else if (w.state === 'fix') {
            w.k += dt;
            w.group.rotation.z = Math.sin(w.k * 14) * 0.14;
            if (w.k >= 1.6) {
              w.group.rotation.z = 0;
              resolveAlert(w.alert, 'crew');
              w.state = 'return'; w.k = 0;
            }
          }
        }
        // KPI drift
        kpiT -= dt;
        if (kpiT <= 0) {
          kpiT = 2;
          visitors = Math.max(9000, visitors + Math.round((Math.random() - 0.48) * 260));
          flow = Math.max(500, flow + Math.round((Math.random() - 0.5) * 40));
          energy = Math.max(380, energy + Math.round((Math.random() - 0.5) * 26));
          reservoir = Math.min(92, Math.max(42, reservoir + (Math.random() - 0.52) * 1.4));
          kpi.vis.textContent = fmtNum(visitors);
          kpi.flow.textContent = fmtNum(flow) + ' L/min';
          kpi.energy.textContent = fmtNum(energy) + ' kW';
          if (gauges.irr[0]) {
            gauges.irr[0].style.width = Math.min(100, flow / 12) + '%';
            gauges.irr[1].textContent = fmtNum(flow) + ' L/m';
            gauges.en[0].style.width = Math.min(100, energy / 9) + '%';
            gauges.en[1].textContent = fmtNum(energy) + ' kW';
            gauges.res[0].style.width = reservoir + '%';
            gauges.res[1].textContent = Math.round(reservoir) + '%';
          }
          footfall.push(visitors);
          if (footfall.length > 42) footfall.shift();
          drawSpark();
        }
        // project zone labels onto the map
        if (zoneLabels.length && currentMount) {
          cam.updateMatrixWorld();
          cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
          const mw = currentMount.clientWidth, mh = currentMount.clientHeight;
          zoneLabels.forEach(L => {
            projV.copy(L.v).project(cam);
            const vis = projV.z < 1 && Math.abs(projV.x) < 1.08 && Math.abs(projV.y) < 1.08;
            L.el.style.display = vis ? '' : 'none';
            if (vis) {
              L.el.style.left = (projV.x * 0.5 + 0.5) * mw + 'px';
              L.el.style.top = (-projV.y * 0.5 + 0.5) * mh + 'px';
            }
          });
        }
      },
      onEnter() { if (!alerts.length) { spawnAlert(false); spawnAlert(false); } },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- 6 · AI OPS — triage conveyor ---------- */
  function aiopsScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    lights(scene, { shadowSpan: 12 });
    const rig = orbitRig(cam, { r: 14.5, phi: 1.05, theta: -0.12, sway: 0.22, target: new THREE.Vector3(0, 0.7, 0) });

    scene.add(mesh(new THREE.BoxGeometry(15, 0.5, 9), mat(C.sand), 0, -0.25, 0, false, true));
    // belt
    scene.add(mesh(new THREE.BoxGeometry(11, 0.3, 1.6), mat(0x8a8f93), 0, 0.35, 0, true, true));
    for (let i = 0; i < 9; i++) scene.add(mesh(new THREE.BoxGeometry(0.06, 0.34, 1.62), mat(0x777c80), -5 + i * 1.25, 0.35, 0));
    // scanner gate
    const gate = new THREE.Group();
    gate.add(mesh(new THREE.BoxGeometry(0.3, 2.0, 0.3), mat(C.tealDeep), 0, 1.0, -1.1));
    gate.add(mesh(new THREE.BoxGeometry(0.3, 2.0, 0.3), mat(C.tealDeep), 0, 1.0, 1.1));
    gate.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 2.5), mat(C.tealDeep), 0, 2.1, 0));
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 1.45),
      new THREE.MeshBasicMaterial({ color: C.lavender, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.set(0, 1.2, 0); beam.rotation.y = Math.PI / 2;
    gate.add(beam);
    // AI brain on top
    const brain = mesh(jitter(new THREE.IcosahedronGeometry(0.4, 1), 0.03), mat(C.lavender, { emissive: C.lavender, emissiveIntensity: 0.4 }), 0, 2.75, 0);
    gate.add(brain);
    scene.add(gate);

    // waiting crew
    const crew = [];
    for (let i = 0; i < 3; i++) {
      const w = makeWorker([C.coral, C.ochre, C.teal][i]);
      w.position.set(3.6 + i * 0.7, 0, 2.6);
      w.rotation.y = -0.6;
      scene.add(w); crew.push(w);
    }
    scene.add(mesh(new THREE.BoxGeometry(2.9, 0.12, 1.4), mat(C.cream), 4.3, 0.06, 2.6, false, true));

    // decorative trees
    [[-5.5, 3], [-6, -2.5], [6, -2.8]].forEach(([x, z], i) => {
      const t = makeTree(['blob', 'pine', 'palm'][i], 1.1); t.position.set(x, 0, z);
      t.traverse(o => o.castShadow = true); scene.add(t);
    });

    const faults = [];
    const rings = [];
    let spawnT = 0.4;
    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        brain.rotation.y = t * 1.4;
        beam.material.opacity = 0.35 + Math.sin(t * 6) * 0.2;
        spawnT -= dt;
        if (spawnT <= 0 && faults.length < 9) {
          spawnT = 1.15;
          const f = mesh(jitter(new THREE.BoxGeometry(0.5, 0.5, 0.5), 0.04), mat(0x9aa0a6), -5.6, 0.75, 0);
          f.userData = { state: 'in', vy: 0 };
          scene.add(f); faults.push(f);
        }
        for (let i = faults.length - 1; i >= 0; i--) {
          const f = faults[i];
          f.rotation.x += dt * 0.6;
          if (f.userData.state === 'in') {
            f.position.x += dt * 1.9;
            if (f.position.x >= 0) {
              const auto = Math.random() < 0.68;
              f.userData.state = auto ? 'auto' : 'manual';
              f.material.color.setHex(auto ? C.green : C.amber);
              f.material.emissive = new THREE.Color(auto ? C.green : C.amber);
              f.material.emissiveIntensity = 0.35;
              const ring = ringPulse(auto ? C.green : C.amber, 0.55);
              ring.position.set(0, 0.55, 0); scene.add(ring); rings.push(ring);
            }
          } else if (f.userData.state === 'auto') {
            // float up & dissolve — fixed by software
            f.position.y += dt * 1.6;
            f.scale.multiplyScalar(1 - dt * 1.4);
            f.material.transparent = true;
            f.material.opacity = Math.max(0, (f.material.opacity ?? 1) - dt * 1.3);
            if (f.scale.x < 0.08) { scene.remove(f); faults.splice(i, 1); }
          } else {
            // slide to crew tray
            f.position.x += dt * 1.5;
            if (f.position.x > 3.4) f.position.z += dt * 1.7;
            if (f.position.z > 2.2) {
              f.scale.multiplyScalar(1 - dt * 2.2);
              if (f.scale.x < 0.08) { scene.remove(f); faults.splice(i, 1); }
            }
          }
        }
        crew.forEach((w, i) => { w.position.y = Math.abs(Math.sin(t * 2 + i)) * 0.03; });
        stepRings(rings, dt, 2.0, 1.6);
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- RCA — log intelligence dependency graph ---------- */
  function rcaScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    lights(scene, { shadowSpan: 11 });
    const rig = orbitRig(cam, { r: 13.5, phi: 1.0, theta: -0.18, sway: 0.22, target: new THREE.Vector3(0, 1.1, 0) });

    scene.add(mesh(new THREE.CylinderGeometry(6.4, 6.8, 0.5, 12), mat(C.sand), 0, -0.25, 0, false, true));

    // --- graph nodes: upstream infra -> controllers -> park systems ---
    function makeNode(x, z, c, s, y) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, y, 5), mat(0xb9ab8d), 0, y / 2, 0, false));
      const cube = mesh(jitter(new THREE.BoxGeometry(s, s, s), 0.02), mat(c), 0, y + s / 2, 0);
      g.add(cube);
      g.position.set(x, 0, z);
      scene.add(g);
      return { g, cube, base: c, top: new THREE.Vector3(x, y + s / 2, z) };
    }
    const up = [
      makeNode(-4.2, -2.4, C.ochre, 0.62, 1.5),   // power feeder
      makeNode(-4.2, 0.2, C.wifi, 0.62, 1.9),     // core network switch
      makeNode(-4.2, 2.6, C.teal, 0.62, 1.3)      // fiber / UPS
    ];
    const mid = [
      makeNode(-0.4, -3.1, 0xd9cef5, 0.5, 1.2),   // pump controller
      makeNode(-0.4, -1.0, 0xd9cef5, 0.5, 1.6),   // lighting controller
      makeNode(-0.4, 1.1, 0xd9cef5, 0.5, 1.35),   // camera hub
      makeNode(-0.4, 3.2, 0xd9cef5, 0.5, 1.7)     // AP cluster
    ];
    const end = [
      makeNode(3.2, -3.6, 0x59c9a5, 0.4, 0.9),    // irrigation
      makeNode(3.2, -2.15, C.ochre, 0.4, 1.25),   // lighting
      makeNode(3.2, -0.7, C.coral, 0.4, 1.0),     // pava
      makeNode(3.2, 0.75, C.pink, 0.4, 1.35),     // cctv
      makeNode(3.2, 2.2, C.wifi, 0.4, 1.05),      // wifi
      makeNode(3.2, 3.65, C.lavender, 0.4, 1.3)   // parking
    ];
    // adjacency (index into combined list)
    const CHILDREN = new Map([
      [up[0], [mid[0], mid[1]]],
      [up[1], [mid[1], mid[2], mid[3]]],
      [up[2], [mid[3]]],
      [mid[0], [end[0]]],
      [mid[1], [end[1], end[2]]],
      [mid[2], [end[3]]],
      [mid[3], [end[4], end[5]]]
    ]);
    // static edges
    CHILDREN.forEach((kids, parent) => kids.forEach(k => scene.add(beamBetween(parent.top, k.top, 0xcfc4a6, 0.022, 0.6))));

    // AI brain + scan beam
    const brain = mesh(jitter(new THREE.IcosahedronGeometry(0.5, 1), 0.03), mat(C.lavender, { emissive: C.lavender, emissiveIntensity: 0.4 }), 0, 4.1, 0);
    scene.add(brain);
    const scanBeam = unitBeam(C.lavender, 0.035, 0.5);
    scanBeam.visible = false;
    scene.add(scanBeam);

    // department desk (where the ticket lands)
    const desk = new THREE.Group();
    desk.add(mesh(new THREE.BoxGeometry(1.1, 0.6, 0.9), mat(C.cream), 0, 0.3, 0));
    desk.add(mesh(new THREE.ConeGeometry(0.8, 0.45, 4), mat(C.pink), 0, 0.83, 0));
    desk.position.set(1.4, 0, 5.0);
    desk.traverse(o => o.castShadow = true);
    scene.add(desk);

    const rings = [];
    let ticket = null, ticketK = 0, ticketFrom = null;
    let cycleT = 0, root = null, affected = [];
    const CYCLE = 7.0;

    // fault propagates downstream with a delay per hop
    function cascade(node, depth) {
      (CHILDREN.get(node) || []).forEach(kid => {
        affected.push({ n: kid, at: 0.45 + depth * 0.45 });
        cascade(kid, depth + 1);
      });
    }

    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        brain.rotation.y = t * 1.2;
        brain.position.y = 4.1 + Math.sin(t * 1.6) * 0.12;

        cycleT += dt;
        if (cycleT >= CYCLE || !root) {
          // reset previous cycle
          [...up, ...mid, ...end].forEach(n => { n.cube.material.color.setHex(n.base); n.cube.scale.setScalar(1); });
          affected.length = 0;
          if (ticket) { scene.remove(ticket); ticket = null; }
          cycleT = 0;
          root = up[Math.floor(Math.random() * up.length)];
          cascade(root, 0);
          root.cube.material.color.setHex(C.red);
          const ring = ringPulse(C.red, 0.06);
          ring.position.set(root.g.position.x, 0.06, root.g.position.z);
          scene.add(ring); rings.push(ring);
        }
        // downstream nodes go amber as the fault reaches them
        affected.forEach(a => {
          if (cycleT > a.at) a.n.cube.material.color.setHex(C.amber);
        });
        // scan phase: brain locks onto root
        const scanning = cycleT > 1.6 && cycleT < 3.2;
        scanBeam.visible = scanning;
        if (scanning) {
          scanBeam.userData.aim(brain.position, root.top);
          scanBeam.material.opacity = 0.3 + Math.sin(t * 8) * 0.2;
          root.cube.scale.setScalar(1 + Math.sin(t * 6) * 0.15);
        }
        // root identified: green flash + ticket flies to department
        if (cycleT > 3.2 && !ticket) {
          root.cube.material.color.setHex(C.green);
          [...affected].forEach(a => a.n.cube.material.color.setHex(a.n.base));
          const ring = ringPulse(C.green, 0.06);
          ring.position.set(root.g.position.x, 0.06, root.g.position.z);
          scene.add(ring); rings.push(ring);
          ticket = mesh(new THREE.BoxGeometry(0.34, 0.24, 0.05), mat(C.pink, { emissive: C.pink, emissiveIntensity: 0.35 }));
          ticketFrom = root.top.clone();
          ticketK = 0;
          scene.add(ticket);
        }
        if (ticket && ticketK < 1) {
          ticketK = Math.min(1, ticketK + dt * 0.55);
          const dest = new THREE.Vector3(desk.position.x, 1.1, desk.position.z);
          ticket.position.lerpVectors(ticketFrom, dest, ticketK);
          ticket.position.y += Math.sin(ticketK * Math.PI) * 1.6;
          ticket.rotation.y = ticketK * 6;
          if (ticketK >= 1) {
            const ring = ringPulse(C.pink, 0.06);
            ring.position.set(desk.position.x, 0.06, desk.position.z);
            scene.add(ring); rings.push(ring);
          }
        }
        stepRings(rings, dt, 1.5, 2.2);
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- ESG — scopes, absorption & carbon credits ---------- */
  function esgScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    lights(scene, { shadowSpan: 11 });
    const rig = orbitRig(cam, { r: 14, phi: 0.98, theta: 0.32, sway: 0.24, target: new THREE.Vector3(-0.4, 0.7, 0) });

    scene.add(mesh(jitter(new THREE.CylinderGeometry(6.2, 6.6, 0.6, 20, 2), 0.05), mat(C.grass), 0, -0.3, 0, false, true));

    // --- clean energy assets ---
    // solar array
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Group();
      p.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 5), mat(0x9aa0a6), 0, 0.35, 0));
      const panel = mesh(new THREE.BoxGeometry(1.3, 0.06, 0.9), mat(0x3f6f8f, { roughness: 0.4 }), 0, 0.75, 0);
      panel.rotation.x = -0.5;
      p.add(panel);
      p.position.set(-3.6 + i * 1.7, 0, 2.3);
      p.traverse(o => o.castShadow = true);
      scene.add(p);
    }
    // wind turbine
    const turbine = new THREE.Group();
    turbine.add(mesh(new THREE.CylinderGeometry(0.07, 0.11, 2.7, 6), mat(C.cream), 0, 1.35, 0));
    const hub = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const blade = mesh(new THREE.BoxGeometry(0.1, 1.05, 0.16), mat(C.cream), 0, 0.55, 0);
      const arm = new THREE.Group();
      arm.add(blade);
      arm.rotation.z = i * Math.PI * 2 / 3;
      hub.add(arm);
    }
    hub.position.set(0, 2.75, 0.14);
    turbine.add(hub);
    turbine.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(C.ochre), 0, 2.75, 0.1));
    turbine.position.set(-3.4, 0, -2.2);
    turbine.traverse(o => o.castShadow = true);
    scene.add(turbine);

    // scope-1 generator (chimney puffing CO2)
    const gen = new THREE.Group();
    gen.add(mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), mat(0x5a5f63), 0, 0.35, 0));
    gen.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.7, 6), mat(0x777c80), 0.3, 0.95, 0));
    gen.position.set(3.4, 0.1, 2.6);
    gen.traverse(o => o.castShadow = true);
    scene.add(gen);

    // scope-3 delivery truck shuttling across the back
    const truck = new THREE.Group();
    truck.add(mesh(new THREE.BoxGeometry(0.9, 0.42, 0.42), mat(C.cream), -0.1, 0.4, 0));
    truck.add(mesh(new THREE.BoxGeometry(0.34, 0.3, 0.4), mat(C.wifi), 0.55, 0.34, 0));
    [[-0.35, 0], [0.3, 0]].forEach(([x]) => {
      truck.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8), mat(C.ink), x, 0.12, 0.2, false));
      truck.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8), mat(C.ink), x, 0.12, -0.2, false));
    });
    truck.children.forEach(o => o.castShadow = true);
    scene.add(truck);
    let truckX = -4.5, truckDir = 1;

    // absorbing tree cluster
    const SINK = new THREE.Vector3(0.9, 1.0, -0.6);
    [[0.4, -1.2, 'blob', 1.5], [1.7, -0.4, 'pine', 1.3], [0.2, 0.3, 'mint', 1.1], [1.6, -1.7, 'palm', 1.2], [2.4, 0.6, 'blob', 1.0]].forEach(([x, z, k, s]) => {
      const t = makeTree(k, s); t.position.set(x, 0.1, z);
      t.traverse(o => o.castShadow = true);
      scene.add(t);
    });

    // CO2 blobs
    const blobs = [];
    let blobT = 0;

    // carbon meter: column of segments that fills, then mints a coin
    const meterPos = new THREE.Vector3(-1.4, 0, 0.4);
    scene.add(mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.18, 10), mat(C.cream), meterPos.x, 0.09, meterPos.z));
    const SEGS = 7;
    const segs = [];
    for (let i = 0; i < SEGS; i++) {
      const s = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), mat(C.mint, { emissive: C.mint, emissiveIntensity: 0.25 }), meterPos.x, 0.32 + i * 0.22, meterPos.z, false);
      s.visible = false;
      scene.add(s); segs.push(s);
    }
    // decorative scope rings around the meter (scope 1 / 2 / 3)
    [[0.5, C.coral], [1.05, C.ochre], [1.6, C.lavender]].forEach(([y, c]) => {
      const tor = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 32), mat(c, { emissive: c, emissiveIntensity: 0.25 }));
      tor.rotation.x = Math.PI / 2;
      tor.position.set(meterPos.x, y, meterPos.z);
      tor.userData.spin = 0.3 + y * 0.3;
      scene.add(tor);
    });
    let level = 0;
    // coin stack
    const coins = [];
    const coinPos = new THREE.Vector3(-2.9, 0, 0.9);
    const rings = [];

    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        hub.rotation.z = t * 2.2;
        // truck shuttle
        truckX += truckDir * dt * 1.1;
        if (truckX > 4.5) { truckX = 4.5; truckDir = -1; }
        if (truckX < -4.5) { truckX = -4.5; truckDir = 1; }
        truck.position.set(truckX, 0.06, -4.6);
        truck.rotation.y = truckDir > 0 ? 0 : Math.PI;

        // CO2 emission + absorption
        blobT -= dt;
        if (blobT <= 0 && blobs.length < 14) {
          blobT = 0.55;
          const fromTruck = Math.random() < 0.35;
          const b = mesh(jitter(new THREE.IcosahedronGeometry(0.16, 0), 0.03),
            new THREE.MeshStandardMaterial({ color: 0x9aa0a6, flatShading: true, transparent: true, opacity: 0.85, roughness: 1 }),
            0, 0, 0, false);
          b.position.copy(fromTruck ? new THREE.Vector3(truckX, 0.7, -4.6) : new THREE.Vector3(3.7, 1.4, 2.6));
          b.userData.v = new THREE.Vector3();
          scene.add(b); blobs.push(b);
        }
        for (let i = blobs.length - 1; i >= 0; i--) {
          const b = blobs[i];
          const pull = new THREE.Vector3().subVectors(SINK, b.position).normalize().multiplyScalar(dt * 0.9);
          b.userData.v.add(pull).multiplyScalar(0.985);
          b.position.add(b.userData.v.clone().multiplyScalar(dt * 2.2));
          b.position.y += dt * 0.25; // buoyancy
          b.rotation.y += dt;
          if (b.position.distanceTo(SINK) < 0.75) {
            scene.remove(b); blobs.splice(i, 1);
            // absorbed -> meter ticks up
            if (level < SEGS) { segs[level].visible = true; level++; }
            if (level >= SEGS) {
              level = 0; segs.forEach(s => s.visible = false);
              // mint a carbon credit coin
              const coin = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 12),
                mat(0xe8c34a, { emissive: 0xe8c34a, emissiveIntensity: 0.35, roughness: 0.5 }),
                coinPos.x, 0.06 + coins.length * 0.1, coinPos.z);
              scene.add(coin); coins.push(coin);
              if (coins.length > 7) { const old = coins.shift(); scene.remove(old); coins.forEach((c2, k) => c2.position.y = 0.06 + k * 0.1); }
              const ring = ringPulse(0xe8c34a, 0.06);
              ring.position.set(coinPos.x, 0.06, coinPos.z);
              scene.add(ring); rings.push(ring);
            }
          }
        }
        // scope rings spin
        scene.children.forEach(o => { if (o.userData && o.userData.spin) o.rotation.z = t * o.userData.spin; });
        stepRings(rings, dt, 1.5, 2.0);
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- 7 · HEALTH — predictive maintenance ---------- */
  function healthScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    lights(scene, { shadowSpan: 10 });
    const rig = orbitRig(cam, { r: 11.5, phi: 1.02, theta: -0.55, sway: 0.3, target: new THREE.Vector3(0.8, 1.2, 0) });

    scene.add(mesh(new THREE.CylinderGeometry(5.4, 5.8, 0.5, 12), mat(C.sand), 0, -0.25, 0, false, true));

    // pump station
    const pump = new THREE.Group();
    pump.add(mesh(new THREE.BoxGeometry(2.2, 0.5, 1.6), mat(C.cream), 0, 0.25, 0));
    const body = mesh(new THREE.CylinderGeometry(0.55, 0.62, 1.2, 10), mat(C.teal), -0.4, 1.1, 0);
    pump.add(body);
    pump.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 8), mat(0x9aa0a6), 0.6, 0.9, 0));
    const pipe = mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8), mat(0x9aa0a6), 1.25, 1.62, 0);
    pipe.rotation.z = Math.PI / 2;
    pump.add(pipe);
    const fan = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 8), mat(C.ochre), -0.4, 1.78, 0);
    pump.add(fan);
    pump.traverse(o => o.castShadow = true);
    scene.add(pump);

    // health halo
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.055, 8, 44),
      mat(C.green, { emissive: C.green, emissiveIntensity: 0.5 }));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.35;
    scene.add(halo);

    // RUL descent: orb + trail + threshold plane
    const panel = mesh(new THREE.BoxGeometry(0.12, 3.6, 2.6), mat(C.cream), 3.1, 1.8, 0, false);
    scene.add(panel);
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 2.6),
      new THREE.MeshBasicMaterial({ color: C.red, transparent: true, opacity: 0.85 }));
    threshold.position.set(3.1, 0.9, 0);
    scene.add(threshold);
    const orb = mesh(new THREE.SphereGeometry(0.14, 10, 8), mat(C.green, { emissive: C.green, emissiveIntensity: 0.6 }), 3.02, 3.3, -1.05, false);
    scene.add(orb);
    const trail = [];
    for (let i = 0; i < 16; i++) {
      const tr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: C.mint, transparent: true, opacity: 0 }));
      scene.add(tr); trail.push(tr);
    }
    // wrench flag (maintenance booked)
    const flag = new THREE.Group();
    flag.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), mat(C.ink), 0, 0.7, 0));
    flag.add(mesh(new THREE.BoxGeometry(0.55, 0.32, 0.04), mat(C.wifi), 0.3, 1.2, 0));
    flag.position.set(1.6, 0, 1.4);
    flag.visible = false;
    scene.add(flag);
    const rings = [];

    let health = 1, cycleT = 0, booked = false;
    const CYCLE = 14;
    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        cycleT += dt;
        if (cycleT > CYCLE) { cycleT = 0; booked = false; flag.visible = false; }
        health = 1 - (cycleT / CYCLE) * 0.85;
        // color: green -> amber -> red
        const col = new THREE.Color(C.green).lerp(new THREE.Color(C.red), Math.pow(1 - health, 1.6));
        halo.material.color.copy(col); halo.material.emissive.copy(col);
        orb.material.color.copy(col); orb.material.emissive.copy(col);
        halo.rotation.z = t * 0.8;
        halo.scale.setScalar(1 + Math.sin(t * 3) * 0.03 * (1.5 - health));
        // fan spins slower as health drops, judders near failure
        fan.rotation.y += dt * (2 + health * 9) + (health < 0.35 ? Math.sin(t * 30) * 0.05 : 0);
        // orb descends along panel; x fixed, z sweeps as "time"
        const k = cycleT / CYCLE;
        orb.position.set(3.02, 3.3 - k * 2.15, -1.05 + k * 2.1);
        trail.forEach((tr, i) => {
          const kk = Math.max(0, k - (i + 1) * 0.035);
          tr.position.set(3.02, 3.3 - kk * 2.15, -1.05 + kk * 2.1);
          tr.material.opacity = Math.max(0, 0.5 - i * 0.035);
          tr.material.color.copy(col);
        });
        // predictive booking: WĀHA schedules maintenance before crossing
        if (!booked && orb.position.y < 1.45) {
          booked = true;
          flag.visible = true;
          const ring = ringPulse(C.wifi, 0.06);
          ring.position.set(1.6, 0.06, 1.4);
          scene.add(ring); rings.push(ring);
        }
        if (booked) flag.rotation.y = Math.sin(t * 2) * 0.15;
        // maintenance "performed" just before threshold: reset visual
        if (orb.position.y <= 1.02) { cycleT = 0; booked = false; flag.visible = false; }
        stepRings(rings, dt, 1.4, 2.2);
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- 8 · CROWD — flow + density heat ---------- */
  function crowdScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    lights(scene, { shadowSpan: 12 });
    const rig = orbitRig(cam, { r: 14, phi: 0.92, theta: 0.2, auto: 0.06, target: new THREE.Vector3(0, 0, 0) });

    scene.add(mesh(new THREE.BoxGeometry(14, 0.5, 10), mat(C.grass), 0, -0.25, 0, false, true));

    // heat tiles
    const TX = 14, TZ = 10;
    const tileGeo = new THREE.PlaneGeometry(0.92, 0.92);
    const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false }), TX * TZ);
    const dummy = new THREE.Object3D();
    let ti = 0;
    for (let ix = 0; ix < TX; ix++) for (let iz = 0; iz < TZ; iz++) {
      dummy.position.set(ix - TX / 2 + 0.5, 0.04, iz - TZ / 2 + 0.5);
      dummy.rotation.x = -Math.PI / 2;
      dummy.updateMatrix();
      tiles.setMatrixAt(ti, dummy.matrix);
      tiles.setColorAt(ti, new THREE.Color(C.grass));
      ti++;
    }
    scene.add(tiles);

    // paths (visual)
    const c1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-6.5, 0.1, -3.5), new THREE.Vector3(-2, 0.1, -1), new THREE.Vector3(0.5, 0.1, 0.5),
      new THREE.Vector3(3, 0.1, 1.5), new THREE.Vector3(6.5, 0.1, 3.5)]);
    const c2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-6.5, 0.1, 3.5), new THREE.Vector3(-3, 0.1, 1.5), new THREE.Vector3(0.5, 0.1, 0.5),
      new THREE.Vector3(2.5, 0.1, -1.5), new THREE.Vector3(6.5, 0.1, -3.5)]);
    [c1, c2].forEach(c => {
      const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.3, 6), mat(C.sand));
      tube.scale.y = 0.25; tube.receiveShadow = true;
      scene.add(tube);
    });
    // plaza at crossing
    scene.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 16), mat(C.sand), 0.5, 0.06, 0.5, false, true));
    const fountain = mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.5, 10), mat(C.water, { roughness: 0.3 }), 0.5, 0.31, 0.5);
    scene.add(fountain);
    // trees
    for (let i = 0; i < 12; i++) {
      const t = makeTree(['blob', 'mint', 'pine'][i % 3], 0.7 + Math.random() * 0.5);
      t.position.set(-6 + Math.random() * 12, 0, -4 + Math.random() * 8);
      if (Math.abs(t.position.x - 0.5) < 2 && Math.abs(t.position.z - 0.5) < 2) t.position.x += 3;
      t.traverse(o => o.castShadow = true);
      scene.add(t);
    }

    // agents
    const N = 130;
    const agents = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5),
      new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), N);
    const A = [];
    const agentCols = [new THREE.Color(C.pink), new THREE.Color(C.wifi), new THREE.Color(C.ochre), new THREE.Color(C.coral), new THREE.Color(C.lavender), new THREE.Color(0xffffff)];
    for (let i = 0; i < N; i++) {
      A.push({ curve: Math.random() > 0.5 ? c1 : c2, t: Math.random(), v: 0.014 + Math.random() * 0.02, ox: (Math.random() - 0.5) * 0.7, oz: (Math.random() - 0.5) * 0.7, dwell: 0 });
      agents.setColorAt(i, agentCols[i % agentCols.length]);
    }
    scene.add(agents);

    const heat = new Float32Array(TX * TZ);
    const cLow = new THREE.Color(C.grass), cMid = new THREE.Color(C.ochre), cHigh = new THREE.Color(C.coral), cPeak = new THREE.Color(C.pink);
    let heatT = 0;

    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        fountain.position.y = 0.31 + Math.sin(t * 2) * 0.02;
        const dum = new THREE.Object3D();
        for (let i = 0; i < N; i++) {
          const a = A[i];
          // dwell near plaza (crowd builds at crossing)
          const p = a.curve.getPoint(a.t);
          const nearPlaza = (Math.abs(p.x - 0.5) < 1.3 && Math.abs(p.z - 0.5) < 1.3);
          if (nearPlaza && a.dwell <= 0 && Math.random() < 0.004) a.dwell = 2 + Math.random() * 3;
          if (a.dwell > 0) a.dwell -= dt; else a.t += a.v * dt * 3.2;
          if (a.t > 1) { a.t = 0; }
          dum.position.set(p.x + a.ox, 0.22 + Math.abs(Math.sin(t * 6 + i)) * 0.04, p.z + a.oz);
          dum.updateMatrix();
          agents.setMatrixAt(i, dum.matrix);
        }
        agents.instanceMatrix.needsUpdate = true;
        // heat every 0.18s
        heatT -= dt;
        if (heatT <= 0) {
          heatT = 0.18;
          heat.fill(0);
          for (let i = 0; i < N; i++) {
            const a = A[i];
            const p = a.curve.getPoint(a.t);
            const ix = Math.floor(p.x + a.ox + TX / 2), iz = Math.floor(p.z + a.oz + TZ / 2);
            if (ix >= 0 && ix < TX && iz >= 0 && iz < TZ) heat[ix * TZ + iz] += 1;
          }
          const col = new THREE.Color();
          for (let k = 0; k < TX * TZ; k++) {
            const d = Math.min(1, heat[k] / 7);
            if (d < 0.34) col.copy(cLow).lerp(cMid, d / 0.34);
            else if (d < 0.67) col.copy(cMid).lerp(cHigh, (d - 0.34) / 0.33);
            else col.copy(cHigh).lerp(cPeak, (d - 0.67) / 0.33);
            tiles.setColorAt(k, col);
          }
          tiles.instanceColor.needsUpdate = true;
        }
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- 9 · ROADMAP — milestone path ---------- */
  function roadScene() {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    lights(scene, { shadowSpan: 12 });
    const rig = orbitRig(cam, { r: 12.5, phi: 0.95, theta: -0.3, auto: 0.07, target: new THREE.Vector3(0, 0.4, 0) });

    scene.add(mesh(jitter(new THREE.CylinderGeometry(6.2, 6.6, 0.6, 20, 2), 0.05), mat(C.grass), 0, -0.3, 0, false, true));

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.6, 0.1, 3.2), new THREE.Vector3(-2.4, 0.1, 0.6), new THREE.Vector3(-0.2, 0.1, 2.2),
      new THREE.Vector3(2.0, 0.1, 0.0), new THREE.Vector3(3.2, 0.1, -2.4), new THREE.Vector3(0.4, 0.1, -3.4)]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.34, 7), mat(C.sand));
    tube.scale.y = 0.3; tube.receiveShadow = true;
    scene.add(tube);

    // milestones
    const mile = [[0.08, C.cream, '1'], [0.5, C.peach, '2'], [0.94, C.teal, '3']];
    mile.forEach(([k, c]) => {
      const p = curve.getPoint(k);
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 5), mat(C.ink), 0, 0.75, 0));
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.42, 0.05), mat(c), 0.38, 1.3, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.16, 9), mat(C.sand), 0, 0.08, 0));
      g.position.set(p.x, 0, p.z);
      g.traverse(o => o.castShadow = true);
      scene.add(g);
    });
    // trees & landmarks along the way
    for (let i = 0; i < 10; i++) {
      const t = makeTree(['blob', 'pine', 'mint', 'palm'][i % 4], 0.7 + (i % 3) * 0.25);
      const a = i / 10 * Math.PI * 2;
      t.position.set(Math.cos(a) * 4.9, 0, Math.sin(a) * 4.9);
      t.traverse(o => o.castShadow = true);
      scene.add(t);
    }
    // traveller
    const dot = mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(C.pink, { emissive: C.pink, emissiveIntensity: 0.5 }));
    scene.add(dot);
    const rings = [];
    let lastMile = -1;

    return {
      scene, camera: cam, rig,
      update(dt, t) {
        rig.update(dt);
        const k = (t * 0.045) % 1;
        const p = curve.getPoint(k);
        dot.position.set(p.x, 0.45 + Math.abs(Math.sin(t * 8)) * 0.08, p.z);
        // celebrate reaching milestones
        const mi = mile.findIndex(([mk]) => Math.abs(k - mk) < 0.01);
        if (mi > -1 && mi !== lastMile) {
          lastMile = mi;
          const ring = ringPulse([C.ochre, C.coral, C.mint][mi], 0.08);
          ring.position.set(p.x, 0.08, p.z);
          scene.add(ring); rings.push(ring);
        }
        stepRings(rings, dt, 1.6, 2.4);
      },
      resize(w, h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    };
  }

  /* ---------- registry ---------- */
  S.scenes = {
    hero: { factory: () => heroScene(false), inst: null },
    canvas: { factory: canvasScene, inst: null },
    silos: { factory: silosScene, inst: null },
    unify: { factory: unifyScene, inst: null },
    stack: { factory: stackScene, inst: null },
    ops: { factory: opsScene, inst: null },
    aiops: { factory: aiopsScene, inst: null },
    rca: { factory: rcaScene, inst: null },
    esg: { factory: esgScene, inst: null },
    health: { factory: healthScene, inst: null },
    crowd: { factory: crowdScene, inst: null },
    road: { factory: roadScene, inst: null },
    close: { factory: () => heroScene(true), inst: null }
  };

  S.activate = function (slideEl, prevEl) {
    if (S.active && S.active.onLeave) S.active.onLeave();
    S.active = null;
    const name = slideEl.dataset.scene;
    const rec = S.scenes[name];
    if (!rec) { if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); currentMount = null; return; }
    const mount = slideEl.querySelector('.scene-mount');
    if (!mount) return;
    mount.appendChild(renderer.domElement);
    currentMount = mount;
    if (!rec.inst) rec.inst = rec.factory();
    const w = mount.clientWidth || 800, h = mount.clientHeight || 500;
    renderer.setSize(w, h, false);
    rec.inst.resize(w, h);
    S.active = rec.inst;
    if (rec.inst.onEnter) rec.inst.onEnter();
    if (S._frame) S._frame(); // paint immediately, even before rAF ticks
  };

  function handleResize() {
    if (!currentMount || !S.active) return;
    const w = currentMount.clientWidth, h = currentMount.clientHeight;
    if (w && h) { renderer.setSize(w, h, false); S.active.resize(w, h); }
  }
  window.addEventListener('resize', handleResize);
  document.addEventListener('fullscreenchange', () => setTimeout(handleResize, 120));

  /* ---------- layer list wiring (slide 4) ---------- */
  const layerList = document.getElementById('layer-list');
  if (layerList) {
    layerList.querySelectorAll('.layer-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const was = btn.classList.contains('sel');
        layerList.querySelectorAll('.layer-row').forEach(b => b.classList.remove('sel'));
        if (!was) btn.classList.add('sel');
        if (S.setLayer) S.setLayer(was ? -1 : parseInt(btn.dataset.layer, 10));
      });
    });
  }

  /* ---------- render loop ---------- */
  const clock = new THREE.Clock();
  let lastFrame = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (S.active && currentMount) {
      S.active.update(dt, t);
      renderer.render(S.active.scene, S.active.camera);
      lastFrame = performance.now();
    }
  }
  function loop() {
    requestAnimationFrame(loop);
    frame();
  }
  loop();
  // fallback for environments that throttle rAF (hidden/embedded tabs)
  setInterval(() => { if (performance.now() - lastFrame > 400) frame(); }, 300);
  S._frame = frame;

  S._renderer = renderer;
  S.ready = true;
})();
