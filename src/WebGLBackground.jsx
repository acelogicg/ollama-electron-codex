import { useEffect, useRef } from 'react';

const vertexSource = `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const fragmentSource = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = uv - 0.5;
    p.x *= u_resolution.x / u_resolution.y;
    float wave = sin(p.x * 6.0 + u_time * 0.35) * 0.04 + cos(p.y * 8.0 - u_time * 0.28) * 0.04;
    float glowA = 0.18 / (length(p - vec2(-0.38, 0.20 + wave)) * 5.0 + 0.35);
    float glowB = 0.16 / (length(p - vec2(0.42, -0.25 - wave)) * 5.0 + 0.35);
    vec3 base = vec3(0.018, 0.043, 0.082);
    vec3 color = base + glowA * vec3(0.10, 0.36, 0.48) + glowB * vec3(0.25, 0.10, 0.50);
    float grid = smoothstep(0.97, 1.0, sin(uv.x * 120.0) * sin(uv.y * 90.0));
    color += grid * 0.012;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function setFallbackState(canvas, enabled) {
  canvas.dataset.webglFallback = enabled ? 'true' : 'false';
}

function getContext(canvas) {
  const options = {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    desynchronized: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  };

  return (
    canvas.getContext('webgl2', options)
    || canvas.getContext('webgl', options)
    || canvas.getContext('experimental-webgl', options)
  );
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'Shader compilation failed.';
    gl.deleteShader(shader);
    throw new Error(info);
  }

  return shader;
}

export default function WebGLBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let frame = 0;
    let gl = null;
    let program = null;
    let buffer = null;
    let resolution = null;
    let time = null;
    const resize = () => {
      if (!gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(window.innerWidth * dpr));
      const height = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0, 0, width, height);
    };

    const disposeScene = () => {
      if (!gl) return;
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      buffer = null;
      program = null;
      resolution = null;
      time = null;
    };

    const render = (now) => {
      if (!gl || !program) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, now * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = window.requestAnimationFrame(render);
    };

    const initScene = () => {
      gl = getContext(canvas);
      if (!gl) {
        setFallbackState(canvas, true);
        return false;
      }

      const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || 'Program linking failed.';
        throw new Error(info);
      }

      gl.useProgram(program);
      gl.clearColor(0.02, 0.04, 0.07, 1);

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1
      ]), gl.STATIC_DRAW);

      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      resolution = gl.getUniformLocation(program, 'u_resolution');
      time = gl.getUniformLocation(program, 'u_time');

      resize();
      setFallbackState(canvas, false);
      frame = window.requestAnimationFrame(render);
      return true;
    };

    const handleContextLost = (event) => {
      event.preventDefault();
      window.cancelAnimationFrame(frame);
      setFallbackState(canvas, true);
    };

    const handleContextRestored = () => {
      disposeScene();
      try {
        initScene();
      } catch (error) {
        console.error('WebGL restore failed:', error);
        setFallbackState(canvas, true);
      }
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);
    window.addEventListener('resize', resize);

    try {
      initScene();
    } catch (error) {
      console.error('WebGL init failed:', error);
      setFallbackState(canvas, true);
      disposeScene();
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      disposeScene();
      gl = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="webgl-bg" data-webgl-fallback="false" aria-hidden="true" />;
}
