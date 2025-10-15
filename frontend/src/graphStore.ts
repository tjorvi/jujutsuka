import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { produce } from 'immer';
import type { CommitId, FileChange, Commit } from "../../backend/src/repo-parser";
import type { GitCommand, CommandTarget } from './commands';
import { mutations, queries } from './api';

type CommitGraph = Record<CommitId, { commit: Commit; children: CommitId[] }>;

interface GraphState {
  // Data
  commitGraph: CommitGraph | null;
  isOptimistic: boolean; // Flag to indicate if current data is optimistic
  
  // Actions
  setCommitGraph: (commitGraph: CommitGraph) => void;
  refreshGraphData: () => Promise<void>;
  executeRebase: (commitId: CommitId, target: CommandTarget) => Promise<void>;
  executeSquash: (sourceCommitId: CommitId, targetCommitId: CommitId) => Promise<void>;
  executeSplit: (sourceCommitId: CommitId, files: FileChange[], target: CommandTarget) => Promise<void>;
}

export const useGraphStore = create<GraphState>()(
  devtools(
    (set, get) => ({
      // Initial state
      commitGraph: null,
      isOptimistic: false,

      // Set fresh data from the server
      setCommitGraph: (commitGraph) => {
        set({ commitGraph, isOptimistic: false });
      },

      // Refresh data from server
      refreshGraphData: async () => {
        try {
          // Only fetch commit graph - stack graph will be computed in UI
          const commitGraph = await queries.graph.query(undefined, { signal: new AbortController().signal });
          set({ commitGraph, isOptimistic: false });
        } catch (error) {
          console.error('Failed to refresh graph data:', error);
          // Just clear optimistic flag on error
          set({ isOptimistic: false });
        }
      },

      executeRebase: async (commitId, target) => {
        const command: GitCommand = { type: 'rebase', commitId, target };
        console.log('🔄 REBASE COMMAND:', command);

        // Apply optimistic update
        const state = get();
        if (state.commitGraph) {
          const optimisticCommitGraph = produce(state.commitGraph, draft => {
            // For rebase, we need to move the commit and its descendants
            // This is a simplified optimistic update - the actual logic would be more complex
            const commitNode = draft[commitId];
            if (commitNode) {
              // Update parent relationships optimistically
              // This is a placeholder - actual rebase logic would be more involved
            }
          });

          set({ 
            commitGraph: optimisticCommitGraph, 
            isOptimistic: true 
          });
        }

        // Execute actual command via API
        try {
          await mutations.executeCommand.mutate({ command });
        //   await get().refreshGraphData(); intentionally commented out for now to be able to see optimistic graph updates
        } catch (error) {
          console.error('Command execution failed:', error);
          // Revert optimistic update by refreshing
        //   await get().refreshGraphData(); intentionally commented out for now to be able to see optimistic graph updates
        }
      },

      executeSquash: async (sourceCommitId, targetCommitId) => {
        const command: GitCommand = { type: 'squash', sourceCommitId, targetCommitId };
        console.log('🔧 SQUASH COMMAND:', command);

        // Apply optimistic update
        const state = get();
        if (state.commitGraph) {
          console.log('🔧 Applying optimistic squash update');
          console.log('Before squash - commit graph keys:', Object.keys(state.commitGraph));
          
          const optimisticCommitGraph = produce(state.commitGraph, draft => {
            // For squash, remove the source commit and merge its changes into target
            const sourceNode = draft[sourceCommitId];
            const targetNode = draft[targetCommitId];
            
            if (sourceNode && targetNode) {
              console.log(`Squashing ${sourceCommitId} into ${targetCommitId}`);
              
              // Remove source commit from graph
              delete draft[sourceCommitId];
              
              // Update parent-child relationships
              // Connect source's children to target
              for (const childId of sourceNode.children) {
                const childNode = draft[childId];
                if (childNode) {
                  // Replace sourceCommitId with targetCommitId in child's parents
                  const parentIndex = childNode.commit.parents.indexOf(sourceCommitId);
                  if (parentIndex >= 0) {
                    childNode.commit.parents[parentIndex] = targetCommitId;
                  }
                  // Add child to target's children if not already there
                  if (!targetNode.children.includes(childId)) {
                    targetNode.children.push(childId);
                  }
                }
              }
              
              // Update target's parents to include source's parents
              for (const parentId of sourceNode.commit.parents) {
                if (!targetNode.commit.parents.includes(parentId)) {
                  targetNode.commit.parents.push(parentId);
                }
                // Update parent's children
                const parentNode = draft[parentId];
                if (parentNode) {
                  const sourceIndex = parentNode.children.indexOf(sourceCommitId);
                  if (sourceIndex >= 0) {
                    parentNode.children.splice(sourceIndex, 1);
                  }
                }
              }
            }
          });

          console.log('After squash - commit graph keys:', Object.keys(optimisticCommitGraph));

          set({ 
            commitGraph: optimisticCommitGraph, 
            isOptimistic: true 
          });
        }

        // Execute actual command via API
        try {
          await mutations.executeCommand.mutate({ command });
        //   await get().refreshGraphData(); intentionally commented out for now to be able to see optimistic graph updates
        } catch (error) {
          console.error('Command execution failed:', error);
          // Revert optimistic update by refreshing
        //   await get().refreshGraphData(); intentionally commented out for now to be able to see optimistic graph updates
        }
      },

      executeSplit: async (sourceCommitId, files, target) => {
        const command: GitCommand = { type: 'split', sourceCommitId, files, target };
        
        // Log the jj command
        if (target.type === 'new-commit-between') {
          console.log(`jj split -r ${sourceCommitId} -B ${target.afterCommitId} -A ${target.beforeCommitId} -- ${files.map(f => f.path).join(' ')}`);
        } else if (target.type === 'existing-commit') {
          console.log(`jj split -r ${sourceCommitId} --into ${target.commitId} -- ${files.map(f => f.path).join(' ')}`);
        } else if (target.type === 'new-branch') {
          console.log(`jj split -r ${sourceCommitId} && jj new ${target.fromCommitId} -- ${files.map(f => f.path).join(' ')}`);
        } else {
          console.log(`jj split -r ${sourceCommitId} ${target.type === 'before' ? '-B' : '-A'} ${target.commitId} -- ${files.map(f => f.path).join(' ')}`);
        }
        
        console.log('Split command:', command);

        // Apply optimistic update
        const state = get();
        if (state.commitGraph) {
          const optimisticCommitGraph = produce(state.commitGraph, () => {
            // For split, we would create new commits and update relationships
            // This is complex and depends on the target type
            // For now, just mark as optimistic without changing structure
          });

          set({ 
            commitGraph: optimisticCommitGraph,
            isOptimistic: true 
          });
        }

        // Execute actual command via API
        try {
          await mutations.executeCommand.mutate({ command });
        //   await get().refreshGraphData(); intentionally commented out for now to be able to see optimistic graph updates
        } catch (error) {
          console.error('Command execution failed:', error);
          // Revert optimistic update by refreshing
        //   await get().refreshGraphData(); intentionally commented out for now to be able to see optimistic graph updates
        }
      },
    }),
    {
      name: 'graph-store',
    }
  )
);