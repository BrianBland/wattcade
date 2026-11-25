import * as T from 'three';

const current = `
uniform float pourTime;
float castingHash(vec2 n) {
  vec3 p = fract(vec3(n.xyx)*.1031);
  p += dot(p,p.yzx+33.33);
  return fract((p.x+p.y)*p.z);
}
float castingNoise(vec2 p) {
  vec2 id=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(castingHash(id), castingHash(id+vec2(1,0)),f.x),
             mix(castingHash(id+vec2(0,1)),castingHash(id+1.),f.x),f.y);
}
vec3 liquid(vec2 st) {
  float x=st.x;
  float wall=pow(abs(x*2.-1.),3.);
  vec2 p=vec2(x*4.,st.y*2.2-pourTime*.52);
  p.y+=wall*.8*sin(p.y*.31+pourTime*.21);
  p.x+=.92*castingNoise(p*.69)+.30*sin(p.y*2.+x*4.);
  float skin=castingNoise(p)*.65+castingNoise(p*2.7)*.35+wall*.13;
  vec3 heat=mix(vec3(1.,.25,.015),vec3(1.,.84,.35),(1.-smoothstep(.20,.52,skin)));
  float crust=smoothstep(.52,.64,skin);
  vec3 oxide=mix(vec3(.19,.026,.012),vec3(.046,.012,.018),smoothstep(.6,.84,skin));
  vec3 color=mix(heat,oxide,crust);
  color+=vec3(.23,.20,.07)*(1.-smoothstep(.0,.039,abs(skin-.52)));
  return color;
}
`;

// One clock drives the tapping spouts, road runners and the quarry below.
export function moltenSteel() {
  const clock = { value: 0 };
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pourTime = clock;
    shader.vertexShader =
      'varying vec2 castingUV;\n' +
      shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n castingUV = uv;');
    shader.fragmentShader =
      'varying vec2 castingUV;\n' +
      current +
      shader.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb = liquid(castingUV);');
  };

  const bed = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, transparent: true });
  bed.onBeforeCompile = (shader) => {
    shader.uniforms.pourTime = clock;
    shader.vertexShader =
      'varying vec2 bedXZ;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n bedXZ=position.xz;');
    shader.fragmentShader =
      'varying vec2 bedXZ;\n' +
      current +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      float grain=castingNoise(bedXZ*.13)+.4*castingNoise(bedXZ*.43);
      float course=34.*sin(bedXZ.x*.029)+11.*sin(bedXZ.x*.075);
      float width=14.+5.*sin(bedXZ.x*.055);
      float bank=(bedXZ.y-course+(grain-.7)*5.)/width;
      float edge=abs(bank);
      vec3 iron=liquid(vec2(clamp(bank*.5+.5,0.,1.),bedXZ.x*.053));
      outgoingLight*=.50+.76*grain;
      outgoingLight+=vec3(.18,.030,.007)*exp(-max(edge-1.,0.)*3.)*(.4+grain);
      outgoingLight=mix(outgoingLight,iron,1.-smoothstep(.94,1.03,edge));
      #include <opaque_fragment>
    `,
      );
  };
  return { material, clock, bed };
}
