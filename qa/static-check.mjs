import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const html = read('dist/index.html');
const css = read('dist/styles.css');
const script = read('dist/script.js');
const source = read('src/main.js');
const iteration = read('ITERATION.md');

const checks = [
  ['3D canvas exists', html.includes('id="squishCanvas"')],
  ['data-driven material catalog exists', html.includes('id="sceneFilter"') && html.includes('id="materialOptions"') && source.includes('const SCENES') && source.includes('renderMaterialCatalog') && Object.keys(JSON.parse(`{"foam":1,"fruit":1,"bubble":1,"jelly":1}`)).every(name => source.includes(`${name}: {`))],
  ['pointer gestures are browser-owned', css.includes('touch-action: none') && css.includes('overscroll-behavior: contain')],
  ['visible interaction status exists', html.includes('class="interaction-status"') && css.includes('.interaction-status.is-visible')],
  ['gesture lifecycle counters exist', ['gestureCount', 'releaseCount', 'cancelCount'].every(name => script.includes(name))],
  ['two finger twist rotation exists', source.includes('pinchStartAngle') && source.includes('shortestAngle') && script.includes('pinchStartAngle')],
  ['all direction pull path exists', source.includes('screenPullToLocal') && source.includes('clampLength(0, .5)')],
  ['window release fallback exists', source.includes("window.addEventListener('pointerup', releasePointer)") && source.includes("window.addEventListener('pointercancel', releasePointer)")],
  ['browser gesture zoom is blocked', source.includes("gesturestart") && source.includes("gesturechange") && source.includes("gestureend")],
  ['webgl context recovery exists', source.includes("webglcontextlost") && source.includes("webglcontextrestored")],
  ['locked fruit shell blocks global press', source.includes('const effectivePress = shellLocked ? 0 : state.press')],
  ['render errors surface in status', source.includes("canvas.dataset.renderError = 'true'") && source.includes('三维渲染异常')],
  ['release retains fast pull target', source.includes('retainedPull') && source.includes('state.targetPull.lengthSq()')],
  ['deformation history is bounded', source.includes('MAX_DEFORMATION_POINTS') && script.includes('deformationPointCap')],
  ['fruit shard budget is bounded', source.includes('MAX_FRUIT_SHELL_CHIPS') && script.includes('fruitShellChipCap')],
  ['fruit uses egg-shell peel edges', source.includes('fruitPeelEdge') && source.includes("sound('peel'") && source.includes('peelStyle')],
  ['jelly sound is sparse and low', source.includes('sparse: one wet') && source.includes('bodyCut = 92') && source.includes('tail = .62')],
  ['audio outputs are reclaimed', source.includes('output.disconnect') && script.includes('activeAudioOutputs')],
  ['iteration targets are documented', iteration.includes('连续 50 次') && iteration.includes('真实手势回归')]
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ passed: checks.length - failures.length, total: checks.length, failures }, null, 2));
if (failures.length) process.exit(1);
