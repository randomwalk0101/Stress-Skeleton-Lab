export const runtime = globalThis.browser || globalThis.chrome;

export function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      const result = runtime.runtime.sendMessage(message, response => {
        const error = runtime.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response);
      });

      if (result && typeof result.then === "function") {
        result.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}
