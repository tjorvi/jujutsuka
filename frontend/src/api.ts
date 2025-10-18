import { createTRPCClient, httpLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import type { AppRouter } from '../../backend/src/routes';
import { useEffect, useState } from 'react';
import superjson from 'superjson';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: '/trpc',
        transformer: superjson,
      }),
      false: httpLink({
        url: '/trpc',
        transformer: superjson,
      }),
    }),
  ],
});

// Create stable references for queries to avoid endless re-renders
export const queries = {
  graph: trpc.graph,
  stacks: trpc.stacks,
  layoutStacks: trpc.layoutStacks,
  fileChanges: trpc.fileChanges,
  commitStats: trpc.commitStats,
  evolog: trpc.evolog,
  fileDiff: trpc.fileDiff,
} as const;

export const mutations = {
  executeCommand: trpc.executeCommand,
} as const;

type KindedObject = { kind: string }
type Loading = { kind: 'loading' };
type Idle = { kind: 'idle' };
type Failure<E=unknown> = { kind: 'error'; error: E };
type Success<T> = { kind: 'success'; data: T };

export function failed(value: KindedObject): value is Failure {
    return typeof value === 'object' && value !== null && value.kind === 'error';
}

type QueryState<T> = Idle | Loading | Failure | Success<T>;

export function useQuery<Parameters, R>(
    { query }: { query: (input: Parameters, options: { signal: AbortSignal }) => Promise<R> },
    input: Parameters,
    options?: { enabled?: boolean }
) {
    const [state, setState] = useState<QueryState<R>>({ kind: 'idle' });
    const enabled = options?.enabled ?? true;

    useEffect(() => {
        if (!enabled) {
            setState({ kind: 'idle' });
            return;
        }

        const controller = new AbortController();

        async function fetchData() {
            setState({ kind: 'loading' });
            try {
                const response = await query(input, { signal: controller.signal });
                setState({ kind: 'success', data: response });
            } catch (error) {
                setState(controller.signal.aborted
                    ? { kind: 'idle' }
                    : { kind: 'error', error }
                );
            }
        }

        fetchData();

        return () => {
            controller.abort();
            setState({ kind: 'idle' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(input), query, enabled]);


    return state;
}
