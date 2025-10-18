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
  fileChanges: trpc.fileChanges,
  commitStats: trpc.commitStats,
  evolog: trpc.evolog,
  fileDiff: trpc.fileDiff,
} as const;

// stabilise the trpc subscriptions object
export const subscriptions = {
  watchRepoChanges: trpc.watchRepoChanges,
} as const


export const mutations = {
  executeCommand: trpc.executeCommand,
} as const;

type KindedObject = { kind: string }
type Loading = { kind: 'loading' };
type Idle = { kind: 'idle' };
type Failure<E=unknown> = { kind: 'error'; error: E };
type Success<T> = { kind: 'success'; data: T };

export function idle(): Idle {
    return { kind: 'idle' };
}

export function loading(): Loading {
    return { kind: 'loading' };
}

export function success<T>(data: T): Success<T> {
    return { kind: 'success', data };
}

export function succeeded<T>(value: KindedObject): value is Success<T> {
    return typeof value === 'object' && value !== null && value.kind === 'success';
}

export function fail(value: unknown): Failure {
    return { kind: 'error', error: value };
}

export function failed(value: KindedObject): value is Failure {
    return typeof value === 'object' && value !== null && value.kind === 'error';
}

type QueryState<T> = Idle | Loading | Failure | Success<T>;

export function useSubscription<Parameters, R>(
    subscribable: { subscribe: (input: Parameters, callbacks: { 
      onData: (data: R) => void;
      onError: (err: unknown) => void;
      onComplete: () => void }) => { unsubscribe: () => void } },
    input: Parameters,
) {
    const [state, setState] = useState<QueryState<R>>(idle());
    useEffect(() => {
        setState(loading());
        const subscription = subscribable.subscribe(input, {
            onData: (data) => {
                setState(success(data));
            },
            onError: (err) => {
                setState(fail(err));
            },
            onComplete: () => {
              // should we represent this also in the state?
              // if so, should it be idle? or should it hold the last value?
            },
        });

        return () => {
          setState(idle());
          subscription.unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(input), subscribable]);

    return state
}

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
