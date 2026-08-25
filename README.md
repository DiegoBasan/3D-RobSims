# 3D-RobSims

Visor 3D web de brazos robóticos industriales (modelo `Roboarm_lowpoly.fbx`, o los que importes), en **vista isométrica**, sobre un fondo de estudio **cálido y claro**, con su **animación** original reproduciéndose en loop y un material **amarillo metalizado de baja rugosidad** (estilo industrial tipo KUKA) para lograr reflejos marcados. Soporta **varios modelos a la vez** en el mismo canvas, cada uno seleccionable, movible, rotable y escalable con un gizmo.

**HTML/JS estático puro — sin build step.** Three.js, sus addons (loaders, controles, post-procesado) y `lil-gui` están vendorizados dentro de `vendor/` y se resuelven en el navegador vía [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) nativo. No hay bundler, no hay `npm run build`, no hay `node_modules` en producción: es la carpeta tal cual, servida por cualquier servidor estático.

## Cómo correrlo en local

Cualquier servidor estático sirve (los módulos ES + `fetch` del FBX necesitan `http://`, no funciona abriendo el `index.html` con `file://`):

```bash
npm run dev
# o, sin npm:
python3 -m http.server 5173
```

Abre `http://localhost:5173`.

## Despliegue en GitHub Pages

No hace falta ningún workflow de GitHub Actions. En **Settings → Pages**, configura:

- **Source:** `Deploy from a branch`
- **Branch:** `main` / `(root)`

GitHub sirve la carpeta tal cual — como no depende de ningún paso de compilación, el `index.html` de la raíz **es** el sitio final.

> Si en algún momento ves una página en blanco pegada en "Cargando modelo 3D…", casi seguro es porque algo (un workflow de Pages, un proxy, etc.) está sirviendo el repo desde una ruta distinta a la raíz, o bloqueando `vendor/` o `models/`. Revisa la consola del navegador: los imports vía import map fallan con un error explícito de módulo no encontrado.

## Qué incluye

- **Cámara ortográfica isométrica real** (~35.264° de elevación / 45° de azimut), con `OrbitControls` limitado para poder inspeccionar el modelo sin salir del feel isométrico, más zoom con scroll.
- **Carga del FBX** (`models/roboarm_lowpoly.fbx`) vía `FBXLoader`, con auto-centrado, auto-escalado y apoyo sobre el piso.
- **Animación** del clip embebido en el FBX reproducida con `AnimationMixer` (play/pausa y velocidad ajustables desde el panel de control).
- **Material PBR** (`MeshPhysicalMaterial`): amarillo `#f5c400`, `metalness: 1`, `roughness` bajo + `clearcoat`, para simular pintura metalizada industrial. Las piezas oscuras originales (juntas, cableado) se detectan por luminancia y se mantienen en un metal oscuro, imitando el contraste típico de un brazo robótico real.
- **Iluminación + IBL**: un environment map generado con `RoomEnvironment` + `PMREMGenerator` da reflejos de estudio realistas sobre el metal, combinado con luz direccional principal (con sombras suaves PCFSoft), luz de relleno y rim light.
- **Post-procesado**: `EffectComposer` con bloom sutil (highlights calientes en el metal), SMAA para bordes limpios, y tone mapping ACES Filmic.
- **Panel de control** (`lil-gui`): color, rugosidad, metalicidad, clearcoat, intensidad de reflejo, exposición, bloom, auto-rotación y controles de animación — para ajustar el look en vivo.
- **Varios modelos en el mismo canvas** (hasta 6, por rendimiento): el botón **"+ Agregar modelo (.fbx)"** agrega una instancia nueva sin reemplazar las existentes; "Duplicar seleccionado" clona la instancia activa (con su propio `AnimationMixer`, animando independiente de las demás vía `SkeletonUtils.clone`).
- **Selección y gizmo de transformación** (`TransformControls`): clic sobre un modelo para seleccionarlo (se resalta con un `BoxHelper` azul) y muévelo/rotalo/escálalo con el gizmo o los atajos `G` / `R` / `S`. `Supr`/`Backspace` elimina la instancia seleccionada (libera geometría y materiales). Un clic en el piso deselecciona.

## Rendimiento

- `antialias: false` en el `WebGLRenderer` — el suavizado ya lo hace `SMAAPass` en post-proceso; correr MSAA *y* SMAA a la vez pagaría el costo de anti-aliasing dos veces.
- `devicePixelRatio` limitado a `1.5×` en vez del nativo (2×+ en pantallas retina/4K), que es el multiplicador más caro de todos: 2× DPR = 4× los píxeles a sombrear en cada pase (PBR, sombras, bloom, SMAA).
- Shadow map de 1536×1536 (en vez de 2048) — sigue siendo nítido a la escala de la escena, más barato de renderizar.
- Tope de 6 modelos simultáneos, para que agregar instancias no degrade el framerate.

## Sobre el look "RTX en la web"

Ray tracing en tiempo real de verdad (path tracing con rebotes de luz reales) no es viable en un navegador para una malla **animada/esqueletal** a buen framerate — reconstruir la estructura de aceleración cada frame para geometría deformable es demasiado costoso para 60 fps.

En su lugar, este proyecto usa el enfoque que en producción se usa para lograr "look RTX" en tiempo real sin path tracing completo: **PBR físicamente correcto + Image-Based Lighting (IBL) + post-procesado**, la misma base que usan los motores de videojuegos con reflejos "casi ray-traced" cuando no pueden pagar el costo de RT completo. Si más adelante quieres dar el salto a ray tracing real, la vía sería congelar la pose (sin animación activa) y renderizar esa pose puntual con un path tracer como `three-gpu-pathtracer`.

## Estructura

```
├── index.html          # import map + montaje de la página
├── src/
│   ├── main.js          # escena, cámara isométrica, luces, material, animación, post-fx, GUI
│   └── style.css
├── models/
│   └── roboarm_lowpoly.fbx
└── vendor/               # three.js (core + addons usados) y lil-gui, vendorizados
    ├── three/            # incluye TransformControls y SkeletonUtils para el multi-modelo
    └── lil-gui/
```
