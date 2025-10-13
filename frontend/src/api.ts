import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../backend/src/index';
import { useEffect, useState } from 'react';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
    }),
  ],
});

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
    input: Parameters
) {
    const [state, setState] = useState<QueryState<R>>({ kind: 'idle' });

    useEffect(() => {
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
    }, [input, query]);


    return state;
}
