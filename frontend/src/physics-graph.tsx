import { useEffect, useRef } from "react";
// import styles from "./physics-graph.module.css";
import { Engine, Render, Runner, World, Bodies, Constraint, Mouse, MouseConstraint } from "matter-js";

type Graph = {
        nodes: number[];
        edges: [from:number, to:number][];
    };

export type PhysicsGraphProps = {
    graph: Graph;
};

const graphRoots = (nodes: number[], edges: [number, number][]) => {
    const hasIncomingEdge = new Set<number>();
    for (const [, to] of edges) {
        hasIncomingEdge.add(to);
    }
    return nodes.filter(nodeId => !hasIncomingEdge.has(nodeId));
}

const graphLeaves = (nodes: number[], edges: [number, number][]) => {
    const hasOutgoingEdge = new Set<number>();
    for (const [from, ] of edges) {
        hasOutgoingEdge.add(from);
    }
    return nodes.filter(nodeId => !hasOutgoingEdge.has(nodeId));
}

export function PhysicsGraph({ graph }: PhysicsGraphProps) {

  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const width = 640, height = 400;

    const engine = Engine.create();
    const world = engine.world;
    engine.gravity.x = 0;
    engine.gravity.y = 0;

    const render = Render.create({
      element: hostRef.current,
      engine,
      options: { width, height, wireframes: false, background: "#f5f5f5" },
    });

    const bodies: Record<number, Matter.Body> = {};
    for (const nodeId of graph.nodes) {
        const node = Bodies.rectangle(
            Math.random() * (width - 100) + 50,
            Math.random() * (height - 100) + 50,
            48,
            28,
            { label: `${nodeId}`, friction: 0, frictionAir: 0 }
        );
        bodies[nodeId] = node;
        World.add(world, node);
    }

    for (const rootId of graphRoots(graph.nodes, graph.edges)) {
        const rootBody = bodies[rootId];
        const rootConstraint = Constraint.create({
            pointA: { x: width/2, y: height },
            bodyB: rootBody,
            pointB: { x: 0, y: -10 },
            length: 0,
            stiffness: 0.001,
            damping: 0.1,
        });
        World.add(world, rootConstraint);
    }

    for (const leafId of graphLeaves(graph.nodes, graph.edges)) {
        const leafBody = bodies[leafId];
        const leafConstraint = Constraint.create({
            bodyA: leafBody,
            pointA: { x: 0, y: 10 },
            pointB: { x: width/2, y: 0 },
            length: 0,
            stiffness: 0.001,
            damping: 0.1,
        });
        World.add(world, leafConstraint);
    }


    for (const [fromId, toId] of graph.edges) {
        const fromBody = bodies[fromId];
        const toBody = bodies[toId];

         const link = Constraint.create({
            bodyA: fromBody,
            bodyB: toBody,
            pointA: { x: 0, y: 12 },
            pointB: { x: 0, y: -12 },
            length: 120,
            stiffness: 0.1,
            damping: 0.15,
        });
        World.add(world, [link]);
        
        // const linkL = Constraint.create({
        //     bodyA: fromBody,
        //     bodyB: toBody,
        //     pointA: { x: -24, y: 12 },
        //     pointB: { x: -24, y: -12 },
        //     length: 120,
        //     stiffness: 0.1,
        //     damping: 0.15,
        // });

        // const linkR = Constraint.create({
        //     bodyA: fromBody,
        //     bodyB: toBody,
        //     pointA: { x: 24, y: 12 },
        //     pointB: { x: 24, y: -12 },
        //     length: 120,
        //     stiffness: 0.1,
        //     damping: 0.15,
        // });

        // World.add(world, [linkL, linkR]);
    }

    const ground = Bodies.rectangle(width / 2, height - 20, width, 40, { isStatic: true });

    World.add(world, [ground]);

    // Drag & drop
    const mouse = Mouse.create(render.canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
        mouse,
        constraint: { stiffness: 0.2, render: { visible: false } },
    });
    World.add(world, mouseConstraint);
    render.mouse = mouse;

    const runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    return () => {
      Render.stop(render);
      Runner.stop(runner);
      render.textures = {};
      render.canvas.remove();
    };
  }, []);

  return <div ref={hostRef} />;
}
