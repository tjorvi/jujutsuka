// Pure stack building logic - moved from backend to avoid Node.js dependencies
import type { CommitId, Commit } from "../../backend/src/repo-parser";

// Branded string type for stack IDs
declare const StackIdBrand: unique symbol;
export type StackId = string & { readonly [StackIdBrand]: true };

export function createStackId(value: string): StackId {
  return value as StackId;
}

/**
 * Represents a linear sequence of commits (no branching/merging within the stack)
 */
export interface Stack {
  id: StackId;
  commits: CommitId[];  // Ordered from oldest (bottom) to newest (top)
  parentStacks: StackId[];  // Stacks that this stack depends on
  childStacks: StackId[];   // Stacks that depend on this stack
}

/**
 * Information about connections between stacks
 */
export interface StackConnection {
  from: StackId;
  to: StackId;
  type: 'linear' | 'merge' | 'branch';
}

/**
 * Result of stack preprocessing
 */
export interface StackGraph {
  stacks: Record<StackId, Stack>;
  connections: StackConnection[];
  rootStacks: StackId[];  // Stacks with no parents
  leafStacks: StackId[];  // Stacks with no children
}

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
 * Enhanced stack graph with parallel group information for layout
 */
export interface LayoutStackGraph extends StackGraph {
  parallelGroups: ParallelGroup[];
}

/**
 * Build a commit graph from the parsed commits
 */
export function buildCommitGraph(commits: Commit[]): Record<CommitId, { commit: Commit; children: CommitId[] }> {
  const graph: Record<CommitId, { commit: Commit; children: CommitId[] }> = {};
  
  // Initialize all commits in the graph
  for (const commit of commits) {
    graph[commit.id] = { commit, children: [] };
  }
  
  // Build parent-child relationships
  for (const commit of commits) {
    for (const parentId of commit.parents) {
      const parent = graph[parentId];
      if (parent) {
        parent.children.push(commit.id);
      }
    }
  }
  
  return graph;
}

/**
 * Preprocess commits into stacks (linear chains) and their connections
 */
export function buildStackGraph(commits: Commit[]): StackGraph {
  const graph = buildCommitGraph(commits);
  const commitToStack = new Map<CommitId, StackId>();
  const stacks: Record<StackId, Stack> = {};
  const visited = new Set<CommitId>();
  let stackCounter = 0;

  // Helper to create a new stack ID
  function nextStackId(): StackId {
    return createStackId(`stack-${stackCounter++}`);
  }

  // Build linear chains by starting from each unvisited commit and walking forward
  function buildLinearChain(startCommitId: CommitId): void {
    if (visited.has(startCommitId)) return;

    const stackId = nextStackId();
    const chainCommits: CommitId[] = [];
    let currentId = startCommitId;

    // Walk forward through the linear chain
    while (currentId && !visited.has(currentId)) {
      const node = graph[currentId];
      if (!node) break;

      chainCommits.push(currentId);
      visited.add(currentId);
      commitToStack.set(currentId, stackId);

      // Stop if this commit has multiple children (branch point) or multiple parents (merge point)
      if (node.children.length !== 1 || node.commit.parents.length > 1) {
        break;
      }

      // Continue to the next commit if it has exactly one parent (us)
      const nextId = node.children[0];
      const nextNode = graph[nextId];
      if (!nextNode || nextNode.commit.parents.length !== 1) {
        break;
      }

      currentId = nextId;
    }

    // Create the stack
    stacks[stackId] = {
      id: stackId,
      commits: chainCommits,
      parentStacks: [],
      childStacks: [],
    };
  }

  // Process all commits starting from roots
  const allCommitIds = Object.keys(graph) as CommitId[];
  
  // Sort commits by timestamp to ensure consistent ordering
  const sortedCommitIds = allCommitIds.sort((a, b) => 
    graph[a].commit.timestamp.getTime() - graph[b].commit.timestamp.getTime()
  );

  // Build stacks starting from oldest commits
  for (const commitId of sortedCommitIds) {
    buildLinearChain(commitId);
  }

  // Now build connections between stacks
  const connections: StackConnection[] = [];
  const stackConnections = new Set<string>(); // To avoid duplicates

  console.log('🔧 Building connections between', Object.keys(stacks).length, 'stacks');

  for (const stack of Object.values(stacks)) {
    // Get the top (newest) commit of this stack
    const topCommit = stack.commits[stack.commits.length - 1];
    const { children } = graph[topCommit];

    console.log('🔧 Stack', stack.id, 'top commit:', topCommit.slice(0, 8), 'has', children.length, 'children');

    for (const childCommitId of children) {
      const childStackId = commitToStack.get(childCommitId);
      if (childStackId && childStackId !== stack.id) {
        const connectionKey = `${stack.id}->${childStackId}`;
        if (!stackConnections.has(connectionKey)) {
          stackConnections.add(connectionKey);
          
          // Determine connection type
          const childStack = stacks[childStackId];
          const bottomChildCommit = childStack.commits[0];
          const { commit: childCommit } = graph[bottomChildCommit];
          
          const connectionType: StackConnection['type'] = 
            childCommit.parents.length > 1 ? 'merge' :
            children.length > 1 ? 'branch' : 'linear';

          console.log('🔧 Adding connection:', connectionKey, 'type:', connectionType);
          connections.push({
            from: stack.id,
            to: childStackId,
            type: connectionType,
          });

          // Update parent/child relationships
          stack.childStacks.push(childStackId);
          childStack.parentStacks.push(stack.id);
        }
      }
    }
  }

  // Find root and leaf stacks
  const rootStacks = Object.values(stacks)
    .filter(stack => stack.parentStacks.length === 0)
    .map(stack => stack.id);
    
  const leafStacks = Object.values(stacks)
    .filter(stack => stack.childStacks.length === 0)
    .map(stack => stack.id);

  return {
    stacks,
    connections,
    rootStacks,
    leafStacks,
  };
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