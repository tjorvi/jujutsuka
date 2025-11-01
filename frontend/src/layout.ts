import ELK, { type ElkExtendedEdge } from "elkjs";

type Graph = { nodes: number[]; edges: [number, number][] };

export function layoutSimple(g: Graph, size = ()=> ({width:80,height:28})) {
  const children = g.nodes.map(id => {
    const s = size();
    return {
      id: `${id}`,
      width: s.width,
      height: s.height,
      ports: [
        { id: `${id}:n`, properties: { "elk.port.side": "NORTH" } },
        { id: `${id}:s`, properties: { "elk.port.side": "SOUTH" } },
      ],
    };
  });

  const edges: ElkExtendedEdge[] = g.edges.map(([f,t]) => ({
    id: `e${f}->${t}`,
    sources: [`${f}:n`],
    targets: [`${t}:s`],
  }));

  const elk = new ELK();
  return elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
    children, edges,
  });
}
