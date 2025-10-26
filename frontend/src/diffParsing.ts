interface DiffHunkData {
  readonly header: string;
  readonly lines: readonly string[];
}

interface ParsedDiff {
  readonly metadata: readonly string[];
  readonly hunks: readonly DiffHunkData[];
}

export function groupDiffIntoHunks(diff: string): ParsedDiff {
  const lines = diff.split('\n');
  const metadata: string[] = [];
  const hunks: DiffHunkData[] = [];
  let currentHeader: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentHeader === null) {
      return;
    }
    hunks.push({ header: currentHeader, lines: currentLines });
    currentHeader = null;
    currentLines = [];
  };

  lines.forEach((line) => {
    if (line.startsWith('@@')) {
      flush();
      currentHeader = line;
      return;
    }
    if (currentHeader === null) {
      metadata.push(line);
      return;
    }
    currentLines.push(line);
  });

  flush();

  return {
    metadata,
    hunks,
  };
}

export type { DiffHunkData, ParsedDiff };
