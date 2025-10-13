import type { Commit, CommitId } from "../../backend/src/repo-parser";

export function CommitGraph({ graph }: { graph: Record<CommitId, { commit: Commit; children: CommitId[] }> }) {
    return <div>todo {JSON.stringify(graph)}</div>;
}
