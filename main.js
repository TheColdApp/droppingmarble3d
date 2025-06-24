import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

let scene, camera, renderer, controls;
let world;
let marbles = [];
let pegs = [];
const MARBLE_RADIUS = 0.3;
const PEG_RADIUS = 0.2;
const PEG_ROWS = 7;
const PEG_COLS = 9;

const container = document.getElementById('container');

init();
animate();

function init() {
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121212);

  // Camera
  camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100);
  camera.position.set(0, 10, 15);

  // Renderer
  renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.update();

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(10, 15, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // Physics world
  world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
  });

  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 10;

  // Ground plane - physics
  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    material: new CANNON.Material({friction: 0.5, restitution: 0.7}),
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // Ground plane - visual
  const groundGeo = new THREE.PlaneGeometry(20, 20);
  const groundMat = new THREE.ShadowMaterial({opacity: 0.4});
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Tray (physics) - walls around the bottom to catch marbles
  createWalls();

  // Create pegs grid
  createPegs();

  // Event listeners
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('click', dropMarble);

  document.getElementById('resetBtn').addEventListener('click', resetMarbles);
}

function createWalls() {
  const wallHeight = 1;
  const wallThickness = 0.5;
  const traySize = 8;

  const wallMaterial = new CANNON.Material({friction: 0.5, restitution: 0.7});
  const wallShape = new CANNON.Box(new CANNON.Vec3(traySize / 2, wallHeight / 2, wallThickness / 2));

  const positions = [
    {x: 0, y: wallHeight / 2, z: -traySize / 2}, // back
    {x: 0, y: wallHeight / 2, z: traySize / 2},  // front
  ];

  positions.forEach(pos => {
    const body = new CANNON.Body({mass: 0, material: wallMaterial});
    body.addShape(wallShape);
    body.position.set(pos.x, pos.y, pos.z);
    world.addBody(body);

    // Visual
    const geo = new THREE.BoxGeometry(traySize, wallHeight, wallThickness);
    const mat = new THREE.MeshStandardMaterial({color: 0x555555, metalness: 0.7, roughness: 0.2});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(body.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // Left and right walls (rotated 90deg)
  const sideWallShape = new CANNON.Box(new CANNON.Vec3(wallThickness / 2, wallHeight / 2, traySize / 2));
  const sidePositions = [
    {x: -traySize / 2, y: wallHeight / 2, z: 0},
    {x: traySize / 2, y: wallHeight / 2, z: 0},
  ];

  sidePositions.forEach(pos => {
    const body = new CANNON.Body({mass: 0, material: wallMaterial});
    body.addShape(sideWallShape);
    body.position.set(pos.x, pos.y, pos.z);
    world.addBody(body);

    // Visual
    const geo = new THREE.BoxGeometry(wallThickness, wallHeight, traySize);
    const mat = new THREE.MeshStandardMaterial({color: 0x555555, metalness: 0.7, roughness: 0.2});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(body.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

function createPegs() {
  const pegGeometry = new THREE.SphereGeometry(PEG_RADIUS, 16, 16);
  const pegMaterial = new THREE.MeshStandardMaterial({color: 0xff4081, metalness: 0.8, roughness: 0.2});

  for(let row=0; row < PEG_ROWS; row++) {
    for(let col=0; col < PEG_COLS; col++) {
      // stagger pegs in alternate rows
      let x = (col - (PEG_COLS - 1)/2) * 1.5;
      if (row % 2 === 1) x += 0.75;
      let y = 4 - row * 0.7;
      let z = 0;

      // Visual peg
      const pegMesh = new THREE.Mesh(pegGeometry, pegMaterial);
      pegMesh.position.set(x, y, z);
      pegMesh.castShadow = true;
      pegMesh.receiveShadow = true;
      scene.add(pegMesh);
      pegs.push(pegMesh);

      // Physics peg
      const pegShape = new CANNON.Sphere(PEG_RADIUS);
      const pegBody = new CANNON.Body({mass: 0});
      pegBody.addShape(pegShape);
      pegBody.position.set(x, y, z);
      world.addBody(pegBody);
    }
  }
}

function dropMarble() {
  // Marble geometry & material
  const marbleGeometry = new THREE.SphereGeometry(MARBLE_RADIUS, 32, 32);
  const marbleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x44aaff,
    metalness: 0.3,
    roughness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0,
    reflectivity: 0.8,
    transmission: 0.95,
    thickness: 0.5,
  });

  // Visual marble
  const marbleMesh = new THREE.Mesh(marbleGeometry, marbleMaterial);
  marbleMesh.castShadow = true;
  marbleMesh.receiveShadow = true;
  marbleMesh.position.set(0, 7, 0);
  scene.add(marbleMesh);

  // Physics marble
  const marbleShape = new CANNON.Sphere(MARBLE_RADIUS);
  const marbleBody = new CANNON.Body({
    mass: 1,
    shape: marbleShape,
    position: new CANNON.Vec3(0, 7, 0),
    material: new CANNON.Material({friction: 0.1, restitution: 0.8}),
  });

  world.addBody(marbleBody);

  marbles.push({mesh: marbleMesh, body: marbleBody});
}

function resetMarbles() {
  marbles.forEach(({mesh, body}) => {
    scene.remove(mesh);
    world.removeBody(body);
  });
  marbles = [];
}

function animate() {
  requestAnimationFrame(animate);

  // Step physics world
  world.step(1/60);

  // Sync marble meshes with physics bodies
  marbles.forEach(({mesh, body}) => {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  });

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
