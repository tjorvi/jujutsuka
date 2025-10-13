import { publicProcedure, router } from './trpc.ts';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
 
const appRouter = router({
  test: publicProcedure
    .query(async () => {
        return 'yebbseepebbsee'
    }),
});


// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
  router: appRouter,
});
 
server.listen(3000);
