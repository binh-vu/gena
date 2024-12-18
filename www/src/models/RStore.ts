import axios from "axios";
import {
  action,
  computed,
  flow,
  makeObservable,
  observable,
  runInAction,
} from "mobx";
import { CancellablePromise } from "mobx/dist/api/flow";
import { Record as DBRecord } from "./Record";
import { Index } from "./StoreIndex";

export class StoreState {
  public _value: "updating" | "updated" | "error" = "updated";
  public forbiddenStates: Set<"updating" | "updated" | "error"> = new Set();

  constructor() {
    makeObservable(this, {
      _value: observable,
      value: computed,
    });
  }

  public get value() {
    return this._value;
  }

  public set value(v: "updating" | "updated" | "error") {
    if (this.forbiddenStates.has(v)) {
      return;
    }
    this._value = v;
  }
}

/**
 * For each field, you can either choose to filter by exact value matching (typeof string, number, boolean),
 * or choose to be max of a group (records are grouped by multiple fields in the value (hence value is (keyof R)[])),
 * or choose to be greater, less than (gt, lt, gte, lte) than a value (number only), or choose to be in an array of
 * values (string[] or number[])
 */
export type QueryConditions<R> = Partial<
  Record<
    keyof R,
    | string
    | number
    | boolean
    | { op: "max"; value: (keyof R)[] }
    | {
        op: "gt" | "lt" | "gte" | "lte" | "in";
        value: string | number | string[] | number[];
      }
  >
>;

export interface Query<R> {
  limit?: number;
  offset?: number;
  fields?: (keyof R)[];
  conditions?: QueryConditions<R>;
  unique?: boolean;
  sortedBy?:
    | keyof R
    | { field: keyof R; order: "desc" | "asc" }
    | { field: keyof R; order: "desc" | "asc" }[];
  groupBy?: (keyof R)[];
}

export type FetchResult<M> = { records: M[]; total: number };
export type FetchResponse = { items: any[]; total: number };

export abstract class RStore<
  ID extends string | number,
  M extends DBRecord<ID>
