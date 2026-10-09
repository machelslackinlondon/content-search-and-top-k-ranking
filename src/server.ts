import { buildApp } from './app';
import { loadConfig } from './config';
import { createListenOptions } from './server-options';

const config = loadConfig();
const app = buildApp({ logger: true, config });

app.listen(createListenOptions(config.server)).catch((error: unknown) => {
  app.log.error(error);
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().catch((error: unknown) => app.log.error(error));
  });
}
