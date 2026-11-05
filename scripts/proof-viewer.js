import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const scene = new THREE.Scene();
scene.background = new THREE.Color("#17191d");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
camera.position.set(3, 2.1, 4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.update();
scene.add(new THREE.HemisphereLight(0xffffff, 0x73717d, 2.2));
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(3, 5, 4);
scene.add(light);
const grid = new THREE.GridHelper(6, 24, 0x50545d, 0x30343b);
scene.add(grid);
let model,
  mixer,
  clips = [],
  edited = false,
  paused = false;
const loader = new GLTFLoader();
window.proof = {};
async function load() {
  try {
    const gltf = await loader.loadAsync(
      edited ? "/proof/human-edited.glb" : "/proof/human.glb",
    );
    if (model) {
      scene.remove(model);
      model.traverse((o) => {
        o.geometry?.dispose();
        if (o.material)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
      });
      mixer?.stopAllAction();
      mixer?.uncacheRoot(model);
    }
    model = gltf.scene;
    scene.add(model);
    clips = gltf.animations;
    mixer = new THREE.AnimationMixer(model);
    play();
    const box = new THREE.Box3().setFromObject(model);
    window.proof = {
      ready: true,
      clips: clips.map((c) => ({ name: c.name, duration: c.duration })),
      height: box.max.y - box.min.y,
      meshes: 0,
      skinned: 0,
    };
    model.traverse((o) => {
      if (o.isMesh) window.proof.meshes++;
      if (o.isSkinnedMesh) window.proof.skinned++;
    });
    document.querySelector("#status").textContent =
      `${edited ? "Edited shirt" : "Original source"} · ${clips.length} clips · drag to orbit · scroll to zoom`;
  } catch (e) {
    window.proof = { error: e.message };
    document.querySelector("#status").textContent = e.message;
  }
}
function play() {
  if (!mixer) return;
  mixer.stopAllAction();
  const clip = clips.find(
    (c) => c.name === document.querySelector("#clip").value,
  );
  if (clip) {
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.reset().play();
  }
}
document.querySelector("#clip").onchange = play;
document.querySelector("#variant").onclick = () => {
  edited = !edited;
  load();
};
document.querySelector("#pause").onclick = (e) => {
  paused = !paused;
  e.target.textContent = paused ? "Play" : "Pause";
};
window.sampleProof = (name, time) => {
  const clip = clips.find((c) => c.name === name);
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.reset().play();
  mixer.setTime(time);
  model.updateMatrixWorld(true);
  const coords = [];
  model.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.skeleton.update();
      const p = new THREE.Vector3();
      o.getVertexPosition(0, p);
      p.applyMatrix4(o.matrixWorld);
      coords.push(...p.toArray());
    }
  });
  return coords;
};
function resize() {
  renderer.setSize(innerWidth, Math.max(300, innerHeight - 110));
  camera.aspect = innerWidth / Math.max(300, innerHeight - 110);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (mixer && !paused) mixer.update(dt);
  controls.update();
  renderer.render(scene, camera);
});
load();
