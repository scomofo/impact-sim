export interface Example {
  title: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    title: "Hohmann transfer LEO → GEO",
    code: `% Hohmann transfer from a 300 km parking orbit to geostationary altitude
r1 = R_earth + 300e3;
r2 = 42164e3;
h = hohmann(r1, r2, mu_earth)
fprintf('total dv = %.1f m/s, transfer time = %.2f h\\n', h.dv_total, h.tof / 3600);

% Sweep target altitude and plot the required dv
alts = linspace(500e3, 400000e3, 200);
dv = zeros(size(alts));
for k = 1:numel(alts)
  s = hohmann(r1, R_earth + alts(k), mu_earth);
  dv(k) = s.dv_total;
end
plot(alts / 1e3, dv / 1e3);
xlabel('target altitude (km)'); ylabel('total dv (km/s)');
title('Hohmann dv from 300 km LEO'); grid on;`,
  },
  {
    title: "Propagate an orbit with ode45",
    code: `% Molniya-type orbit propagated with ode45 and the two-body right-hand side
a = 26600e3; e = 0.74; inc = deg2rad(63.4);
[r0, v0] = kepler2cart([a e inc 0 deg2rad(270) 0], mu_earth);
T = period(a, mu_earth);
opts = odeset('RelTol', 1e-9, 'AbsTol', 1e-9);
[t, y] = ode45(twobody(mu_earth), [0 2*T], [r0; v0], opts);

fprintf('%d steps, closure error %.3g m\\n', numel(t), norm(y(end,1:3)' - r0));
plot(y(:,1)/1e3, y(:,2)/1e3, 'b-'); hold on;
th = linspace(0, 2*pi, 100);
plot(R_earth/1e3*cos(th), R_earth/1e3*sin(th), 'k-');
axis equal; grid on;
xlabel('x (km)'); ylabel('y (km)'); title('Molniya orbit, inertial frame');

% Radius versus time
% figure; plot(t/3600, sqrt(sum(y(:,1:3).^2, 2))/1e3); xlabel('hours'); ylabel('r (km)');`,
  },
  {
    title: "Lambert transfer Earth → Mars",
    code: `% Solve Lambert's problem for a heliocentric transfer (coplanar circular approximation)
tof = 210 * day;
r1 = [AU 0 0];
theta = 2*pi * tof / (687 * day) + deg2rad(44);   % Mars leads Earth by the transfer angle
r2 = 1.524 * AU * [cos(theta) sin(theta) 0];
[v1, v2] = lambert(r1, r2, tof, mu_sun);
v_earth = vcirc(AU, mu_sun) * [0 1 0]';
v_mars = vcirc(1.524*AU, mu_sun) * [-sin(theta) cos(theta) 0]';
fprintf('departure v-infinity = %.2f km/s\\n', norm(v1 - v_earth) / 1e3);
fprintf('arrival   v-infinity = %.2f km/s\\n', norm(v2 - v_mars) / 1e3);

% Draw the transfer arc by propagating the departure state
[t, y] = ode45(twobody(mu_sun), [0 tof], [r1'; v1], odeset('RelTol', 1e-9, 'AbsTol', 1e-3));
th = linspace(0, 2*pi, 200);
plot(cos(th), sin(th), 'b--'); hold on;
plot(1.524*cos(th), 1.524*sin(th), 'r--');
plot(y(:,1)/AU, y(:,2)/AU, 'k-');
axis equal; grid on; title('Earth-Mars Lambert arc'); xlabel('AU'); ylabel('AU');`,
  },
  {
    title: "Halo-like orbit in the CR3BP",
    code: `% Earth-Moon circular restricted three-body problem in the rotating frame
mu = 0.01215;
L = lagrange(mu);
fprintf('L1 at x = %.4f, L2 at x = %.4f\\n', L.L1, L.L2);

% Planar Lyapunov-style initial condition near L1
x0 = [L.L1 - 0.02; 0; 0; 0; 0.06; 0];
C0 = jacobi(mu, x0);
[t, y] = ode45(cr3bp(mu), [0 6], x0, odeset('RelTol', 1e-10, 'AbsTol', 1e-12));
fprintf('Jacobi drift: %.2e\\n', jacobi(mu, y(end,:)) - C0);

plot(y(:,1), y(:,2), 'b-'); hold on;
plot(-mu, 0, 'ko'); plot(1-mu, 0, 'ko');
plot(L.L1, 0, 'r+'); plot(L.L2, 0, 'r+');
axis equal; grid on; title('CR3BP rotating frame'); xlabel('x'); ylabel('y');`,
  },
  {
    title: "Impact energy and crater size",
    code: `% Crater scaling (Collins, Melosh & Marcus 2005) across impactor sizes
D = logspace(1, 4, 60);          % 10 m to 10 km
Dfinal = zeros(size(D));
Mt = zeros(size(D));
for k = 1:numel(D)
  s = impact(D(k), 3000, 20e3, deg2rad(45));
  Dfinal(k) = s.D_final;
  Mt(k) = s.energy_Mt;
end
loglog(D, Dfinal / 1e3);
xlabel('impactor diameter (m)'); ylabel('final crater diameter (km)');
title('Stony impactor at 20 km/s, 45 deg'); grid on;

s = impact(140, 3000, 20e3, deg2rad(45));
fprintf('140 m body: %.1f Mt, crater %.1f km, M%.1f, every ~%.0f years\\n', ...
  s.energy_Mt, s.D_final / 1e3, s.magnitude, s.recurrence_years);

% Overpressure at 20 km from a 1 Mt airburst at 5 km altitude
p = overpressure(1e6 * 4.184e12 / 1e3, 20e3, 5e3);
fprintf('overpressure at 20 km: %.1f kPa\\n', p / 1e3);`,
  },
  {
    title: "Kepler's equation and anomalies",
    code: `% Compare mean, eccentric and true anomaly over one orbit
e = 0.6;
M = linspace(0, 2*pi, 200);
E = keplerE(M, e);
nu = mean2true(M, e);
plot(rad2deg(M), rad2deg(E), 'b-'); hold on;
plot(rad2deg(M), rad2deg(nu), 'r-');
plot(rad2deg(M), rad2deg(M), 'k--');
legend('E', 'true anomaly', 'M');
xlabel('mean anomaly (deg)'); ylabel('deg'); title('e = 0.6'); grid on;

% Time from periapsis to reach nu = 90 deg on a 24-hour orbit
a = (mu_earth * (86164 / (2*pi))^2)^(1/3);
Mq = true2mean(pi/2, e);
fprintf('t(nu = 90 deg) = %.2f h\\n', Mq / sqrt(mu_earth / a^3) / 3600);`,
  },
  {
    title: "Matrices and linear algebra",
    code: `% Rotation matrices and a small least-squares fit
th = deg2rad(30);
R = [cos(th) -sin(th) 0; sin(th) cos(th) 0; 0 0 1];
v = R * [1; 0; 0]
disp(det(R))
x = (0:9)';
y = 3 + 2*x + 0.5*randn(size(x));
A = [ones(size(x)) x];
c = A \\ y
plot(x, y, 'ko'); hold on; plot(x, A*c, 'r-'); title('least squares'); grid on;`,
  },
];
