export class TestUtils {

  public static retry<T>(operation: () => Promise<T>, times: number, delay: number): Promise<T> {
    return TestUtils.retryInternal(operation, times, delay, 1);
  }

  private static retryInternal<T>(operation: () => Promise<T>, times: number, delay: number, trial: number): Promise<T> {
    try {
      return operation().catch(e => {
        if (trial >= times) return Promise.reject(e);
        return TestUtils.retryInternalIn(operation, times, delay, trial);
      });
    } catch (e) {
      if (trial >= times) return Promise.reject(e);
      return TestUtils.retryInternalIn(operation, times, delay, trial);
    }
  }

  private static retryInternalIn<T>(operation: () => Promise<T>, times: number, delay: number, trial: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        TestUtils.retryInternal(operation, times, delay, trial + 1)
        .then(resolve).catch(reject);
      }, delay);
    });
  }

}