> {
  public state: StoreState = new StoreState();
  // null represent that entity does not exist on the server
  public records: Map<ID, M | null> = new Map();
  public field2name: Partial<Record<keyof M, string>>;
  public name2field: Partial<Record<string, keyof M>>;
  // a list of (field name in the remote API, field name in the record)
  public nameAndField: [string, keyof M][];
  // whether to reload the entity if the store already has an entity
  public refetch: boolean = true;
  public batch: BatchFetchRequests<ID, M>;

  protected remoteURL: string;

  // storing index, has to make it public to make it observable, but you should treat it as protected
  public indices: Index<M>[] = [];

  /**
   * Constructor
   *
   * @param remoteURL RESTful endpoint for this store
   * @param field2name mapping from Record's field to the corresponding field name in the RESTful API
   * @param refetch whether to refetch the entity if it is already in the store
   * @param indices list of indices to create
   */
  constructor(
    remoteURL: string,
    field2name?: Partial<Record<keyof M, string>>,
    refetch?: boolean,
    indices?: Index<M>[]
  ) {
    this.remoteURL = remoteURL;
    this.field2name = field2name || {};
    this.nameAndField = Object.entries(this.field2name).map(
      ([key, value]) => [value, key] as [string, keyof M]
    );
    this.name2field = Object.fromEntries(this.nameAndField);
    if (refetch !== undefined) {
      this.refetch = refetch;
    }
    this.indices = indices || [];
    this.batch = new BatchFetchRequests(this, 50);

    makeObservable(this, {
      state: observable,
      records: observable,
      indices: observable,
      fetch: action,
      fetchOne: action,
      fetchById: action,
      fetchByIds: action,
      set: action,
      list: computed,
    });
  }

  /**
   * Get the number of records in the table
   */
  async remoteSize() {
    return (await this.query({ limit: 1 })).total;
  }

  /**
   * Fetch mutliple records from remote server
   */
  public fetch: (query: Query<M>) => CancellablePromise<FetchResult<M>> = flow(
    function* (this: RStore<ID, M>, query: Query<M>) {
      try {
        this.state.value = "updating";
        const result = yield this.query(query);

        for (const record of result.records) {
          this.records.set(record.id, record);
          this.index(record);
        }

        this.state.value = "updated";
        result.records = result.records.map((record: any) =>
          this.records.get(record.id)
        );
        return result;
      } catch (error: any) {
        this.state.value = "error";
        throw error;
      }
    }
  );

  /** Fetch one record from the remote server */
  async fetchOne(query: Query<M>): Promise<M | undefined> {
    try {
      this.state.value = "updating";
      query.limit = 1;
      const result = await this.query(query);

      if (result.records.length === 0) {
        // entity does not exist
        runInAction(() => {
          this.state.value = "updated";
        });
        return undefined;
      }

      let record = result.records[0];
      return runInAction(() => {
        this.records.set(record.id, record);
        this.index(record);
        this.state.value = "updated";

        return this.records.get(record.id)!;
      });
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        // entity does not exist
        runInAction(() => {
          this.state.value = "updated";
        });
        return undefined;
      }

      runInAction(() => {
        this.state.value = "error";
      });
      throw error;
    }
  }

  /**
   * Fetch a record from remote server.
   *
   * Use async instead of flow as we may want to override the function and call super.
   *
   * @returns the record if it exists, undefined otherwise
   */
  async fetchById(id: ID, force: boolean = false): Promise<M | undefined> {
    if (!force && !this.refetch && this.has(id)) {
      const record = this.records.get(id);
      if (record === null) return Promise.resolve(undefined);
      return Promise.resolve(record);
    }

    try {
      this.state.value = "updating";

      let resp = await this.createFetchByIdRequest(id);

      return runInAction(() => {
        let record = this.deserialize(resp.data);
        this.records.set(record.id, record);
        this.index(record);
        this.state.value = "updated";

        return this.records.get(record.id)!;
      });
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        // entity does not exist
        runInAction(() => {
          this.records.set(id, null);
          this.state.value = "updated";
        });
        return undefined;
      }

      runInAction(() => {
        this.state.value = "error";
      });
      throw error;
    }
  }

  /**
   * Fetch multiple records from remote server by their IDs.
   *
   * Use async instead of flow as we may want to override the function and call super.
   *
   * @returns an object containing record that we found (the one we didn't found is undefined)
   */
  async fetchByIds(
    ids: ID[],
    force: boolean = false,
    extraArgs: object | undefined = undefined
  ): Promise<Record<ID, M>> {
    let sendoutIds = ids;
    if (!force && !this.refetch) {
      // no refetch, then we need to filter the list of ids
      sendoutIds = sendoutIds.filter((id) => !this.has(id));

      if (sendoutIds.length === 0) {
        const output = {} as Record<ID, M>;
        for (const id of ids) {
          const record = this.records.get(id);
          if (record !== null && record !== undefined) {
            output[id] = record;
          }
        }
        return Promise.resolve(output);
      }
    }

    try {
      this.state.value = "updating";
      let params =
        extraArgs !== undefined
          ? { ids: sendoutIds, ...extraArgs }
          : { ids: sendoutIds };
      let resp = this.normRemoteSuccessfulResponse(
        await axios.post(`${this.remoteURL}/find_by_ids`, params)
      );

      return runInAction(() => {
        for (const item of resp.items) {
          const record = this.deserialize(item);
          this.records.set(record.id, record);
          this.index(record);
        }

        const output = {} as Record<ID, M>;
        for (const id of ids) {
          const record = this.records.get(id);
          if (record === undefined) {
            this.records.set(id, null);
          } else if (record !== null) {
            output[id] = record;
          }
        }

        this.state.value = "updated";
        return output;
      });
    } catch (error: any) {
      runInAction(() => {
        this.state.value = "error";
      });
      throw error;
    }
  }

  /** Query records (not store the result) */
  async query(query: Query<M>): Promise<FetchResult<M>> {
    let params: any = {
      limit: query.limit,
      offset: query.offset,
      unique: query.unique,
    };
    if (query.fields !== undefined) {
      params.fields = query.fields
        .map((field) => this.field2name[field] || field)
        .join(",");
    }

    if (query.conditions !== undefined) {
      for (let [field, op_or_val] of Object.entries(query.conditions)) {
        field = this.field2name[field as keyof M] || field;
        if (typeof op_or_val === "object") {
          if (op_or_val.op === "max") {
            params[`${field}[${op_or_val.op}]`] = op_or_val.value.join(",");
          } else {
            params[`${field}[${op_or_val.op}]`] = Array.isArray(op_or_val.value)
              ? op_or_val.value.join(",")
              : op_or_val.value;
          }
        } else {
          params[`${field}`] = op_or_val;
        }
      }
    }

    if (Array.isArray(query.sortedBy)) {
      if (query.sortedBy.length > 0) {
        params.sorted_by = query.sortedBy
          .map((item) => {
            const field = this.field2name[item.field] || item.field;
            return item.order === "asc" ? field : `-${String(field)}`;
          })
          .join(",");
      }
    } else if (typeof query.sortedBy === "object") {
      const field =
        this.field2name[query.sortedBy.field] || query.sortedBy.field;
      params.sorted_by =
        query.sortedBy.order === "asc" ? field : `-${String(field)}`;
    } else {
      params.sorted_by = this.field2name[query.sortedBy] || query.sortedBy;
    }

    if (query.groupBy !== undefined) {
      params.group_by = query.groupBy
        .map((field) => this.field2name[field] || field)
        .join(",");
    }

    let resp: FetchResponse;
    try {
      resp = this.normRemoteSuccessfulResponse(
        await axios.get(`${this.remoteURL}`, { params })
      );
    } catch (error: any) {
      throw error;
    }

    return {
      records: resp.items.map(this.deserialize.bind(this)),
      total: resp.total,
    };
  }

  /**
   * Query records by name (not store the result)
   */
  public queryByName = async (name: string): Promise<FetchResult<M>> => {
    let resp: FetchResponse;
    try {
      resp = this.normRemoteSuccessfulResponse(
        await axios.get(`${this.remoteURL}`, {
          params: {
            q: name,
          },
        })
      );
    } catch (error: any) {
      throw error;
    }

    return {
      records: resp.items.map(this.deserialize.bind(this)),
      total: resp.total,
    };
  };

  /**
   * Test if we store a local copy of a record (INCLUDING NULL -- the record does not exist)
   */
  public has(id: ID): boolean {
    return this.records.has(id);
  }

  /**
   * Get a local copy of a record
   */
  public get(id: ID): M | null | undefined {
    return this.records.get(id);
  }

  /**
   * Save a record to the store
   *
   * @param m the record
   */
  public set(m: M) {
    this.records.set(m.id, m);
    this.index(m);
  }

  /**
   * Iter through list of local copy of records in the store
   */
  public *iter(): Iterable<M> {
    for (const m of this.records.values()) {
      if (m !== null) {
        yield m;
      }
    }
  }

  /**
   * Get a list of local copy of records in the store
   */
  get list(): M[] {
    return Array.from(this.iter());
  }

  /**
   * Filter records according to the filter function
   */
  public filter(fn: (r: M) => boolean): M[] {
    let output = [];
    for (const r of this.records.values()) {
      if (r !== null && fn(r)) {
        output.push(r);
      }
    }
    return output;
  }

  /**
   * Group records by values of some fields
   */
  public groupBy(groupedFields: (keyof M)[], records: M[]): M[][] {
    let output: { [k: string]: M[] } = {};
    for (const r of records) {
      const key = groupedFields.map((field) => r[field]).join("$");
      if (output[key] === undefined) {
        output[key] = [r];
      } else {
        output[key].push(r);
      }
    }

    return Object.values(output);
  }

  /**
   * Deserialize the data sent from the server to a record.
   */
  public deserialize(record: any): M {
    if (this.nameAndField.length > 0) {
      for (const [name, field] of this.nameAndField) {
        record[field] = record[name];
        delete record[name];
      }
    }
    return record;
  }

  /**
   * Add a record to your indexes. Its implementation must be IDEMPOTENT
   */
  protected index(record: M): void {
    for (const index of this.indices) {
      index.add(record);
    }
  }

  /** Encode a query condition so its can be shared through URL */
  public encodeWhereQuery(condition: QueryConditions<M>) {
    return btoa(JSON.stringify(condition));
  }

  /** Decode a query back to its original form */
  public decodeWhereQuery(encodedCondition: string): QueryConditions<M> {
    return JSON.parse(atob(encodedCondition));
  }

  /**
   * Create a request for fetching a record by id. This is useful for
   * ID that contains special characters such as / that even encoded
   * will be decoded automatically by the server and cause an invalid request.
   */
  protected createFetchByIdRequest(id: ID) {
    return axios.get(`${this.remoteURL}/${id}`);
  }

  /**
   * Normalize the response of fetching multiple records from the remote server. This is useful when the
   * response is not in the format that we want.
   */
  protected normRemoteSuccessfulResponse(resp: any): FetchResponse {
    return {
      items: Array.isArray(resp.data.items)
        ? resp.data.items
        : Object.values(resp.data.items),
      total: resp.data.total,
    };
  }
}

