# vendor/

Dependencias vendorizadas para que el sitio funcione sin bundler ni `npm install`, resueltas vía import map en `index.html`.

- `three/` — [three.js](https://github.com/mrdoob/three-js) r169 (`three.module.js` + los addons de `examples/jsm/` que usa este proyecto: `OrbitControls`, `FBXLoader`, `RoomEnvironment`, `EffectComposer`/`RenderPass`/`UnrealBloomPass`/`SMAAPass`/`OutputPass` y sus dependencias internas). Licencia MIT.
- `lil-gui/` — [lil-gui](https://github.com/georgealways/lil-gui) 0.19.2 (build ESM). Licencia MIT.

Para actualizar de versión: copiar los archivos correspondientes desde `node_modules/three` / `node_modules/lil-gui` tras `npm install three@<version> lil-gui@<version>` en un entorno con esas dependencias, o descargarlos directamente de sus releases.
