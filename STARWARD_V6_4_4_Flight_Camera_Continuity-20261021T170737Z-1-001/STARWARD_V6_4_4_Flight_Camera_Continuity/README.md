# Space Mission Parts Library

106 side-view SVG parts: 62 rocket, 22 satellite, 22 rover.

- svg/<category>/<part_id>.svg   one file per part
- parts_manifest.json            id, category, size, attach nodes (viewBox coords), mass_kg/cost left null for you to fill
- catalog.html                   self-contained browsable catalog (open in any browser)
- overview.png                   every part on one sheet

## Conventions (all parts)
- Standard stack diameters: S = 40, M = 80, L = 120 units. Heights are multiples of 20. viewBox = "0 0 W H", transparent background.
- Light from upper left. Colors are CSS variables (:root inside each SVG): --hull-light/mid/dark/shadow, --metal-dark,
  --accent-cyan, --accent-amber, --glow-engine, --solar-cell, --solar-grid, --line. Change them to retheme.
- Layers: #body, #details, #lights, #nodes. Some parts add #deployed / #stowed (stowed is hidden with display:none)
  or #half-left / #half-right (fairings: translate the halves apart on separation).
- Attach nodes: <circle class="node" data-type="stack-top|stack-bottom|radial|surface" data-x data-y>, invisible. Same data is in the manifest.
- Gradient ids are prefixed per part, so many parts can be inlined in one page. If you inline them, query layers through
  [data-part-id="..."] (layer ids repeat across files), or load them as <img>.
