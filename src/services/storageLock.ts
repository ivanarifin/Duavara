let writeQueue = Promise.resolve();
let nextOperationId = 0;
let activeOperationId: number | null = null;
const pendingOperationIds = new Set<number>();
let localDataEpoch = 0;
let resetInProgress = false;
let resetAllowedOperationId: number | null = null;

export function captureLocalDataEpoch(): number {
  return localDataEpoch;
}

export function beginLocalDataReset(): number {
  localDataEpoch += 1;
  resetInProgress = true;
  resetAllowedOperationId =
    activeOperationId ?? pendingOperationIds.values().next().value ?? null;
  return localDataEpoch;
}

export function completeLocalDataReset(epoch: number): void {
  if (localDataEpoch === epoch) localDataEpoch += 1;
  resetInProgress = false;
  resetAllowedOperationId = null;
}

export function withStorageLock<T>(
  operation: () => Promise<T>,
  expectedEpoch = captureLocalDataEpoch(),
  allowDuringReset = false,
): Promise<T> {
  const operationId = ++nextOperationId;
  pendingOperationIds.add(operationId);
  const run = async () => {
    pendingOperationIds.delete(operationId);
    activeOperationId = operationId;
    try {
      const isAllowedHeadOperation = operationId === resetAllowedOperationId;
      if (
        !allowDuringReset &&
        ((resetInProgress && !isAllowedHeadOperation) ||
          (expectedEpoch !== localDataEpoch && !isAllowedHeadOperation))
      ) {
        throw new Error('LOCAL_DATA_RESET');
      }
      return await operation();
    } finally {
      if (activeOperationId === operationId) activeOperationId = null;
    }
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
