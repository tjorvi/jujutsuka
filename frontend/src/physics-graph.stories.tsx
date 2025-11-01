import type { Meta, StoryObj } from "@storybook/react";
import { PhysicsGraph } from "./physics-graph";

const meta = {
    title: "Graphs/PhysicsGraph",
    component: PhysicsGraph,
    parameters: {
        layout: "centered",
    },
} satisfies Meta<typeof PhysicsGraph>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SingleNode: Story = {
    name: "Single Node",
    args: {
        graph: {
            nodes: [1],
            edges: [],
        },
    },
};

export const LinearStack: Story = {
    name: "Linear Stack",
    args: {
        graph: {
            nodes: [1, 2, 3, 4],
            edges: [
                [1, 2],
                [2, 3],
                [3, 4],
            ],
        },
    },
};

export const SimpleDiamond: Story = {
    name: "Simple Diamond",
    args: {
        graph: {
            nodes: [1, 2, 3, 4],
            edges: [
                [1, 2],
                [1, 3],
                [2, 4],
                [3, 4],
            ],
        },
    },
};

export const SingleBranchNoMainProgress: Story = {
    name: "Unmerged Branch • No Main Progress",
    args: {
        graph: {
            nodes: [0, 1, 101, 102, 103],
            edges: [
                [0, 1],
                [1, 101],
                [101, 102],
                [102, 103],
            ],
        },
    },
};

export const SingleBranchWithMainProgress: Story = {
    name: "Unmerged Branch • Main Advances",
    args: {
        graph: {
            nodes: [0, 1, 2, 3, 101, 102, 103],
            edges: [
                [0, 1],
                [1, 2],
                [2, 3],
                [1, 101],
                [101, 102],
                [102, 103],
            ],
        },
    },
};

export const ThreeUnmergedBranches: Story = {
    name: "Three Unmerged Branches",
    args: {
        graph: {
            nodes: [0, 1, 101, 201, 202, 203, 301, 302],
            edges: [
                [0, 1],
                [1, 101],
                [1, 201],
                [201, 202],
                [202, 203],
                [1, 301],
                [301, 302],
            ],
        },
    },
};

export const MergedBranchNoInlineMain: Story = {
    name: "Merged Branch • Main Advances After Merge",
    args: {
        graph: {
            nodes: [0, 1, 101, 102, 103, 200, 201, 202],
            edges: [
                [0, 1],
                [1, 101],
                [101, 102],
                [102, 103],
                [1, 200],
                [103, 200],
                [200, 201],
                [201, 202],
            ],
        },
    },
};

export const MergedBranchWithInlineMain: Story = {
    name: "Merged Branch • Main Advances Inline",
    args: {
        graph: {
            nodes: [0, 1, 2, 3, 101, 102, 103, 200, 201, 202],
            edges: [
                [0, 1],
                [1, 2],
                [2, 3],
                [1, 101],
                [101, 102],
                [102, 103],
                [3, 200],
                [103, 200],
                [200, 201],
                [201, 202],
            ],
        },
    },
};

export const MixedMergeStatus: Story = {
    name: "Mixed Merge Status",
    args: {
        graph: {
            nodes: [0, 1, 2, 3, 4, 101, 102, 201, 202, 300],
            edges: [
                [0, 1],
                [1, 2],
                [2, 3],
                [3, 4],
                [1, 101],
                [101, 102],
                [102, 300],
                [3, 300],
                [2, 201],
                [201, 202],
            ],
        },
    },
};

export const ManyParallelMergedBranches: Story = {
    name: "Many Parallel Merged Branches (30)",
    args: {
        graph: (() => {
            const branchCount = 30;
            const mainlineNodes = [0, 1, 2, 3, 500, 501];
            const branchNodes = Array.from({ length: branchCount }, (_, index) => 1001 + index);
            const mainlineEdges: [number, number][] = [
                [0, 1],
                [1, 2],
                [2, 3],
                [3, 500],
                [500, 501],
            ];
            const branchEdges = branchNodes.flatMap((branchNode): [number, number][] => [
                [1, branchNode],
                [branchNode, 500],
            ]);

            return {
                nodes: [...mainlineNodes, ...branchNodes],
                edges: [...mainlineEdges, ...branchEdges],
            };
        })(),
    },
};
