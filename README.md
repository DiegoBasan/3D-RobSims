# 3D-RobSims

Visor 3D web de un brazo robótico industrial (modelo `Roboarm_lowpoly.fbx`), en **vista isométrica**, con su **animación** original reproduciéndose en loop y un material **amarillo metalizado de baja rugosidad** (estilo industrial tipo KUKA) para lograr reflejos marcados, cercanos al look "render" de la imagen de referencia.

Construido con **Three.js + Vite**, sin backend: todo corre en el navegador.

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre la URL que imprime Vite (por defecto `http://localhost:5173`).

Para generar una build estática de producción:

```bash
npm run build
npm run preview
```

## Despliegue en GitHub Pages

El repo incluye `.github/workflows/deploy-pages.yml`, que compila el proyecto (`npm run build`) y publica `dist/` en GitHub Pages automáticamente en cada push a `main`.

**Importante:** GitHub Pages sirve el `index.html` de la raíz del repo tal cual si no le dices lo contrario, y ese `index.html` es solo el *código fuente* (usa `import` de módulos bare como `three`, que el navegador no puede resolver sin un bundler) — por eso, si abres la página y se queda pegada en "Cargando modelo 3D…", es porque está sirviendo el repo crudo en vez del build. Para que funcione:

1. Ve a **Settings → Pages** en GitHub.
2. En **Source**, selecciona **GitHub Actions** (no "Deploy from a branch").
3. Con eso el workflow se encarga de compilar y publicar el `dist/` correcto en cada push a `main`.

## Qué incluye

- **Cámara ortográfica isométrica real** (~35.264° de elevación / 45° de azimut), con `OrbitControls` limitado para poder inspeccionar el modelo sin salir del feel isométrico, más zoom con scroll.
- **Carga del FBX** (`public/models/roboarm_lowpoly.fbx`) vía `FBXLoader`, con auto-centrado, auto-escalado y apoyo sobre el piso.
- **Animación** del clip embebido en el FBX reproducida con `AnimationMixer` (play/pausa y velocidad ajustables desde el panel de control).
- **Material PBR** (`MeshPhysicalMaterial`): amarillo `#f5c400`, `metalness: 1`, `roughness` bajo + `clearcoat`, para simular pintura metalizada industrial. Las piezas oscuras originales (juntas, cableado) se detectan por luminancia y se mantienen en un metal oscuro, imitando el contraste típico de un brazo robótico real.
- **Iluminación + IBL**: un environment map generado con `RoomEnvironment` + `PMREMGenerator` da reflejos de estudio realistas sobre el metal, combinado con luz direccional principal (con sombras suaves PCFSoft), luz de relleno y rim light.
- **Post-procesado**: `EffectComposer` con bloom sutil (highlights calientes en el metal), SMAA para bordes limpios, y tone mapping ACES Filmic.
- **Panel de control** (`lil-gui`): color, rugosidad, metalicidad, clearcoat, intensidad de reflejo, exposición, bloom, auto-rotación y controles de animación — para ajustar el look en vivo.

## Sobre el look "RTX en la web"

Ray tracing en tiempo real de verdad (path tracing con rebotes de luz reales) no es viable en un navegador para una malla **animada/esqueletal** a buen framerate — herramientas como path tracers de Three.js (WebGL/WebGPU) rebuilding la BVH cada frame para geometría deformable son demasiado costosas para 60 fps.

En su lugar, este proyecto usa el enfoque que en producción se usa para lograr "look RTX" en tiempo real sin path tracing completo: **PBR físicamente correcto + Image-Based Lighting (IBL) + post-procesado**, que es la misma base que usan los motores de videojuegos con reflejos "casi ray-traced" cuando no pueden pagar el costo de RT completo. Si más adelante quieres dar el salto a ray tracing real, la vía sería congelar la pose (sin animación activa) y renderizar esa pose puntual con un path tracer como `three-gpu-pathtracer`.

## Estructura

```
├── index.html
├── src/
│   ├── main.js       # escena, cámara isométrica, luces, material, animación, post-fx, GUI
│   └── style.css
└── public/
    └── models/
        └── roboarm_lowpoly.fbx
```
