import { BoundedQueue } from '../src/index/bounded-queue';

test('reservation prevents competing producers from overcommitting', () => {
  const queue = new BoundedQueue<string>(2);
  const reservation = queue.reserve(2);

  expect(queue.reserved).toBe(2);
  expect(() => queue.reserve(1)).toThrow(
    expect.objectContaining({ code: 'INDEX_QUEUE_FULL', statusCode: 429 }),
  );
  reservation.release();
  expect(queue.reserve(1)).toBeDefined();
});

test('commits exact reserved work in FIFO order', async () => {
  const queue = new BoundedQueue<string>(3);
  queue.reserve(2).commit(['first', 'second']);

  await expect(queue.take()).resolves.toBe('first');
  await expect(queue.take()).resolves.toBe('second');
  expect(queue.depth).toBe(0);
});

test('hands committed work directly to a waiting consumer', async () => {
  const queue = new BoundedQueue<string>(1);
  const pending = queue.take();

  queue.reserve(1).commit(['work']);

  await expect(pending).resolves.toBe('work');
  expect(queue.depth).toBe(0);
});

test('rejects wrong commit counts and repeated reservation settlement', () => {
  const queue = new BoundedQueue<string>(2);
  const reservation = queue.reserve(2);
  expect(() => reservation.commit(['one'])).toThrow('exactly 2');
  reservation.commit(['one', 'two']);
  expect(() => reservation.release()).toThrow('already settled');
  expect(() => reservation.commit(['one', 'two'])).toThrow('already settled');
});

test('close rejects waiting and future consumers and producers', async () => {
  const queue = new BoundedQueue<string>(1);
  const pending = queue.take();

  queue.close();

  await expect(pending).rejects.toEqual(expect.objectContaining({ code: 'INDEX_QUEUE_CLOSED' }));
  await expect(queue.take()).rejects.toEqual(expect.objectContaining({ code: 'INDEX_QUEUE_CLOSED' }));
  expect(() => queue.reserve(1)).toThrow(expect.objectContaining({ code: 'INDEX_QUEUE_CLOSED' }));
});
