import axios from "axios";
import {
  action,
  makeObservable,
  observable,
  override,
  runInAction,
} from "mobx";
import {
  DraftCreateRecord,
  DraftUpdateRecord,
  Record as DBRecord,
} from "./Record";
import { RStore } from "./RStore";
import { Index } from "./StoreIndex";

/**
 * A CRUD store use Map to store records
 */
export abstract class CRUDStore<
  ID extends string | number,
  C extends DraftCreateRecord,
  U extends DraftUpdateRecord<ID, M>,
  M extends DBRecord<ID>
> extends RStore<ID, M> {
  public createDrafts: Map<string, C> = new Map();
  public updateDrafts: Map<ID, U> = new Map();

  protected createAJAXParams = { URL: undefined as any, config: {} };
  protected onDeleteListeners: ((record: M) => void)[] = [];

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
    super(remoteURL, field2name, refetch, indices);

    makeObservable(this, {
      createDrafts: observable,
      updateDrafts: observable,
      create: action,
      update: action,
      delete: action,
      truncate: action,
      setCreateDraft: action,
      deleteCreateDraft: action,
      setUpdateDraft: action,
      deleteUpdateDraft: action,
    });
  }

  /**
   * Add listeners when a record is deleted. Note that the event is only fired
   * if the record is not null (actually exist).
   *
   * @param listener
   */
  public addOnDeleteListener(listener: (record: M) => void) {
    this.onDeleteListeners.push(listener);
  }

  /**
   * Create the record, will sync with remote server.
   */
  async create(draft: C, discardDraft: boolean = true): Promise<M> {
    try {
      this.state.value = "updating";

      let resp = await axios.post(
        this.createAJAXParams.URL || this.remoteURL,
        this.serializeCreateDraft(draft),
        this.createAJAXParams.config
      );

      return runInAction(() => {
        let record = this.deserialize(resp.data);
        this.records.set(record.id, record);
        this.index(record);

        if (discardDraft) {
          this.createDrafts.delete(draft.draftID);
        }

        this.state.value = "updated";
        return this.records.get(record.id)!;
      });
    } catch (error: any) {
      runInAction(() => {
        this.state.value = "error";
      });
      throw error;
    }
  }

  /**
   * Update the record, with sync with remote server
   */
  async update(draft: U, discardDraft: boolean = true): Promise<M> {
    try {
      this.state.value = "updating";

      let resp = await axios.put(
        `${this.remoteURL}/${draft.id}`,
        this.serializeUpdateDraft(draft)
      );

      return runInAction(() => {
        let record = draft.toModel() || this.deserialize(resp.data);
        draft.markSaved();
        // deindex the record if it's in the store
        const prevRecord = this.records.get(draft.id);
        if (prevRecord !== undefined && prevRecord !== null) {
          this.deindex(prevRecord);
        }

        this.records.set(record.id, record);
        this.index(record);

        if (discardDraft && this.updateDrafts.has(draft.id)) {
          this.updateDrafts.delete(draft.id);
        }

        this.state.value = "updated";
        return this.records.get(record.id)!;
      });
    } catch (error: any) {
      runInAction(() => {
        this.state.value = "error";
      });
      throw error;
    }
  }

  /**
   * Remove a record, will sync with remote server
   */
  async delete(id: ID) {
    const record = this.records.get(id);
    if (record === undefined) return;

    try {
      this.state.value = "updating";
      this.records.delete(id);

      if (record !== null) {
        this.deindex(record);
        for (let listener of this.onDeleteListeners) {
          listener(record);
        }
        // important to do async after all updates otherwise, reaction is going to throw
        // while store is updating
        await axios.delete(`${this.remoteURL}/${id}`);
      }

      runInAction(() => {
        this.state.value = "updated";
      });
    } catch (error: any) {
      runInAction(() => {
        this.state.value = "error";
      });
      throw error;
    }
  }

  /**
   * Remove all records, will sync with the remote server
   */
  async truncate(): Promise<void> {
    try {
      this.state.value = "updating";
      await axios.delete(`${this.remoteURL}`);

      runInAction(() => {
        for (const record of this.records.values()) {
          if (record !== null) {
            this.deindex(record);
            for (let listener of this.onDeleteListeners) {
              listener(record);
            }
          }
        }

        this.records.clear();
        this.state.value = "updated";
      });
    } catch (error: any) {
      runInAction(() => {
        this.state.value = "error";
      });
      throw error;
    }
  }

  /**
   * Get a create draft from the store. Return undefined if does not exist
   */
  public getCreateDraft(draftID: string): C | undefined {
    return this.createDrafts.get(draftID);
  }

  public setCreateDraft(draft: C) {
    this.createDrafts.set(draft.draftID, draft);
  }

  public deleteCreateDraft(draftID: string) {
    this.createDrafts.delete(draftID);
  }

  public getUpdateDraft(id: ID): U | undefined {
    return this.updateDrafts.get(id);
  }

  public setUpdateDraft(draft: U) {
    this.updateDrafts.set(draft.id, draft);
  }

  public deleteUpdateDraft(id: ID) {
    this.updateDrafts.delete(id);
  }

  /**
   * Remove a record (by id) from your indexes
   */
  protected deindex(record: M): void {
    for (const index of this.indices) {
      index.remove(record);
    }
  }

  /**
   * Serialize the update to send to the server
   */
  public serializeUpdateDraft(record: U): object {
    return this.serializeRecord(record);
  }

  /**
   * Serialize the create object to send to the server
   */
  public serializeCreateDraft(record: C): object {
    return this.serializeRecord(record);
  }

  /**
   * Serialize the record for sending to the server, fields are renamed
   * if a mapping is provided (this.field2name).
   */
  protected serializeRecord(record: U | C): object {
    const val: any = {};
    for (const [k, v] of Object.entries(record)) {
      if (this.field2name.hasOwnProperty(k)) {
        val[this.field2name[k as unknown as keyof M]] = v;
      } else {
        val[k] = v;
      }
    }
    return val;
  }
}

export class SimpleCRUDStore<
  ID extends string | number,
  M extends DBRecord<ID>
> extends CRUDStore<
  ID,
  Omit<M, "id"> & { draftID: string },
  M & { markSaved(): void; toModel(): M | undefined },
  M
> {
  constructor(
    remoteURL: string,
    field2name?: Partial<Record<keyof M, string>>,
    refetch?: boolean,
    indices?: Index<M>[]
  ) {
    super(remoteURL, field2name, refetch, indices);

    makeObservable(this, {
      create: override,
      update: override,
    });
  }

  async create(draft: Omit<M, "id">): Promise<M> {
    return super.create(Object.assign({ draftID: "" }, draft), true);
  }

  async update(draft: M): Promise<M> {
    return super.update(
      Object.assign(
        {
          markSaved: () => {},
          toModel: () => undefined,
        },
        draft
      ),
      true
    );
  }
}
