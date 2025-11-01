// import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs";

// type Graph = { nodes: number[]; edges: [number, number][] };
// 
// export async function layoutSimple(g: Graph, size = ()=>({width:80,height:28})) {
//   const children: ElkNode[] = g.nodes.map(id => {
//     const s = size(id);
//     return {
//       id: String(id),
//       width: s.width, height: s.height,
//       ports: [
//         { id: `${id}:w`, properties: { "elk.port.side": "WEST" } },
//         { id: `${id}:e`, properties: { "elk.port.side": "EAST" } },
//       ],
//     };
//   });

//   const edges: ElkExtendedEdge[] = g.edges.map(([u,v], i) => ({
//     id: `e${i}`,
//     sources: [`${u}:e`],
//     targets: [`${v}:w`],
//   }));

//   const elk = new ELK();
//   return elk.layout({
//     id: "root",
//     layoutOptions: {
//       "elk.algorithm": "layered",
//       "elk.direction": "RIGHT",
//       "elk.edgeRouting": "ORTHOGONAL",
//       "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
//     },
//     children, edges,
//   });
// }
