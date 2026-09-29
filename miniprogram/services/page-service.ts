export interface PageTaskState<T> {
  loading: boolean;
  data?: T;
  error: string;
}

export async function runPageTask<T>(
  task: () => Promise<T>,
  fallback: string,
): Promise<PageTaskState<T>> {
  try {
    return { loading: false, data: await task(), error: '' };
  } catch (error) {
    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof error.message === 'string'
        ? error.message
        : fallback;
    return { loading: false, error: message || fallback };
  }
}
