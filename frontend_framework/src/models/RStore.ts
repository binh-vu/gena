import axios, { AxiosError } from "axios";
import {
  observable,
  flow,
  action,
  runInAction,
  computed,
  makeObservable,
} from "mobx";
import { CancellablePromise } from "mobx/dist/api/flow";
import { Record as DBRecord } from "./Record";
import { message } from "antd";
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

export type QueryConditions<R> = Partial<
  Record<
    keyof R,
    | string
    | number
    | boolean
    | { op: "max"; value: (keyof R)[] }
    | { op: "gt" | "lt" | "gte" | "lte"; value: string | number }
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

export abstract class RStore<
  ID extends string | number,
  M extends DBRecord<ID>
> {
  public state: StoreState = new StoreState();
  // null represent that entity does not exist on the server
  public records: Map<ID, M | null> = new Map();
  public ajaxErrorHandler: (error: AxiosError<any>) => void = (
    error: AxiosError<any>
  ) => {
    message.error(
      "Error while talking with the server. Check console for more details.",
      10
    );
    console.error(error);
  };
  public field2name: Partial<Record<keyof M, string>>;
  public name2field: Partial<Record<string, keyof M>>;
  // a list of (field name in the remote API, field name in the record)
  public nameAndField: [string, keyof M][];

  protected remoteURL: string;
  // whether to reload the entity if the store already has an entity
  protected refetch: boolean = true;
  protected indices: Index<M>[] = [];

  /**
   * Constructor
   *
   * @param remoteURL RESTful endpoint for this store
   * @param field2name mapping from Record's field to the corresponding field name in the RESTful API
   * @param refetch whether to refetch the entity if it is already in the store
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

    makeObservable(this, {
      state: observable,
      records: observable,
      fetch: action,
      fetchOne: action,
      fetchById: action,
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

        return record;
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
      this.ajaxErrorHandler(error);
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
  async fetchById(id: ID): Promise<M | undefined> {
    if (!this.refetch && this.has(id)) {
      const record = this.records.get(id);
      if (record === null) return Promise.resolve(undefined);
      return Promise.resolve(record);
    }

    try {
      this.state.value = "updating";

      let resp = await axios.get(`${this.remoteURL}/${id}`);

      return runInAction(() => {
        let record = this.deserialize(resp.data);
        this.records.set(record.id, record);
        this.index(record);
        this.state.value = "updated";

        return record;
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
      this.ajaxErrorHandler(error);
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
  async fetchByIds(ids: ID[]): Promise<Record<ID, M>> {
    let sendoutIds = ids;
    if (!this.refetch) {
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
      let resp = await axios.post(`${this.remoteURL}/find_by_ids`, {
        ids: sendoutIds,
      });

      return runInAction(() => {
        for (const item of Object.values(resp.data.items)) {
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
      this.ajaxErrorHandler(error);
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
            params[`${field}[${op_or_val.op}]`] = op_or_val.value;
          }
        } else {
          params[`${field}`] = op_or_val;
        }
      }
    }

    if (Array.isArray(query.sortedBy)) {
      params.sorted_by = query.sortedBy
        .map((item) => {
          const field = this.field2name[item.field] || item.field;
          return item.order === "asc" ? field : `-${field}`;
        })
        .join(",");
    } else if (typeof query.sortedBy === "object") {
      const field =
        this.field2name[query.sortedBy.field] || query.sortedBy.field;
      params.sorted_by = query.sortedBy.order === "asc" ? field : `-${field}`;
    } else {
      params.sorted_by = this.field2name[query.sortedBy] || query.sortedBy;
    }

    if (query.groupBy !== undefined) {
      params.group_by = query.groupBy
        .map((field) => this.field2name[field] || field)
        .join(",");
    }

    let resp: any;
    try {
      resp = await axios.get(`${this.remoteURL}`, { params });
    } catch (error: any) {
      this.ajaxErrorHandler(error);
      throw error;
    }

    return {
      records: resp.data.items.map(this.deserialize),
      total: resp.data.total,
    };
  }

  /**
   * Query records by name (not store the result)
   */
  public queryByName = async (name: string): Promise<FetchResult<M>> => {
    let resp: any;
    try {
      resp = await axios.get(`${this.remoteURL}`, {
        params: {
          q: name,
        },
      });
    } catch (error: any) {
      this.ajaxErrorHandler(error);
      throw error;
    }

    return { records: resp.data.map(this.deserialize), total: resp.data.total };
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
   * Deserialize the data sent from the server to a record
   */
  public deserialize = (record: any): M => {
    if (this.nameAndField.length > 0) {
      for (const [name, field] of this.nameAndField) {
        record[field] = record[name];
        delete record[name];
      }
    }
    return record;
  };

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
}
