import { useRef, useMemo, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import type { MotionValue } from "framer-motion";
import { useTransform } from "framer-motion";
import * as THREE from "three";

const FG_URL = "/paralax_images/foreground.png";
const ISLAND_URL = "/paralax_images/island.png";
const TREES_URL = "/paralax_images/trees%20background.png";
const SKY_URL = "/paralax_images/background.jpg";
const MASK_URL = "/paralax_images/water%20distrosion%20mask.jpg";
const SKY_Y_LIFT = 0.04;
const ISLAND_Y_LIFT = 0.13;
const TREES_Y_LIFT = 0.12;
const FOREGROUND_Y_LIFT = 0;
const ISLAND_Z = -1.16;
const PLANE_SCALE = 0.9;

type Props = { scrollYProgress: MotionValue<number> };

function useMotionRef(mv: MotionValue<number>) {
  const ref = useRef(mv.get());
  useEffect(() => mv.on("change", (v) => (ref.current = v)), [mv]);
  return ref;
}

export function ParallaxPlanes({ scrollYProgress }: Props) {
  const { viewport } = useThree();

  const r = useMemo(
    () => 1 - Math.min(0, 1 - viewport.width / viewport.height / 2.05),
    [viewport.width, viewport.height],
  );

  const [foreground, islandWithWater, trees, sky, waterMask] = useTexture([
    FG_URL,
    ISLAND_URL,
    TREES_URL,
    SKY_URL,
    MASK_URL,
  ]);

  useEffect(() => {
    sky.wrapS = THREE.RepeatWrapping;
    sky.wrapT = THREE.RepeatWrapping;
    sky.minFilter = THREE.LinearFilter;
    sky.generateMipmaps = false;
    sky.needsUpdate = true;
  }, [sky]);

  /*
   * Theatre.js track names → useTransform mappings.
   *
   * IMPORTANT: The reference uses confusing naming:
   *   "layerSky"        ref → renders the FOREGROUND texture  (z = -1)
   *   "layerForeground" ref → renders the SKY shader          (z = -1.205)
   *
   * Y keyframes (from theatre-phone-state.json normalizedScrollProgressHints):
   *   layerSky.y            : [scroll 0.217 → 0.2548,  scroll 1 → 0.48   ]
   *   layerIslandWithWater.y: [scroll 0     → -0.2558, scroll 1 → 0.3080 ]
   *   layerTrees.y          : [scroll 0     → -0.2107, scroll 1 → 0.3207 ]
   *   layerForeground.y     : [scroll 0     → -0.2521, scroll 1 → -0.0245]
   */
  const yLayerSky = useMotionRef(
    useTransform(scrollYProgress, [0, 0.217, 1], [0.2, 0.2547622237385945, 0.48]),
  );
  const yLayerIsland = useMotionRef(
    useTransform(scrollYProgress, [0, 1], [-0.255793859685126, 0.3079630832162021]),
  );
  const yLayerTrees = useMotionRef(
    useTransform(scrollYProgress, [0, 1], [-0.21072316362728313, 0.3206733786296287]),
  );
  const yLayerFg = useMotionRef(
    useTransform(scrollYProgress, [0, 1], [-0.2521048169111726, -0.0245083742333775]),
  );

  const skyRef = useRef<THREE.Mesh>(null);
  const islandRef = useRef<THREE.Mesh>(null);
  const treesRef = useRef<THREE.Mesh>(null);
  const foregroundRef = useRef<THREE.Mesh>(null);

  const islandMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: islandWithWater },
          uMask: { value: waterMask },
          uTime: { value: 0 },
          uOpacity: { value: 1 },
        },
        transparent: true,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D uTexture;
          uniform sampler2D uMask;
          uniform float uTime;
          uniform float uOpacity;
          varying vec2 vUv;
          float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
          }
          void main() {
            vec2 center = vec2(0.5, 2.0);
            float dist = distance(vUv * vec2(.25, 2.5), center);
            float noise = random(vUv * vec2(90.0, 60.0) + uTime * 1.42) * 1.0;
            float maskValue = texture2D(uMask, vUv).r;
            float ripple = (sin(dist * 1110.0 - uTime * 8.0) + noise) * 0.001 * maskValue;
            vec2 distortedUv = vUv + normalize(vUv - center) * ripple;
            gl_FragColor = texture2D(uTexture, distortedUv);
            gl_FragColor.a *= uOpacity;
          }`,
      }),
    [islandWithWater, waterMask],
  );

  const foregroundMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: sky },
          uTime: { value: 0 },
          uOpacity: { value: 1 },
        },
        transparent: true,
        vertexShader: `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vUv = uv + vec2(uTime * 0.005, 0.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D uTexture;
          uniform float uOpacity;
          varying vec2 vUv;
          void main() {
            gl_FragColor = texture2D(uTexture, fract(vUv));
            gl_FragColor.a *= uOpacity;
          }`,
      }),
    [sky],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    islandMaterial.uniforms.uTime.value = t;
    foregroundMaterial.uniforms.uTime.value = t;

    const scaleX = 0.12 * r * PLANE_SCALE;
    const scaleY = 0.1687 * r * PLANE_SCALE;
    const off = (1.687 * r - 1.687) / 2;

    if (skyRef.current) {
      skyRef.current.position.set(0, yLayerSky.current + off + SKY_Y_LIFT, -1);
      skyRef.current.scale.set(scaleX, scaleY, 1);
    }
    if (islandRef.current) {
      islandRef.current.position.set(
        0,
        yLayerIsland.current + off + ISLAND_Y_LIFT,
        ISLAND_Z,
      );
      islandRef.current.scale.set(scaleX, scaleY, 1);
    }
    if (treesRef.current) {
      treesRef.current.position.set(0, yLayerTrees.current + off + TREES_Y_LIFT, -1.2);
      treesRef.current.scale.set(scaleX, scaleY, 1);
    }
    if (foregroundRef.current) {
      foregroundRef.current.position.set(
        0,
        yLayerFg.current + off + FOREGROUND_Y_LIFT,
        -1.205,
      );
      foregroundRef.current.scale.set(scaleX, scaleY, 1);
    }
  });

  return (
    <group>
      <mesh ref={skyRef} position={[0, 0, -1.01]} scale={[0.12, 0.1687, 1]}>
        <planeGeometry args={[10, 10]} />
        <meshBasicMaterial map={foreground} transparent />
      </mesh>

      <mesh ref={islandRef} position={[0, 0, -1.02]} scale={[0.12, 0.1687, 1]}>
        <planeGeometry args={[10, 10]} />
        <primitive object={islandMaterial} attach="material" />
      </mesh>

      <mesh ref={treesRef} position={[0, 0, -1.03]} scale={[0.12, 0.1687, 1]}>
        <planeGeometry args={[10, 10]} />
        <meshBasicMaterial map={trees} transparent />
      </mesh>

      <mesh ref={foregroundRef} position={[0, 0, -1.04]} scale={[0.12, 0.1687, 1]}>
        <planeGeometry args={[10, 10]} />
        <primitive object={foregroundMaterial} attach="material" />
      </mesh>
    </group>
  );
}