class BatchFetchRequests<ID extends string | number, M extends DBRecord<ID>> {
  // window size in ms that two requests within this window will be batched together
  private window: number;
  private requests: Set<ID>;
  private store: RStore<ID, M>;
  private callback?: NodeJS.Timeout;
  // storing list of requests that we are executing but haven't got the results yet
  private executingRequests: Map<ID, Promise<any>>;

  constructor(store: RStore<ID, M>, window: number) {
    this.store = store;
    this.window = window;
    this.requests = new Set();
    this.executingRequests = new Map();
  }

  public fetchById(id: ID): Promise<M | undefined> {
    this.requests.add(id);

    if (this.callback !== undefined) {
      clearTimeout(this.callback);
    }

    return new Promise((resolve, reject) => {
      this.callback = setTimeout(() => {
        const promise = this.exec();
        promise.catch(reject);
        promise.then(() => {
          // in case it's still pending from previous requests
          const m = this.executingRequests.get(id);
          if (m !== undefined) {
            // don't remove executingRequests as it will be removed automatically when the promise resolves
            m.then(() => {
              const r = this.store.records.get(id);
              resolve(r === null ? undefined : r);
            });
          } else {
            const r = this.store.records.get(id);
            resolve(r === null ? undefined : r);
          }
        });
      }, this.window);
    });
  }

