import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { CommitId, FileChange } from "../../backend/src/repo-parser";
import type { GitCommand, CommandTarget } from './commands';

interface GraphState {
  // Simple actions that just log for now
  executeRebase: (commitId: CommitId, target: CommandTarget) => void;
  executeSquash: (sourceCommitId: CommitId, targetCommitId: CommitId) => void;
  executeSplit: (sourceCommitId: CommitId, files: FileChange[], target: CommandTarget) => void;
}

export const useGraphStore = create<GraphState>()(
  devtools(
    () => ({
      executeRebase: (commitId, target) => {
        const command: GitCommand = { type: 'rebase', commitId, target };
        console.log('🔄 REBASE COMMAND:', command);
      },

      executeSquash: (sourceCommitId, targetCommitId) => {
        const command: GitCommand = { type: 'squash', sourceCommitId, targetCommitId };
        console.log('🔧 SQUASH COMMAND:', command);
      },

      executeSplit: (sourceCommitId, files, target) => {
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
      },
    }),
    {
      name: 'graph-store',
    }
  )
);