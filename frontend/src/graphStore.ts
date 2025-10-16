import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { CommitId, FileChange, Commit } from "../../backend/src/repo-parser";
import type { GitCommand, CommandTarget } from './commands';
import { mutations, queries } from './api';

type CommitGraph = Record<CommitId, { commit: Commit; children: CommitId[] }>;

interface GraphState {
  // Data
  commitGraph: CommitGraph | null;
  isExecutingCommand: boolean; // Loading state for command execution
  
  // Actions
  setCommitGraph: (commitGraph: CommitGraph) => void;
  refreshGraphData: () => Promise<void>;
  executeRebase: (commitId: CommitId, target: CommandTarget) => Promise<void>;
  executeSquash: (sourceCommitId: CommitId, targetCommitId: CommitId) => Promise<void>;
  executeSplit: (sourceCommitId: CommitId, files: FileChange[], target: CommandTarget) => Promise<void>;
  executeMoveFiles: (sourceCommitId: CommitId, targetCommitId: CommitId, files: FileChange[]) => Promise<void>;
}

export const useGraphStore = create<GraphState>()(
  devtools(
    (set, get) => ({
      // Initial state
      commitGraph: null,
      isExecutingCommand: false,

      // Set fresh data from the server
      setCommitGraph: (commitGraph) => {
        set({ commitGraph });
      },

      // Refresh data from server
      refreshGraphData: async () => {
        try {
          const commitGraph = await queries.graph.query(undefined, { signal: new AbortController().signal });
          set({ commitGraph });
        } catch (error) {
          console.error('Failed to refresh graph data:', error);
        }
      },

      executeRebase: async (commitId, target) => {
        const command: GitCommand = { type: 'rebase', commitId, target };
        console.log('🔄 REBASE COMMAND:', command);

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ command });
          console.log('✅ Rebase command executed successfully');
          await get().refreshGraphData();
        } catch (error) {
          console.error('❌ Rebase command execution failed:', error);
        } finally {
          set({ isExecutingCommand: false });
        }
      },

      executeSquash: async (sourceCommitId, targetCommitId) => {
        const command: GitCommand = { type: 'squash', sourceCommitId, targetCommitId };
        console.log('🔧 SQUASH COMMAND:', command);

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ command });
          console.log('✅ Squash command executed successfully');
          await get().refreshGraphData();
        } catch (error) {
          console.error('❌ Squash command execution failed:', error);
        } finally {
          set({ isExecutingCommand: false });
        }
      },

      executeSplit: async (sourceCommitId, files, target) => {
        const command: GitCommand = { type: 'split', sourceCommitId, files, target };
        console.log('✂️ SPLIT COMMAND:', command);

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ command });
          console.log('✅ Split command executed successfully');
          await get().refreshGraphData();
        } catch (error) {
          console.error('❌ Split command execution failed:', error);
        } finally {
          set({ isExecutingCommand: false });
        }
      },

      executeMoveFiles: async (sourceCommitId, targetCommitId, files) => {
        const command: GitCommand = { type: 'move-files', sourceCommitId, targetCommitId, files };
        console.log('📁 MOVE FILES COMMAND:', command);

        set({ isExecutingCommand: true });

        try {
          await mutations.executeCommand.mutate({ command });
          console.log('✅ Move files command executed successfully');
          await get().refreshGraphData();
        } catch (error) {
          console.error('❌ Move files command execution failed:', error);
        } finally {
          set({ isExecutingCommand: false });
        }
      },
    }),
    {
      name: 'graph-store',
    }
  )
);