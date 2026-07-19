import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';

export interface FixtureRoute {
  contentType: string;
  filePath: string;
}

export interface FixtureServer {
  origin: string;
  server: Server;
  close(): Promise<void>;
}

export async function startFixtureServer(
  routes: ReadonlyMap<string, FixtureRoute>
): Promise<FixtureServer> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const route = routes.get(pathname);
    if (!route) {
      response.writeHead(404).end('Not found');
      return;
    }

    void readFile(route.filePath)
      .then((content) => {
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': route.contentType,
        });
        response.end(content);
      })
      .catch((error: unknown) => {
        response
          .writeHead(500)
          .end(error instanceof Error ? error.message : 'Fixture server error');
      });
  });

  await new Promise<void>((resolveListening, rejectListening) => {
    server.once('error', rejectListening);
    server.listen(0, '127.0.0.1', resolveListening);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server did not bind to a TCP port');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
    async close(): Promise<void> {
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    },
  };
}
