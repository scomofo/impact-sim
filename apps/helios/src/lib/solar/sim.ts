/** Earth years complete in this many seconds at 1× speed. */
export const YEAR_SECONDS = 22;
export const DAYS_PER_SECOND = 365.25 / YEAR_SECONDS;

export const sim = {
  time: 0,
  sunX: 0,
  sunY: 0,
  sunZ: 0,
  tick(dt: number, speed: number, paused: boolean) {
    if (!paused) this.time += dt * speed * DAYS_PER_SECOND;
  },
};
