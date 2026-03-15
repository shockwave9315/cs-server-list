import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLimit } from '../src/utils/network.js';

test('mapLimit isolates mapper item failures when handler is provided', async () => {
  const errors = [];
  const result = await mapLimit(
    [1, 2, 3],
    2,
    async (item) => {
      if (item === 2) {
        throw new Error('boom');
      }
      return item * 2;
    },
    {
      onItemError(error, item) {
        errors.push({ message: error.message, item });
      }
    }
  );

  assert.deepEqual(result, [2, null, 6]);
  assert.deepEqual(errors, [{ message: 'boom', item: 2 }]);
});
