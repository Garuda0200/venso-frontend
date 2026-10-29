import { isRequestCanceled } from "./apiUtils";

// Only idempotent reads may use this helper. Never wrap a payment mutation.
export const readWithRetry = async (read, { attempts = 3, delay = ms => new Promise(resolve=>setTimeout(resolve,ms)) } = {}) => {
  for (let attempt=0; ; attempt++) {
    try { return await read(); }
    catch(error) {
      const status=error?.response?.status;
      const transient=(!error?.response && ["ERR_NETWORK","ECONNABORTED","ETIMEDOUT"].includes(error?.code)) || [502,503,504].includes(status);
      if (!transient || isRequestCanceled(error) || attempt >= attempts-1) throw error;
      await delay(500 * 2**attempt);
    }
  }
};
