import { useEffect, useRef, useState, useCallback } from "react";
import { h1, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import { loadRegion, centreOf, extentOf } from "../lib/anatomy";
import { preToneMap } from "../lib/toneMap";
import { structureColour } from "../lib/anatomyColour";

/**
 * The 3D anatomy explorer.
 *
 * One mesh per structure rather than merged batches. Merging is faster to draw
 * — the upstream atlas does it — but it puts every structure in one object, so
 * selecting, hiding and highlighting all have to be rebuilt in a shader. Per
 * part, three.js already does those: raycasting returns the object you clicked,
 * visibility is a boolean, highlight is a material. The cost is a draw call per
 * structure, which is why the vessel systems start hidden: arteries and veins
 * are 1,043 of the atlas's 2,234 meshes and dominate the count without being
 * what anyone opened the screen to look at.
 *
 * three.js is imported inside the effect, so the ~150KB of it lands only for
 * someone who opens this screen.
 */

const REGION_LABEL = { heart: "Heart", thorax: "Chest", abdomen: "Abdomen" };

/* Ambient occlusion is off unless asked for with ?ao=1.
   It shipped on and the screen came back blank, which is the wrong way round
   for an effect that cannot be checked without a browser: everything else in
   the lighting pass is a material or a curve and cannot fail to a white
   rectangle, where a depth-based post pass very much can. On by request until
   it has been seen working. */
const wantsAO = () =>
  typeof location !== "undefined" && new URLSearchParams(location.search).get("ao") === "1";

/* How far vessels are lifted clear of the organ they run on, as a fraction of
   the model's size. Overridable with ?lift= for tuning without a rebuild. */
const DEFAULT_LIFT = 0.012;
const liftAmount = () => {
  if (typeof location === "undefined") return DEFAULT_LIFT;
  const v = new URLSearchParams(location.search).get("lift");
  return v === null || Number.isNaN(Number(v)) ? DEFAULT_LIFT : Number(v);
};

/* Vessels lie on the surface of the thing they supply, and the surface they
   lie on is a separate mesh that was segmented independently — so the two
   interpenetrate, and a coronary artery spends half its length inside the
   myocardium. It reads as a dashed line: the artery is one continuous tube,
   verified, and what you see is only the part that surfaces.

   Nothing in the data says how deep any given point is buried, so this pushes
   vessels radially out from the model's centre. That is only an approximation
   of "outwards", but a heart is convex enough for it to hold, and it moves the
   whole tube rather than closing a gap that was never there. */
const LIFTED = new Set(["arterial", "venous"]);

/* The atlas's own system colours, which are anatomical convention — arteries
   red, veins blue, bone off-white — rather than a palette choice to make here. */
const SYSTEM_COLOUR = {
  skeletal: "#e2d9ba", muscular: "#a85b50", cardiac: "#b96760", sensory: "#b0c8ce",
  arterial: "#c05245", venous: "#527c9f", nervous: "#d8b565", respiratory: "#b98991",
  digestive: "#b8916b", urinary: "#b47961", lymphatic: "#879f7c", endocrine: "#c5a09a",
  reproductive: "#bda098", integumentary: "#ba9b7d", connective: "#aec3bb",
};
const SYSTEM_LABEL = {
  skeletal: "Bone", muscular: "Muscle", cardiac: "Heart", sensory: "Sensory",
  arterial: "Arteries", venous: "Veins", nervous: "Nerves", respiratory: "Airways",
  digestive: "Digestive", urinary: "Urinary", lymphatic: "Lymphatic",
  endocrine: "Endocrine", reproductive: "Reproductive", integumentary: "Skin",
  connective: "Connective",
};
/* Dense and rarely the subject. Shown on request, not on arrival. */
const HIDDEN_BY_DEFAULT = new Set(["arterial", "venous", "integumentary", "connective"]);

export default function AnatomyView({ region: initial = "heart" }) {
  const [region, setRegion] = useState(initial);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [systems, setSystems] = useState([]);
  const [hidden, setHidden] = useState(HIDDEN_BY_DEFAULT);
  const [selected, setSelected] = useState(null);

  const hostRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    let dead = false;
    const host = hostRef.current;
    if (!host) return;

    setStatus("loading");
    setError("");
    setSelected(null);

    const ac = new AbortController();

    (async () => {
      const ao = wantsAO();
      const [THREE, { OrbitControls }, { RoomEnvironment }, post, data] = await Promise.all([
        import("three"),
        import("three/examples/jsm/controls/OrbitControls.js"),
        import("three/examples/jsm/environments/RoomEnvironment.js"),
        /* Three chunks that are only fetched when the effect is asked for. */
        ao
          ? Promise.all([
              import("three/examples/jsm/postprocessing/EffectComposer.js"),
              import("three/examples/jsm/postprocessing/SSAOPass.js"),
              import("three/examples/jsm/postprocessing/OutputPass.js"),
            ]).then(([a, b, c]) => ({ ...a, ...b, ...c }))
          : null,
        loadRegion(region, { signal: ac.signal }),
      ]);
      if (dead) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(host.clientWidth, host.clientHeight);
      /* Filmic, not linear. Untone-mapped output clips the highlights on a lit
         curved surface to flat white, which is most of why this read as
         plastic — the shine had no shoulder to roll off into. */
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      /* Opaque, matching the sheet it sits on, rather than a transparent
         canvas: postprocessing composites into its own buffers and has no page
         behind it to blend with, so the ground has to be in the scene. Read
         from the token, so dark mode comes along.

         Pre-corrected, because the background is tone mapped along with
         everything else and ACES turns white into about 0.8 — clear to the
         sheet's own colour and you get a grey rectangle sitting in a white
         sheet. preToneMap hands back the colour that comes out as this one. */
      const sheet = getComputedStyle(document.documentElement)
        .getPropertyValue("--c-card-solid").trim() || "#ffffff";
      const ground = preToneMap(sheet, renderer.toneMappingExposure);
      scene.background = ground
        ? new THREE.Color().setRGB(ground[0], ground[1], ground[2], THREE.LinearSRGBColorSpace)
        : new THREE.Color(sheet);

      /* near and far are set below, once the model's size is known. Fixed at
         0.001 and 100 they spanned a range 100,000 times deeper than a heart
         0.19m across, which leaves a depth buffer with no usable precision —
         invisible while nothing reads depth, ruinous for anything that does. */
      const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.01, 10);

      /* An environment, not just lights. Two directional lights give a surface
         one or two highlights and flat shadow everywhere else; an irradiance
         map lights it from every direction at once, which is what makes a
         curved organic form read as curved. RoomEnvironment is generated at
         runtime, so this costs no asset. */
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;

      /* The environment now does the ambient work, so the key is here only to
         give a consistent sense of direction as the model turns. Much dimmer
         than it was, or it flattens what the environment is providing. */
      const key = new THREE.DirectionalLight(0xffffff, 0.55);
      key.position.set(1, 1.4, 2);
      scene.add(key);

      const group = new THREE.Group();
      scene.add(group);

      const meshes = new Map();
      const present = new Set();

      /* Each concept's place among the concepts of its own system, so the
         colour spread is per family: the digestive concepts divide the
         digestive hue range between them rather than competing with the
         arteries for it. Sorted, so the assignment is stable across loads
         rather than depending on the order parts happen to arrive in. */
      const rank = new Map();
      for (const sys of new Set(data.parts.map(p => p.system))) {
        const names = [...new Set(
          data.parts.filter(p => p.system === sys).map(p => data.conceptOf.get(p.id) ?? p.name),
        )].sort();
        names.forEach((n, i) => rank.set(sys + "\u0000" + n, i));
      }

      /* The model's centre, from the manifest rather than from the built scene,
         because the vessels need it while their geometry is being made. */
      const lo = [Infinity, Infinity, Infinity], hiB = [-Infinity, -Infinity, -Infinity];
      for (const part of data.parts) {
        for (let c = 0; c < 3; c++) {
          if (part.bounds[0][c] < lo[c]) lo[c] = part.bounds[0][c];
          if (part.bounds[1][c] > hiB[c]) hiB[c] = part.bounds[1][c];
        }
      }
      const mid = lo.map((v, i) => (v + hiB[i]) / 2);
      const modelSpan = Math.hypot(hiB[0] - lo[0], hiB[1] - lo[1], hiB[2] - lo[2]);
      const lift = liftAmount() * modelSpan;

      for (const part of data.parts) {
        const g = data.get(part.id);

        let positions = g.positions;
        if (lift > 0 && LIFTED.has(part.system)) {
          /* A copy: the loader caches decoded geometry, and displacing in place
             would move the vessel again every time the region is reopened. */
          positions = Float32Array.from(g.positions);
          for (let i = 0; i < positions.length; i += 3) {
            const dx = positions[i] - mid[0];
            const dy = positions[i + 1] - mid[1];
            const dz = positions[i + 2] - mid[2];
            const d = Math.hypot(dx, dy, dz);
            if (d < 1e-6) continue;
            positions[i] += (dx / d) * lift;
            positions[i + 1] += (dy / d) * lift;
            positions[i + 2] += (dz / d) * lift;
          }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geom.setIndex(new THREE.BufferAttribute(g.indices, 1));
        /* Not shipped, so derived. int16 normals were 2MB a region and gzip
           could do nothing with them; recomputing costs a beat on load. */
        geom.computeVertexNormals();

        /* Physical rather than standard, for the clearcoat. Tissue is wet: a
           thin, rough specular layer over a diffuse body is what separates it
           from dry plastic, and it costs one more term rather than a texture. */
        const mesh = new THREE.Mesh(
          geom,
          new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(structureColour({
              base: SYSTEM_COLOUR[part.system] ?? "#b9b9b9",
              system: part.system,
              concept: data.conceptOf.get(part.id) ?? part.name,
              index: rank.get(part.system + "\u0000" + (data.conceptOf.get(part.id) ?? part.name)) ?? 0,
            })),
            roughness: 0.58,
            metalness: 0,
            clearcoat: 0.16,
            clearcoatRoughness: 0.52,
            envMapIntensity: 0.9,
            flatShading: false,
          }),
        );
        mesh.userData.part = part;
        mesh.visible = !HIDDEN_BY_DEFAULT.has(part.system);
        group.add(mesh);
        meshes.set(part.id, mesh);
        present.add(part.system);
      }

      /* The model is in metres in world space — a chest sits around y=1.2 —
         so it is recentred on the origin rather than orbiting about the floor. */
      const box = new THREE.Box3().setFromObject(group);
      const centre = box.getCenter(new THREE.Vector3());
      group.position.sub(centre);
      const span = box.getSize(new THREE.Vector3()).length();

      /* A range of about 2,000:1 rather than 100,000:1, and one that follows
         the model: a heart and a whole chest differ by an order of magnitude. */
      camera.near = span / 100;
      camera.far = span * 20;
      camera.updateProjectionMatrix();

      camera.position.set(0, span * 0.12, span * 0.95);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.85;
      controls.minDistance = span * 0.25;
      controls.maxDistance = span * 2.4;

      /* Ambient occlusion, which for this content is not a garnish. Anatomy is
         a pile of overlapping forms — a vessel lying in a groove, a valve
         inside a chamber — and what tells you one is behind another is the
         darkening where they meet. Without it every structure floats at the
         same depth however good the material is.

         The radii are derived from the model rather than left at the defaults,
         which assume a scene measured in the tens of units. This one is in
         metres and a heart is 0.1 of them across, so the stock kernelRadius of
         8 would sample the entire model for every pixel and return a flat grey. */
      let composer = null;
      if (ao && post) {
        composer = new post.EffectComposer(renderer);
        const ssao = new post.SSAOPass(scene, camera, host.clientWidth, host.clientHeight);
        ssao.kernelRadius = span * 0.045;
        ssao.minDistance = span * 0.0004;
        ssao.maxDistance = span * 0.05;
        composer.addPass(ssao);
        /* Last, and it is what applies the tone mapping: once a composer owns
           the output the renderer's own tone mapping is bypassed, so without
           this pass the ACES curve set above would silently do nothing. */
        composer.addPass(new post.OutputPass());
      }

      const ray = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let highlighted = null;

      function highlight(id) {
        if (highlighted && meshes.has(highlighted)) {
          const m = meshes.get(highlighted);
          m.material.emissive.setHex(0x000000);
          m.material.emissiveIntensity = 0;
        }
        highlighted = id;
        if (id && meshes.has(id)) {
          const m = meshes.get(id);
          m.material.emissive.set("#3562f5");
          m.material.emissiveIntensity = 0.55;
        }
        draw();
      }

      /* A click that ends where it started is a selection; one that moved is
         the end of a drag, and selecting on it would make the model
         unrotatable without changing what is picked. */
      let downAt = null;
      const onDown = e => { downAt = [e.clientX, e.clientY]; };
      const onUp = e => {
        if (!downAt) return;
        const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
        downAt = null;
        if (moved > 4) return;

        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObjects(group.children.filter(m => m.visible), false)[0];
        const part = hit?.object.userData.part ?? null;
        setSelected(part);
        highlight(part?.id ?? null);
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);

      /* Rendered on demand, not on a loop: a still model on a study screen has
         no reason to occupy the GPU, and damping is the only thing that keeps
         moving after a gesture ends. */
      let queued = false;
      function draw() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const moving = controls.update();
          /* Straight to the screen when there is no composer — the renderer
             applies its own tone mapping in that path. */
          if (composer) composer.render(); else renderer.render(scene, camera);
          if (moving) draw();
        });
      }
      controls.addEventListener("change", draw);

      const ro = new ResizeObserver(() => {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        composer?.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        draw();
      });
      ro.observe(host);
      draw();

      apiRef.current = {
        setVisible(system, on) {
          for (const m of group.children) if (m.userData.part.system === system) m.visible = on;
          draw();
        },
        focus(part) {
          const c = centreOf(part);
          const target = new THREE.Vector3(c[0], c[1], c[2]).sub(centre);
          controls.target.copy(target);
          const d = Math.max(extentOf(part) * 2.6, span * 0.12);
          camera.position.copy(target).add(new THREE.Vector3(0, d * 0.25, d));
          controls.update();
          draw();
        },
        highlight,
        dispose() {
          ro.disconnect();
          controls.dispose();
          renderer.domElement.removeEventListener("pointerdown", onDown);
          renderer.domElement.removeEventListener("pointerup", onUp);
          for (const m of group.children) { m.geometry.dispose(); m.material.dispose(); }
          composer?.dispose();
          envRT.texture.dispose();
          pmrem.dispose();
          renderer.dispose();
          host.removeChild(renderer.domElement);
        },
      };

      setSystems([...present].sort((a, b) => (SYSTEM_LABEL[a] ?? a).localeCompare(SYSTEM_LABEL[b] ?? b)));
      setHidden(new Set([...HIDDEN_BY_DEFAULT].filter(s => present.has(s))));
      setStatus("ready");
    })().catch(err => {
      if (dead || err.name === "AbortError") return;
      setError(err.message || "Could not load the model.");
      setStatus("error");
    });

    return () => {
      dead = true;
      ac.abort();
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [region]);

  const toggle = useCallback(system => {
    setHidden(prev => {
      const next = new Set(prev);
      const showing = next.has(system);
      if (showing) next.delete(system); else next.add(system);
      apiRef.current?.setVisible(system, showing);
      return next;
    });
  }, []);

  return (
    <div className="anat">
      <div className="anat__head">
        <h1 style={{ ...h1, color: OF.text, margin: 0 }}>Anatomy</h1>
        <div className="anat__regions">
          {Object.keys(REGION_LABEL).map(r => (
            <button
              key={r}
              type="button"
              className={`anat__region${r === region ? " is-on" : ""}`}
              onClick={() => setRegion(r)}
            >
              {REGION_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {/* The same waterline every other screen uses, with the same two colours.
          It was rendered here with no props at all, and an SVG path with no
          fill paints black — which is the bar that was across the top. The
          model sits on the sheet below it now rather than straight on the
          field, so the boundary reads the way it does on every other tab. */}
      <Wave from="transparent" to="var(--c-card-solid)" />

      <div className="anat__sheet">
      <div className="anat__stage">
        <div ref={hostRef} className="anat__canvas" />

        {status === "loading" && (
          <div className="anat__veil">Loading the {REGION_LABEL[region].toLowerCase()}…</div>
        )}
        {status === "error" && <div className="anat__veil is-error">{error}</div>}

        {status === "ready" && (
          <>
            <div className="anat__systems">
              {systems.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`anat__sys${hidden.has(s) ? " is-off" : ""}`}
                  onClick={() => toggle(s)}
                >
                  <span className="anat__swatch" style={{ background: SYSTEM_COLOUR[s] }} />
                  {SYSTEM_LABEL[s] ?? s}
                </button>
              ))}
            </div>

            <div className={`anat__name${selected ? " is-on" : ""}`}>
              {selected ? (
                <>
                  <div className="anat__name-label">{selected.name}</div>
                  <div className="anat__name-sub">{SYSTEM_LABEL[selected.system] ?? selected.system}</div>
                </>
              ) : (
                <div className="anat__name-sub">Tap any structure to name it</div>
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
