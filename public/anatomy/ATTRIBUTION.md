# Anatomy model attribution

The 3D models in this directory are derived from **BodyParts3D**.

> BodyParts3D, © The Database Center for Life Science
> licensed under CC Attribution-Share Alike 2.1 Japan

- Source: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html>
- Licence: [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en)

## What was changed

`scripts/build-anatomy-bundle.mjs` cuts region-sized subsets out of the
published atlas and re-encodes them:

- only the meshes one region uses are kept, rather than all 2,234
- indices narrowed from `uint32` to `uint16`
- vertex positions quantised to `uint16` across each mesh's own bounding box
  (verified to under 3 microns against the source by
  `scripts/validate-anatomy-bundle.mjs`)
- vertex normals dropped, to be recomputed from the triangles on load

No vertex was moved and no mesh was reshaped. The geometry is the source's.

## What this means for redistribution

ShareAlike travels with the models. The `.bin.gz` and `.json` files in this
directory are adaptations of BY-SA data and remain **CC BY-SA 2.1 JP**, and the
attribution above has to go with them wherever they go. The application code
that reads them is not a derivative of the geometry and is not covered by it.

Note that the upstream repository this pipeline was modelled on
([ashemag/human-atlas](https://github.com/ashemag/human-atlas)) states the data
is CC BY 4.0. That appears to be incorrect — the DBCLS source says
Attribution-**ShareAlike** 2.1 Japan, which is what is recorded here.
