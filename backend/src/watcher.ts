import { watch } from 'node:fs';
import { join } from 'node:path';

export type WatchCallback = () => void;

interface Watcher {
  close: () => void;
}

const activeWatchers = new Map<string, { watcher: Watcher; callbacks: Set<WatchCallback> }>();

/**
 * Watch the .jj directory for changes
 * Multiple subscriptions to the same repo path will share the same file watcher
 */
export function watchRepo(repoPath: string, callback: WatchCallback): () => void {
  const jjPath = join(repoPath, '.jj');

  // Check if we already have a watcher for this repo
  let watcherEntry = activeWatchers.get(repoPath);

  if (!watcherEntry) {
    console.log(`📁 Starting file watcher for ${jjPath}`);

    // Create a new file system watcher
    const watcher = watch(jjPath, { recursive: true }, (eventType, filename) => {
      console.log(`📝 File change detected in ${jjPath}: ${eventType} ${filename}`);

      // Notify all callbacks for this repo
      const entry = activeWatchers.get(repoPath);
      if (entry) {
        entry.callbacks.forEach(cb => {
          try {
            cb();
          } catch (error) {
            console.error('Error in watch callback:', error);
          }
        });
      }
    });

    watcherEntry = {
      watcher: watcher as Watcher,
      callbacks: new Set()
    };
    activeWatchers.set(repoPath, watcherEntry);
  }

  // Add this callback to the set
  watcherEntry.callbacks.add(callback);
  console.log(`👀 Added watcher callback for ${repoPath} (${watcherEntry.callbacks.size} total)`);

  // Return unsubscribe function
  return () => {
    const entry = activeWatchers.get(repoPath);
    if (!entry) return;

    entry.callbacks.delete(callback);
    console.log(`👋 Removed watcher callback for ${repoPath} (${entry.callbacks.size} remaining)`);

    // If no more callbacks, close the watcher
    if (entry.callbacks.size === 0) {
      console.log(`🔒 Closing file watcher for ${jjPath}`);
      entry.watcher.close();
      activeWatchers.delete(repoPath);
    }
  };
}
