# Original 2D Rocket Parts — SVG Pack

These SVGs are original replacement assets for a vanilla HTML/CSS/JavaScript 2D spaceflight game.

They are NOT official Spaceflight Simulator assets and are not copies of its artwork.

Included:
- capsule
- probe core
- small/medium/large fuel tanks
- small/medium/vacuum engines
- nose cone
- fin
- decoupler
- separator
- adapter
- landing leg
- parachute
- solar panel
- battery
- RCS
- docking port
- fairing
- reaction wheel
- wheel
- strut
- science module

Recommended integration:
Use each SVG as an <img>, ImageBitmap, or draw it onto an HTML5 Canvas.
Keep the SVGs as external assets rather than embedding large strings inside JavaScript.

All dimensions are intentionally simple and can be recolored/resized in CSS or Canvas.

## Integration in this game

The supplied SVG files are used directly as the artwork for their matching
parts; the additional catalog parts use the generated SVG artwork. The sprite
sheet is only a fallback:

- `js/rocket/partDefinitions.js` points matching entries directly at the
  supplied root-level SVG files, without editing or copying their contents;
- `js/rocket/partSprites.js` loads every part's SVG at start-up;
- `Renderer.drawPart` draws the pack art first, re-rastered at the size the
  part is drawn at, so parts stay sharp at any zoom (build, ghost and flight);
- the parts bin shows the same pack art as `<img>` thumbnails, dropping back
  to the sprite-sheet cell if a file will not load;
- `tools/packTest.js` (part of `npm test`) checks every file, and
  `probePack.html` paints each part and reads the canvas back.
