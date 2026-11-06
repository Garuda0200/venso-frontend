export type BibliaOperationalData = {
  quotations: Array<Record<string, any>>;
  standalone: Array<Record<string, any>>;
};

/** Session-only LRU. Revisions protect cached data and callers awaiting a read. */
export class BibliaReadCache<T> {
  private entries = new Map<string, { value: T; at: number }>();
  private pending = new Map<string, Promise<T>>();
  private revision = 0;

  constructor(
    private ttl = 60_000,
    private limit = 8,
    private now = () => Date.now(),
  ) {}

  clear() {
    this.revision++;
    this.entries.clear();
    this.pending.clear();
  }

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key);
    if (entry && this.now() - entry.at < this.ttl) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.value;
    }

    const running = this.pending.get(key);
    if (running) return running;

    const revision = this.revision;
    const request = Promise.resolve().then(load).then(async value => {
      if (revision !== this.revision) return this.get(key, load);
      this.entries.delete(key);
      this.entries.set(key, { value, at: this.now() });
      while (this.entries.size > this.limit) {
        this.entries.delete(this.entries.keys().next().value!);
      }
      return value;
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }
}

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Includes every adjacent day visible in the six-week calendar grid. */
export const getBibliaCalendarPeriod = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 41);
  return { startDate: dateKey(start), endDate: dateKey(end) };
};