  public fetchByIds(ids: ID[]): Promise<Record<ID, M>> {
    for (const id of ids) this.requests.add(id);

    if (this.callback !== undefined) {
      clearTimeout(this.callback);
    }

    return new Promise((resolve, reject) => {
      this.callback = setTimeout(() => {
        const promise = this.exec();
        promise.catch(reject);
        promise.then(() => {
          const output = {} as Record<ID, M>;
          const pendingPromises: [Promise<any>, ID][] = [];

          for (const id of ids) {
            const m = this.executingRequests.get(id);
            if (m !== undefined) {
              // don't remove executingRequests as it will be removed automatically when the promise resolves
              pendingPromises.push([m, id]);
            } else {
              const record = this.store.records.get(id);
              if (record !== null && record !== undefined) {
                output[id] = record;
              }
            }
          }

          if (pendingPromises.length > 0) {
            // waiting for pending requests to finish
            Promise.all(pendingPromises.map((x) => x[0])).then(() => {
              for (const m_n_id of pendingPromises) {
                const id = m_n_id[1];
                const record = this.store.records.get(id);
                if (record !== null && record !== undefined) {
                  output[id] = record;
                }
              }
              resolve(output);
            });
          } else {
            resolve(output);
          }
        });
      }, this.window);
    });
  }

  protected exec() {
    // clear the callback as we are executing it
    this.callback = undefined;

    // sending out requests that is not executing
    const reqs = Array.from(this.requests).filter(
      (id) => !this.executingRequests.has(id)
    );
    // clean up the requests so the next callback can add
    this.requests = new Set();

    const promise = this.store.fetchByIds(reqs);

    // adding the sending out requests into the executing queue
    for (const req of reqs) this.executingRequests.set(req, promise);

    return promise.then((result) => {
      // clean up the executing requests
      for (const req of reqs) this.executingRequests.delete(req);
      return result;
    });
  }
}
