# Rendering performance
- Compute rider elevation once per frame; reuse ridge samples for fill and stroke.
- Reuse biome selection across road-kind/color calls at the same distance.
- Cache elevation-profile samples and grades for up to 100 ms; invalidate immediately
  on terrain/hill changes or more than 10 m movement. Marker and labels stay live.
- Existing terrain/blending/render tests remain the correctness checks.
- CPU savings still need profiling on target hardware, especially WebKit blur compositing.
