# CardioEKG reference anatomy

## Bundled CT-derived geometry

- Fanwei Kong and Shawn C. Shadden, HeartDeformNets, `wh_template.vtp`. The upstream project describes this geometry as a surface template from the reference segmentation of a training sample with venous inlet geometry. Repository release license Apache-2.0, copied as `LICENSE-HEARTDEFORMNETS.txt`. [Pinned template](https://github.com/fkong7/HeartDeformNets/blob/679c11169e100fca540855921a26c3e9f81d90dd/templates/meshes/wh_template.vtp) · [Paper DOI](https://doi.org/10.1109/TMI.2022.3219284)
- Original SHA-256 `8bfd3a12783972361d22ffe98fed49c8c293b32e6ba6e55b0fd427179b66b0ca`. `pack-reference.py` preserves all 22,827 vertices and 45,626 triangles, groups triangles by source region, and quantizes coordinates into 16-bit fixed point. The browser normalizes the reference dimensions and reorients the mesh for viewing.
- Offline geometry includes seven source regions representing the left ventricular myocardium, the four chamber surfaces, aorta, and pulmonary trunk. Venous inlets form part of the atrial surfaces. Chamber surfaces trace the blood pools. The bundled mesh has no separate valve leaflets, papillary muscles, or coronary tree.
- The conduction overlay approximates positions against the reference landmarks. It is a conceptual visualization of conduction sequences, not measured tissue or a patient-specific simulation. [Anderson et al., *The anatomy of the cardiac conduction system*](https://doi.org/10.1002/ca.20700)
- The frontal QRS axis is an ECG estimate separate from the geometric orientation of the 3D heart. The tab depicts the six limb leads and shows the supplied axis when present. [AHA/ACCF/HRS ECG standardization recommendations](https://pubmed.ncbi.nlm.nih.gov/19228820/)

## Bundled extended Heart Atlas (default viewer)

- Heart Atlas contributors, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), based on BodyParts3D, © The Database Center for Life Science, [CC BY 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html). The fallback image is the unmodified Heart Atlas `hero-poster.webp` distributed in an inline format. The extended mesh uses muted display colors and a normalized viewport and retains its source license. [Heart Atlas attribution and license](https://github.com/w3lld1/heart-atlas/blob/1b9fdd321cbc517802ffff4e0f896457a4a2b9a4/LICENSE-CONTENT) · [Source mesh and available structures](https://github.com/w3lld1/heart-atlas/tree/1b9fdd321cbc517802ffff4e0f896457a4a2b9a4/assets/models/heart)
- `public/anatomy/heart.glb` bundles the pinned atlas unmodified (SHA-256 `091cdd5140c0cc63850799136bcac4e0451a86796195700ff9aea2ec6a2305e9`, 2,252,576 bytes, 123,812 triangles across 27 meshes). The default viewer fetches it from the same Site origin, including for practice captures. No external atlas request is needed. Upstream license text and register are distributed beside the GLB.
- Display adaptations: uniform normalization, smooth calculated normals, muted tissue colors, depth-sorted translucent layers, and a moving color band for schematic electrical activation. The GLB geometry is unchanged. Adapted atlas visualizations retain CC BY-SA 4.0. Code licensing remains separate.
- Includes four chambers, four valves, papillary muscles, great vessels, coronary arteries/veins, and a schematic conduction network. Ventricular geometry represents chamber/cavity surfaces; there is no separate complete myocardial shell. Septal anchor nodes have no geometric mesh. This is a reference atlas, not a patient-specific or clinically validated electromechanical simulation.
- If the bundled atlas fails to load, the CT-derived fallback remains available with an explicit loading error and retry button.
- Captures without verified temporal annotations use an explicitly labeled teaching sequence driven by cursor position at the estimated rate (60 bpm fallback). It does not detect or label the uploaded ECG’s P/QRS/T waves and does not supply a diagnosis.

## Human Reference Atlas / HuBMAP (alternative myocardium and septum dataset)

- HuBMAP Consortium / Human Reference Atlas, **Visible Human Male Heart v1.2**, based on the National Library of Medicine Visible Human Male dataset. [Pinned GLB](https://raw.githubusercontent.com/hubmapconsortium/ccf-releases/b036a91aaf7234f462b1249d4a5f4fb0e982f412/v1.2/models/VH_M_Heart.glb).
- [Official reference library](https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html) declares all CCF 3D reference objects **CC BY 4.0**. See locally served `public/anatomy/LICENSE-HRA.txt`.
- CardioEKG preserves anatomical triangles and proportions, normalizes the viewport uniformly and changes teaching display colors. The septum is an actual separate mesh, not an annotation anchor. HRA conduction paths are authored teaching landmarks described in `docs/anatomy-model.md`, not segmented nodal tissue.
- This complete dataset replaces Heart Atlas when selected; anatomical meshes from the two sources are never composited as though they were one individual.

- HRA v1.2 recommended citation: Browne, K., Schlehlein, H., Herr II, B. W., Quardokus, E., Bueckle, A., Börner, K. (2022). HuBMAP CCF 3D Reference Object Library. https://hubmapconsortium.github.io/ccf/pages/ccf-3d-reference-library.html.

## Visible reference labels

CardioEKG labels a limited selection of source structures in each view. Leaders anchor to retained source mesh vertices and reproject when the model rotates. Side labels are spaced to remain legible, and anatomical right/left/superior directions rotate with the model. The apex marker uses the lowest source vertex of the left ventricular surface. These display annotations add no anatomical geometry. Heart Atlas is the default; HRA remains selectable separately.
