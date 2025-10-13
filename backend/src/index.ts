import { publicProcedure, router } from './trpc.ts';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { $ } from 'execa';
 
const appRouter = router({
  changes: publicProcedure
    .query(async () => {
        await $`jj log --no-graph --template 'commit_id ++ "|" ++ description ++ "|" ++ author.name() ++ "|" ++ author.email() ++ "|" ++ author.timestamp() ++ "|" ++ parents.map(|p| p.commit_id()).join(",") ++ "\n"'`;
    }),
});


// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
  router: appRouter,
});
 
server.listen(3000);
