// Minimal custom-forces framework for Matter.js
import { Engine, Body, Vector, Events } from "matter-js";

/** ---- Force System ---- */
type Force = (dt: number) => void;

export class ForceSystem {
  private forces: Force[] = [];

  constructor(engine: Engine) {
    let lastTs: number | null = null;

    Events.on(engine, "beforeUpdate", (e) => {
        const dtMs = (lastTs != null ? e.timestamp - lastTs : 0.01);
        lastTs = e.timestamp;
        for (const f of this.forces) f(dtMs / 1000 / 60);
    });
  }

  add(force: Force) { 
    this.forces.push(force); 
    return {
        x: () => this.forces = this.forces.filter(f => f !== force)
    }
 }
}

/** ---- Helpers ---- */
const clampAngle = (a: number) => {
  // Wrap to (-π, π]
  a = ((a + Math.PI) % (2 * Math.PI) + (2 * Math.PI)) % (2 * Math.PI) - Math.PI;
  return a;
};
const mEffPair = (a: Body, b?: Body) =>
  b ? 1 / (1 / a.mass + 1 / b.mass) : a.mass;

/** Critically-damped coefficients */
export const critDampLinear = (k: number, mEff: number) => 2 * Math.sqrt(k * mEff);
export const critDampAngular = (k: number, I: number) => 2 * Math.sqrt(k * I);


/** ---- Force primitives ---- */

/** Orientation spring: drives body.angle → targetAngle */
export function OrientationSpring(opts: {
  body: Body;
  targetAngle: number | (() => number);
  k: number;                 // stiffness (N·m/rad)
  c?: number;                // damping (N·m·s/rad) – auto critical if omitted
  maxTorque?: number;        // clamp
  targetOmega?: number;      // desired angular vel (default 0)
  deadbandRad?: number;      // ignore tiny errors (e.g., 0.005)
  rampTau?: number;          // soft start time-constant in s (e.g., 0.25)
}) {
  const { body, k } = opts;
  let c = opts.c; const I = body.inertia;
  let tAccum = 0; const maxT = opts.maxTorque ?? Infinity;
  const dead = opts.deadbandRad ?? 0;
  const tau = opts.rampTau ?? 0; // 0 = no ramp

  const norm = (a:number)=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;

  return (dt: number) => {
    if (!c) c = 2 * Math.sqrt(Math.max(1e-9, k * I)); // critical by default
    tAccum += dt;

    const θt = typeof opts.targetAngle === "function" ? opts.targetAngle() : opts.targetAngle;
    const θerr = norm(θt - body.angle);
    if (Math.abs(θerr) <= dead) return;

    const ωerr = body.angularVelocity - (opts.targetOmega ?? 0);

    // PD torque
    let τ = -k * θerr - c * ωerr;

    // Soft-start ramp to avoid shocks when starting with big ω
    if (tau > 0) {
      const s = 1 - Math.exp(-tAccum / tau); // 0→1
      τ *= s;
    }

    // Clamp
    τ = Math.max(-maxT, Math.min(maxT, τ));

    // Apply (impulse form)
    Body.setAngularVelocity(body, body.angularVelocity + (τ / I) * dt);
  };
}