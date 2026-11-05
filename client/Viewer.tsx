import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { z } from "zod";
import { pin } from "../shared/schema";
export type Pin = z.infer<typeof pin>;
export type CameraState = {
  position: number[];
  target: number[];
  source: string;
};
export function Viewer({
  url,
  clip,
  time,
  playing,
  annotate,
  onPin,
  camera,
  onCamera,
  neutral,
  focusPin,
}: {
  url: string;
  clip: string;
  time: React.RefObject<number>;
  playing: boolean;
  annotate: boolean;
  onPin: (pin: Pin) => void;
  camera: React.RefObject<CameraState | null>;
  onCamera?: () => void;
  neutral: boolean;
  focusPin?: Pin;
}) {
  const host = useRef<HTMLDivElement>(null),
    props = useRef({ clip, playing, annotate, onPin, neutral, focusPin });
  props.current = { clip, playing, annotate, onPin, neutral, focusPin };
  const [error, setError] = useState("");
  useEffect(() => {
    const element = host.current!;
    let disposed = false;
    setError("");
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError("3D preview unavailable. Try reopening this page in Chrome.");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    element.append(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "3D model preview");
    function disposeModel(group: THREE.Group) {
      group.traverse((o: any) => {
        o.geometry?.dispose();
        if (o.material)
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            for (const value of Object.values(m))
              if (value instanceof THREE.Texture) value.dispose();
            m.dispose();
          }
      });
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1c2026");
    const view = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    view.position.set(3, 2, 4);
    const controls = new OrbitControls(view, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.update();
    const key = crypto.randomUUID();
    controls.addEventListener("change", () => {
      if (!syncing) {
        camera.current = {
          position: view.position.toArray(),
          target: controls.target.toArray(),
          source: key,
        };
        onCamera?.();
      }
    });
    let syncing = false;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6c7384, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 5, 4);
    scene.add(light);
    const grid = new THREE.GridHelper(10, 40, 0x535b68, 0x303640);
    scene.add(grid);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 12, 8),
      new THREE.MeshBasicMaterial({ color: "#c5d5ff", depthTest: false }),
    );
    marker.renderOrder = 999;
    marker.visible = false;
    scene.add(marker);
    let model: THREE.Group | undefined,
      mixer: THREE.AnimationMixer | undefined,
      clips: THREE.AnimationClip[] = [],
      active = "",
      mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const plain = new THREE.MeshStandardMaterial({
      color: "#b4b8bf",
      roughness: 0.8,
    });
    new GLTFLoader().load(
      url,
      (g) => {
        if (disposed) {
          disposeModel(g.scene);
          return;
        }
        model = g.scene;
        scene.add(model);
        mixer = new THREE.AnimationMixer(model);
        clips = g.animations;
        model.traverse((o: any) => {
          if (o.isMesh) mats.set(o, o.material);
        });
        const bounds = new THREE.Box3().setFromObject(model),
          size = bounds.getSize(new THREE.Vector3()),
          center = bounds.getCenter(new THREE.Vector3());
        if (!camera.current) {
          const extent = Math.max(size.x, size.y, size.z, 0.1);
          view.position
            .copy(center)
            .add(new THREE.Vector3(extent * 1.5, extent * 0.65, extent * 2.2));
          controls.target.copy(center);
          controls.update();
        }
      },
      undefined,
      (e) => setError(String((e as Error).message)),
    );
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth,
        height = element.clientHeight;
      if (width && height) {
        renderer.setSize(width, height);
        view.aspect = width / height;
        view.updateProjectionMatrix();
      }
    });
    observer.observe(element);
    let down = [0, 0];
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const pointerUp = (e: PointerEvent) => {
      if (
        !props.current.annotate ||
        !model ||
        Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        view,
      );
      const hit = ray.intersectObject(model, true)[0];
      if (hit) {
        const object = hit.object;
        props.current.onPin({
          objectId: object.userData.logical_part_id ?? object.name,
          point: object.worldToLocal(hit.point.clone()).toArray(),
          camera: view.position.toArray(),
          target: controls.target.toArray(),
          clip: props.current.clip,
          time: time.current,
        });
      }
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.setAnimationLoop(() => {
      const c = camera.current;
      if (c && c.source !== key) {
        syncing = true;
        view.position.fromArray(c.position);
        controls.target.fromArray(c.target);
        controls.update();
        syncing = false;
      }
      if (mixer) {
        const name = props.current.clip;
        if (active !== name) {
          mixer.stopAllAction();
          const clip = clips.find((c) => c.name === name);
          if (clip) {
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.play();
          }
          active = name;
        }
        // Absolute-time review must recover from LoopOnce's paused endpoint.
        const selected = clips.find((c) => c.name === name);
        if (selected) mixer.clipAction(selected).reset();
        mixer.setTime(time.current);
      }
      marker.visible = false;
      const pin = props.current.focusPin;
      if (
        pin &&
        model &&
        pin.clip === props.current.clip &&
        Math.abs(pin.time - time.current) < 0.03
      ) {
        model.updateMatrixWorld(true);
        model.traverse((o) => {
          if ((o.userData.logical_part_id ?? o.name) === pin.objectId) {
            marker.position.copy(
              o.localToWorld(new THREE.Vector3(...pin.point)),
            );
            marker.visible = true;
          }
        });
      }
      mats.forEach(
        (mat, mesh) => (mesh.material = props.current.neutral ? plain : mat),
      );
      renderer.render(scene, view);
    });
    return () => {
      disposed = true;
      observer.disconnect();
      controls.dispose();
      renderer.setAnimationLoop(null);
      mixer?.stopAllAction();
      if (model) {
        mixer?.uncacheRoot(model);
        mats.forEach((mat, mesh) => (mesh.material = mat));
        disposeModel(model);
      }
      marker.geometry.dispose();
      marker.material.dispose();
      plain.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);
  return (
    <div className="viewport" ref={host}>
      {error && (
        <div className="viewer-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
