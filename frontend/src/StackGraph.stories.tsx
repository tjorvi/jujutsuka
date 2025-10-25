import type { Meta, StoryObj } from '@storybook/react';
import { StackGraphComponent } from './StackGraph';
import { DragDropProvider } from './DragDropContext';
import { useGraphStore } from './graphStore';
import {
  buildCommitGraph,
  buildStackGraph,
  enhanceStackGraphForLayout,
  type LayoutStackGraph,
} from './stackUtils';
import type {
  BookmarkName,
  ChangeId,
  Commit,
  CommitId,
  Description,
  Email,
} from '../../backend/src/repo-parser';

type Story = StoryObj<typeof StackGraphComponent>;

const meta: Meta<typeof StackGraphComponent> = {
  title: 'CommitGraph/StackGraph',
  component: StackGraphComponent,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

const baseTimestamp = new Date('2024-01-01T09:00:00Z').getTime();
const oneDayMs = 24 * 60 * 60 * 1000;

interface CommitFixture {
  id: CommitId;
  changeId: ChangeId;
  description: string;
  dayOffset?: number;
  parents?: CommitId[];
  author?: {
    name: string;
    email: string;
  };
  hasConflicts?: boolean;
}

interface Scenario {
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  stackGraph: LayoutStackGraph;
  commits: Record<string, Commit>;
  bookmarks: Record<CommitId, readonly BookmarkName[]>;
}

function makeCommitId(index: number): CommitId {
  const hex = index.toString(16).padStart(2, '0');
  const repeated = hex.repeat(20).slice(0, 40);
  return repeated as CommitId;
}

function makeChangeId(index: number): ChangeId {
  const suffix = index.toString().padStart(5, '0');
  return `chg${suffix}` as ChangeId;
}

function createCommit({
  id,
  changeId,
  description,
  parents = [],
  dayOffset = 0,
  author,
  hasConflicts = false,
}: CommitFixture): Commit {
  return {
    id,
    changeId,
    description: description as Description,
    author: {
      name: author?.name ?? 'Megumi Fushiguro',
      email: (author?.email ?? 'megumi@jujutsu.jp') as Email,
    },
    timestamp: new Date(baseTimestamp + dayOffset * oneDayMs),
    parents,
    hasConflicts,
  };
}

function resetGraphStore() {
  useGraphStore.setState({
    commitGraph: null,
    currentCommitId: null,
    operationLog: null,
    repoPath: '',
    divergentChangeIds: new Set<ChangeId>(),
    bookmarksByCommit: {},
    isExecutingCommand: false,
  });
}

function configureGraphStore({
  commitGraph,
  bookmarks,
  currentCommitId,
}: {
  commitGraph: Record<CommitId, { commit: Commit; children: CommitId[] }>;
  bookmarks?: Record<CommitId, readonly BookmarkName[]>;
  currentCommitId?: CommitId | null;
}) {
  useGraphStore.setState({
    commitGraph,
    currentCommitId: currentCommitId ?? null,
    repoPath: '',
    bookmarksByCommit: bookmarks ?? {},
    isExecutingCommand: false,
  });
}

function createLinearScenario(): Scenario {
  const root = createCommit({
    id: makeCommitId(1),
    changeId: makeChangeId(1),
    description: 'Initial clean slate',
  });
  const middle = createCommit({
    id: makeCommitId(2),
    changeId: makeChangeId(2),
    description: 'Lay down stack scaffolding',
    parents: [root.id],
    dayOffset: 1,
  });
  const latest = createCommit({
    id: makeCommitId(3),
    changeId: makeChangeId(3),
    description: 'Polish commit card styling',
    parents: [middle.id],
    dayOffset: 2,
  });

  const commits = [root, middle, latest];
  const commitGraph = buildCommitGraph(commits);
  const stackGraph = enhanceStackGraphForLayout(buildStackGraph(commits));

  const bookmarks: Record<CommitId, readonly BookmarkName[]> = {
    [latest.id]: ['main' as BookmarkName],
  };

  return {
    commitGraph,
    stackGraph,
    commits: {
      root,
      middle,
      latest,
    },
    bookmarks,
  };
}

function createBranchingScenario(): Scenario {
  const foundation = createCommit({
    id: makeCommitId(4),
    changeId: makeChangeId(4),
    description: 'Bootstrap repository structure',
  });
  const mainline = createCommit({
    id: makeCommitId(5),
    changeId: makeChangeId(5),
    description: 'Wire primary stack layout',
    parents: [foundation.id],
    dayOffset: 1,
  });
  const mainlineTip = createCommit({
    id: makeCommitId(6),
    changeId: makeChangeId(6),
    description: 'Stabilise drag interactions',
    parents: [mainline.id],
    dayOffset: 2,
  });
  const featureBase = createCommit({
    id: makeCommitId(7),
    changeId: makeChangeId(7),
    description: 'Branch: add bookmark badges',
    parents: [mainline.id],
    dayOffset: 1.5,
  });
  const featurePolish = createCommit({
    id: makeCommitId(8),
    changeId: makeChangeId(8),
    description: 'Resolve hover edge cases',
    parents: [featureBase.id],
    dayOffset: 2.5,
    hasConflicts: true,
  });
  const merge = createCommit({
    id: makeCommitId(9),
    changeId: makeChangeId(9),
    description: 'Integrate feature branch',
    parents: [mainlineTip.id, featurePolish.id],
    dayOffset: 3,
    author: {
      name: 'Yuji Itadori',
      email: 'yuji@jujutsu.jp',
    },
  });

  const commits = [
    foundation,
    mainline,
    featureBase,
    mainlineTip,
    featurePolish,
    merge,
  ];

  const commitGraph = buildCommitGraph(commits);
  const stackGraph = enhanceStackGraphForLayout(buildStackGraph(commits));
  const bookmarks: Record<CommitId, readonly BookmarkName[]> = {
    [mainlineTip.id]: ['team/main' as BookmarkName, 'release/candidate' as BookmarkName],
    [featurePolish.id]: ['feature/drag' as BookmarkName],
  };

  return {
    commitGraph,
    stackGraph,
    commits: {
      foundation,
      mainline,
      mainlineTip,
      featureBase,
      featurePolish,
      merge,
    },
    bookmarks,
  };
}

export const GraphOverview: Story = {
  name: 'Graph Overview',
  render: () => {
    const scenario = createBranchingScenario();
    resetGraphStore();
    configureGraphStore({
      commitGraph: scenario.commitGraph,
      bookmarks: scenario.bookmarks,
      currentCommitId: scenario.commits.mainlineTip.id,
    });
    const divergent: ReadonlySet<ChangeId> = new Set<ChangeId>([
      scenario.commits.featureBase.changeId,
    ]);

    return (
      <DragDropProvider>
        <StackGraphComponent
          stackGraph={scenario.stackGraph}
          commitGraph={scenario.commitGraph}
          selectedCommitId={scenario.commits.merge.id}
          currentCommitId={scenario.commits.mainlineTip.id}
          divergentChangeIds={divergent}
          onCommitSelect={(commitId) => {
            console.log('[story] commit selected', commitId);
          }}
        />
      </DragDropProvider>
    );
  },
};

export const StackFocused: Story = {
  name: 'Single Stack',
  render: () => {
    const scenario = createLinearScenario();
    resetGraphStore();
    configureGraphStore({
      commitGraph: scenario.commitGraph,
      bookmarks: scenario.bookmarks,
      currentCommitId: scenario.commits.latest.id,
    });

    const divergent: ReadonlySet<ChangeId> = new Set<ChangeId>();

    return (
      <DragDropProvider>
        <StackGraphComponent
          stackGraph={scenario.stackGraph}
          commitGraph={scenario.commitGraph}
          selectedCommitId={scenario.commits.middle.id}
          currentCommitId={scenario.commits.latest.id}
          divergentChangeIds={divergent}
          onCommitSelect={(commitId) => {
            console.log('[story] commit selected', commitId);
          }}
        />
      </DragDropProvider>
    );
  },
};

export const CommitStates: Story = {
  name: 'Commit States',
  render: () => {
    const scenario = createBranchingScenario();
    resetGraphStore();
    configureGraphStore({
      commitGraph: scenario.commitGraph,
      bookmarks: {
        ...scenario.bookmarks,
        [scenario.commits.merge.id]: ['integration' as BookmarkName],
      },
      currentCommitId: scenario.commits.mainlineTip.id,
    });

    const divergent: ReadonlySet<ChangeId> = new Set<ChangeId>([
      scenario.commits.featureBase.changeId,
    ]);

    return (
      <DragDropProvider>
        <StackGraphComponent
          stackGraph={scenario.stackGraph}
          commitGraph={scenario.commitGraph}
          selectedCommitId={scenario.commits.featurePolish.id}
          currentCommitId={scenario.commits.mainlineTip.id}
          divergentChangeIds={divergent}
          onCommitSelect={(commitId) => {
            console.log('[story] commit selected', commitId);
          }}
        />
      </DragDropProvider>
    );
  },
};
