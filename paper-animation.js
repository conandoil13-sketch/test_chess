// A temporary WebGL study: a subdivided sheet flutters in from off-screen.
let frame = null;
let activeStage = null;
export function stopPaperAnimation() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  if (activeStage) {
    activeStage.classList.remove('paper-animating');
    activeStage.querySelector('canvas').hidden = true;
    activeStage = null;
  }
}

export function animatePaper() {
  stopPaperAnimation();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const stage = document.querySelector('.paper-stage');
  const canvas = document.querySelector('#paper-animation');
  const bounds = stage.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return;
  function shader(type, source) {
    const item = gl.createShader(type);
    gl.shaderSource(item, source); gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
    return item;
  }
  try {
    const vertex = shader(gl.VERTEX_SHADER, `
      precision mediump float;
      attribute vec2 a_uv;
      uniform float u_progress;
      varying vec2 v_uv;
      void main() {
        v_uv = a_uv;
        float t = 1.0 - pow(1.0 - u_progress, 3.0);
        float remaining = 1.0 - t;
        float flutter = sin(u_progress * 15.0 + a_uv.y * 3.0) * 0.07 * remaining;
        float bend = sin(a_uv.y * 3.14159) * flutter + (a_uv.x - 0.5) * flutter * 0.35;
        float perspective = 1.0 / (1.0 + bend * 0.8);
        vec2 pos = vec2((a_uv.x * 2.0 - 1.0) * 0.97, (1.0 - a_uv.y * 2.0) * 0.96);
        float angle = -0.18 * remaining + sin(u_progress * 11.0) * 0.05 * remaining;
        mat2 rotation = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
        pos = rotation * pos * perspective;
        pos += vec2(1.45 * remaining, 0.65 * remaining);
        gl_Position = vec4(pos * 0.5, 0.0, 1.0);
      }`);
    const fragment = shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_progress;
      varying vec2 v_uv;
      void main() {
        vec4 color = texture2D(u_texture, v_uv);
        float shade = 1.0 - (1.0 - u_progress) * 0.05 * sin(v_uv.y * 3.14159);
        gl_FragColor = vec4(color.rgb * shade, color.a);
      }`);
    const program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const columns = 32, rows = 48, vertices = [], indices = [];
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) vertices.push(x / columns, y / rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const i = y * (columns + 1) + x;
      indices.push(i, i + 1, i + columns + 1, i + 1, i + columns + 2, i + columns + 1);
    }
    const mesh = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    const uv = gl.getAttribLocation(program, 'a_uv'); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
    const elements = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    const textureCanvas = document.createElement('canvas'); textureCanvas.width = 768; textureCanvas.height = 1024;
    const ctx = textureCanvas.getContext('2d');
    ctx.fillStyle = '#dedbc8'; ctx.fillRect(0, 0, 768, 1024);
    ctx.fillStyle = '#9aab8a'; ctx.fillRect(0, 0, 768, 13);
    ctx.fillStyle = '#566c5b'; ctx.font = '24px NeoDGM, sans-serif'; ctx.fillText('이동 신청 기록', 52, 85);
    ctx.fillStyle = '#263d30'; ctx.font = 'bold 34px NeoDGM, sans-serif'; ctx.fillText('PASSAGE RECORD', 52, 132);
    ctx.fillStyle = '#526758'; ctx.fillRect(52, 158, 664, 3);
    ctx.font = '24px NeoDGM, sans-serif'; ctx.fillText('출발 구역', 52, 232); ctx.fillText('도착 구역', 405, 232);
    ctx.fillStyle = '#263d30'; ctx.font = 'bold 34px NeoDGM, sans-serif';
    ctx.fillText(document.querySelector('#origin').textContent, 52, 286); ctx.fillText(document.querySelector('#destination').textContent, 405, 286);
    ctx.fillStyle = '#526758'; ctx.font = '24px NeoDGM, sans-serif'; ctx.fillText('신청 계급', 52, 365);
    ctx.fillStyle = '#263d30'; ctx.font = 'bold 34px NeoDGM, sans-serif'; ctx.fillText(document.querySelector('#applicant').textContent, 52, 416);
    ctx.fillStyle = '#8f9b86'; ctx.fillRect(52, 464, 664, 2);
    ctx.fillStyle = '#526758'; ctx.font = '23px NeoDGM, sans-serif'; ctx.fillText('심사 상태 / STATUS', 52, 520);
    ctx.fillStyle = '#263d30'; ctx.font = 'bold 38px NeoDGM, sans-serif'; ctx.fillText(document.querySelector('#result').textContent, 52, 581);
    ctx.fillStyle = '#294d3c'; ctx.fillRect(52, 737, 360, 68);
    ctx.fillStyle = '#f1f0de'; ctx.font = '24px NeoDGM, sans-serif'; ctx.fillText('통행증 확인', 82, 780);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * 2 * dpr); canvas.height = Math.round(bounds.height * 2 * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const progress = gl.getUniformLocation(program, 'u_progress');
    const start = performance.now() + 600, duration = 500;
    activeStage = stage; stage.classList.add('paper-animating'); canvas.hidden = false;
    function draw(now) {
      const t = Math.max(0, Math.min((now - start) / duration, 1));
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (now >= start) { gl.uniform1f(progress, t); gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0); }
      if (t < 1) frame = requestAnimationFrame(draw);
      else { gl.deleteTexture(texture); gl.deleteBuffer(mesh); gl.deleteBuffer(elements); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); stopPaperAnimation(); }
    }
    frame = requestAnimationFrame(draw);
  } catch (error) {
    console.warn('종이 애니메이션을 사용할 수 없어 일반 화면으로 전환합니다.', error);
    stopPaperAnimation();
  }
}
