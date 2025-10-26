import { useEffect, useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DiffPanel } from './DiffPanel';
import { useGraphStore } from './graphStore';
import { queries } from './api';
import type { CommitId } from '../../backend/src/repo-parser';

type Story = StoryObj<typeof DiffPanel>;

const meta: Meta<typeof DiffPanel> = {
  title: 'Diff/DiffPanel',
  component: DiffPanel,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

interface MockDiffData {
  readonly diff: string;
  readonly status?: string;
  readonly additions?: number;
  readonly deletions?: number;
}

type DiffPanelProps = React.ComponentProps<typeof DiffPanel>;

interface MockedDiffPanelProps extends DiffPanelProps {
  readonly repoPath?: string;
  readonly fileMocks?: Record<string, MockDiffData>;
}

function useRepoPath(repoPath: string) {
  useEffect(() => {
    const previous = useGraphStore.getState().repoPath;
    useGraphStore.setState({ repoPath });
    return () => {
      useGraphStore.setState({ repoPath: previous });
    };
  }, [repoPath]);
}

function useDiffMocks(fileMocks: Record<string, MockDiffData> | undefined) {
  const fileChanges = useMemo(() => {
    if (!fileMocks) {
      return undefined;
    }
    return Object.entries(fileMocks).map(([path, meta]) => ({
      path,
      status: meta.status ?? 'M',
      additions: meta.additions,
      deletions: meta.deletions,
    }));
  }, [fileMocks]);

  useEffect(() => {
    if (!fileMocks) {
      return undefined;
    }

    const originalFileDiff = queries.fileDiff.query.bind(queries.fileDiff);
    const originalFileChanges = queries.fileChanges.query.bind(queries.fileChanges);

    queries.fileDiff.query = async (
      input: { repoPath: string; commitId: string; filePath: string },
      options: { signal: AbortSignal },
    ) => {
      void options.signal;
      const mock = fileMocks[input.filePath];
      if (!mock) {
        throw new Error(`No mock diff for ${input.filePath}`);
      }
      return mock.diff;
    };

    queries.fileChanges.query = async (
      input: { repoPath: string; commitId: string },
      options: { signal: AbortSignal },
    ) => {
      void input;
      void options.signal;
      return fileChanges ?? [];
    };

    return () => {
      queries.fileDiff.query = originalFileDiff;
      queries.fileChanges.query = originalFileChanges;
    };
  }, [fileMocks, fileChanges]);

  return fileChanges;
}

function MockedDiffPanel({ repoPath = '/storybook/repo', fileMocks, ...props }: MockedDiffPanelProps) {
  useRepoPath(repoPath);
  useDiffMocks(fileMocks);

  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <DiffPanel {...props} />
    </div>
  );
}

const exampleDiff = `diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,5 +1,6 @@
 import { something } from './old';
-const value = calculate();
+const result = calculate();
+const nextValue = result + 1;
 
 export function useThing() {
-  return value * 2;
+  return nextValue * 2;
 }
`;

const secondaryDiff = `diff --git a/src/extra.ts b/src/extra.ts
index 3333333..4444444 100644
--- a/src/extra.ts
+++ b/src/extra.ts
@@ -2,3 +2,4 @@ export function helper() {
   return 'ok';
 }
 
+export const flag = true;
`;

const sampleCommitId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as CommitId;

export const NoCommitSelected: Story = {
  name: 'Idle State',
  render: () => <MockedDiffPanel />,
};

export const SingleFileDiff: Story = {
  name: 'Single File Diff',
  render: () => (
    <MockedDiffPanel
      commitId={sampleCommitId}
      selectedFilePath="src/example.ts"
      fileMocks={{
        'src/example.ts': {
          diff: exampleDiff,
          status: 'M',
          additions: 2,
          deletions: 2,
        },
      }}
    />
  ),
};

export const CommitWithMultipleFiles: Story = {
  name: 'Commit - Multiple Files',
  render: () => (
    <MockedDiffPanel
      commitId={sampleCommitId}
      fileMocks={{
        'src/example.ts': {
          diff: exampleDiff,
          status: 'M',
          additions: 2,
          deletions: 2,
        },
        'src/extra.ts': {
          diff: secondaryDiff,
          status: 'A',
          additions: 1,
          deletions: 0,
        },
      }}
    />
  ),
};
