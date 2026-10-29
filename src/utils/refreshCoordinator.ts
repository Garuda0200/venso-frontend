// A refresh requested during a read schedules one follow-up, not parallel GETs.
export const createRefreshCoordinator = () => {
  let operation = null;
  let pending = null;
  return run => {
    pending = run;
    if (!operation) {
      operation = Promise.resolve().then(async () => {
        try {
          while (pending) {
            const next = pending; pending = null;
            try { await next(); }
            catch (error) { if (!pending) throw error; }
          }
        }
        finally { operation = null; }
      });
    }
    return operation;
  };
};
