import { useEffect, useRef, useState, useCallback } from "react";
import { h1, OF } from "../ui/theme";
import Wave from "../ui/Wave";
import { loadRegion, centreOf, extentOf } from "../lib/anatomy";

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
      const [THREE, { OrbitControls }, data] = await Promise.all([
        import("three"),
        import("three/examples/jsm/controls/OrbitControls.js"),
        loadRegion(region, { signal: ac.signal }),
      ]);
      if (dead) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(host.clientWidth, host.clientHeight);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.001, 100);

      /* Two lights and no shadows. A key from the camera's side keeps whatever
         is being looked at lit as it turns, and a dim fill stops the far side
         going to pure black, which reads as a hole rather than a surface. */
      scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3550, 1.15));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(1, 1.4, 2);
      scene.add(key);

      const group = new THREE.Group();
      scene.add(group);

      const meshes = new Map();
      const present = new Set();

      for (const part of data.parts) {
        const g = data.get(part.id);
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(g.positions, 3));
        geom.setIndex(new THREE.BufferAttribute(g.indices, 1));
        /* Not shipped, so derived. int16 normals were 2MB a region and gzip
           could do nothing with them; recomputing costs a beat on load. */
        geom.computeVertexNormals();

        const mesh = new THREE.Mesh(
          geom,
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(SYSTEM_COLOUR[part.system] ?? "#b9b9b9"),
            roughness: 0.72, metalness: 0.02, flatShading: false,
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

      camera.position.set(0, span * 0.12, span * 0.95);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.85;
      controls.minDistance = span * 0.25;
      controls.maxDistance = span * 2.4;

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
          renderer.render(scene, camera);
          if (moving) draw();
        });
      }
      controls.addEventListener("change", draw);

      const ro = new ResizeObserver(() => {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
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
