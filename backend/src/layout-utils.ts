// Layout utilities for detecting and grouping parallel stacks
// This is a pure UI concern - no data mutation

import type { StackGraph, StackId } from './repo-parser';

/**
 * Information about a group of parallel stacks (diamond pattern)
 * This is purely for layout/display purposes
 */
export interface ParallelGroup {
  id: string;
  stackIds: StackId[];        // The stacks that run in parallel
  parentStacks: StackId[];    // Shared parent stacks
  childStacks: StackId[];     // Shared child stacks
  isComplete: boolean;        // True if all parallel stacks merge (complete diamond)
}

/**
 * Detects diamond patterns (parallel stacks) for layout purposes.
 * Returns groups of stacks that can be visually grouped as "parallel".
 * Does NOT mutate the original stack graph.
 */
export function detectParallelGroups(stackGraph: StackGraph): ParallelGroup[] {
  const { stacks, connections } = stackGraph;
  const parallelGroups: ParallelGroup[] = [];
  let groupCounter = 0;

  // Group stacks by their parent-child signature
  const stacksBySignature = new Map<string, StackId[]>();
  
  for (const stackId of Object.keys(stacks) as StackId[]) {
    const stack = stacks[stackId];
    
    // Create a signature based on parent and child stacks
    const parentSignature = [...stack.parentStacks].sort().join(',');
    const childSignature = [...stack.childStacks].sort().join(',');
    const signature = `${parentSignature}|${childSignature}`;
    
    if (!stacksBySignature.has(signature)) {
      stacksBySignature.set(signature, []);
    }
    stacksBySignature.get(signature)!.push(stackId);
  }

  // Find groups with 2+ stacks (potential diamonds)
  for (const [signature, candidateStacks] of stacksBySignature) {
    if (candidateStacks.length < 2) continue;
    
    // Parse the signature
    const [parentSig, childSig] = signature.split('|');
    const parentStacks = parentSig ? parentSig.split(',') as StackId[] : [];
    const childStacks = childSig ? childSig.split(',') as StackId[] : [];
    
    // Check if this is a complete diamond (all merge to same children)
    let isComplete = false;
    if (childStacks.length > 0) {
      // Check if all child connections are merge connections
      isComplete = candidateStacks.every(candidateStack =>
        childStacks.every(childStack => {
          const connection = connections.find(c => c.from === candidateStack && c.to === childStack);
          return connection && connection.type === 'merge';
        })
      );
    }
    
    // Create parallel group
    parallelGroups.push({
      id: `parallel-group-${groupCounter++}`,
      stackIds: candidateStacks,
      parentStacks,
      childStacks,
      isComplete,
    });
  }

  return parallelGroups;
}

/**
 * Enhanced stack graph with parallel group information for layout
 */
export interface LayoutStackGraph extends StackGraph {
  parallelGroups: ParallelGroup[];
}

/**
 * Adds parallel group detection to a stack graph for layout purposes
 */
export function enhanceStackGraphForLayout(stackGraph: StackGraph): LayoutStackGraph {
  return {
    ...stackGraph,
    parallelGroups: detectParallelGroups(stackGraph),
  };
}

/**
 * Checks if a stack is part of any parallel group
 */
export function getParallelGroupForStack(stackId: StackId, parallelGroups: ParallelGroup[]): ParallelGroup | null {
  return parallelGroups.find(group => group.stackIds.includes(stackId)) || null;
}

/**
 * Gets all stacks that are siblings (in the same parallel group) of a given stack
 */
export function getSiblingStacks(stackId: StackId, parallelGroups: ParallelGroup[]): StackId[] {
  const group = getParallelGroupForStack(stackId, parallelGroups);
  return group ? group.stackIds.filter(id => id !== stackId) : [];
}