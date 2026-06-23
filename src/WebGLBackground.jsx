import { useEffect, useRef } from 'react';

export default function WebGLBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

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

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const time = gl.getUniformLocation(program, 'u_time');
    let frame;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(innerWidth * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const render = (now) => {
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, now * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="webgl-bg" aria-hidden="true" />;
}
