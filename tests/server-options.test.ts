import { createListenOptions } from '../src/server-options';

test('creates a mutable copy because Fastify adds callback state to listen options', () => {
  const configured = Object.freeze({ host: '127.0.0.1', port: 3000 });

  const options = createListenOptions(configured);

  expect(options).toEqual(configured);
  expect(options).not.toBe(configured);
  expect(() => Object.assign(options, { cb: () => undefined })).not.toThrow();
});
