/** A response may update a view only while its request and session are current. */
export const createLatestRequest = () => {
  let revision = 0;
  return {
    begin: () => ++revision,
    isCurrent: (token: number) => token === revision,
    cancel: () => { revision += 1; },
  };
};
