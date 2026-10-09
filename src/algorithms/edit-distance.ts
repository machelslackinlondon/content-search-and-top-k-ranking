export function editDistance(
  leftValue: string,
  rightValue: string,
  maxDistance?: number,
): number {
  if (
    maxDistance !== undefined
    && (!Number.isSafeInteger(maxDistance) || maxDistance < 0)
  ) {
    throw new RangeError('maxDistance must be a non-negative safe integer');
  }

  let left = Array.from(leftValue);
  let right = Array.from(rightValue);
  if (right.length > left.length) {
    [left, right] = [right, left];
  }
  if (
    maxDistance !== undefined
    && left.length - right.length > maxDistance
  ) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let current = new Array<number>(right.length + 1).fill(0);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (previous[rightIndex] as number) + 1,
        (current[rightIndex - 1] as number) + 1,
        (previous[rightIndex - 1] as number) + substitutionCost,
      );
    }
    [previous, current] = [current, previous];
  }

  const distance = previous[right.length] as number;
  return maxDistance !== undefined && distance > maxDistance
    ? maxDistance + 1
    : distance;
}
