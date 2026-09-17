// Scalar GLSL shared directly with the wave shader. Kept separate so its actual
// envelope can be checked without requiring a browser or claiming GPU coverage.
export const waveBandGLSL = /* glsl */ `
  float waveBand(float distanceFromFront, float width, float tailLength) {
    float safeWidth = max(width, 0.000001);
    float scaledDistance = distanceFromFront >= 0.0
      ? distanceFromFront / (safeWidth * 0.35)
      : -distanceFromFront / (safeWidth * max(tailLength, 0.1));
    float exponent = distanceFromFront >= 0.0 ? 2.0 : 1.3;
    return exp(-pow(scaledDistance, exponent));
  }
`;
