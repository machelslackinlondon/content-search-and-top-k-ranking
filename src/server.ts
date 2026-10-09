import { buildApp } from './app';

const app = buildApp({ logger: true });
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

app.listen({ host, port }).catch((error: unknown) => {
  app.log.error(error);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().catch((error: unknown) => app.log.error(error));
  });
}
