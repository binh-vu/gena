import { action, makeObservable, observable } from "mobx";
import { Record } from "./Record";

export interface Index<ID extends string | number, M extends Record<ID>> {
  // add record to the index
  add(record: M): void;

  // remove record from the index
  remove(record: M): void;
}

export class SingleKeyUniqueIndex<
  ID extends string | number,
  F extends string | number,
  M extends Record<ID>
> implements Index<ID, M>
{
  public index: Map<F, ID> = new Map();

  protected fkField: keyof M;

  constructor(field: keyof M) {
    this.fkField = field;
    makeObservable(this, {
      index: observable,
      add: action,
      remove: action,
    });
  }

  public add(record: M) {
    const key = record[this.fkField] as unknown as F;
    this.index.set(key, record.id);
  }

  public remove(record: M) {
    const key = record[this.fkField] as unknown as F;
    this.index.delete(key);
  }
}

/**
 * An index (fk1) => rid[]
 */
export class SingleKeyIndex<
  ID extends string | number,
  F extends string | number,
  M extends Record<ID>
> implements Index<ID, M>
{
  public index: Map<F, Set<ID>> = new Map();

  protected fkField: keyof M;

  constructor(field: keyof M) {
    this.fkField = field;
    makeObservable(this, {
      index: observable,
      add: action,
      remove: action,
    });
  }

  public add(record: M) {
    const key = record[this.fkField] as unknown as F;

    if (!this.index.has(key)) {
      this.index.set(key, new Set());
    }

    this.index.get(key)!.add(record.id);
  }

  public remove(record: M) {
    const key = record[this.fkField] as unknown as F;
    this.index.get(key)?.delete(record.id);
  }
}

/**
 * An index fk1 => fk2 => Set<rid>
 */
export class PairKeysIndex<
  ID extends string | number,
  F1 extends string | number,
  F2 extends string | number,
  M extends Record<ID>
> implements Index<ID, M>
{
  public index: Map<F1, Map<F2, Set<ID>>> = new Map();

  protected fkField1: keyof M;
  protected fkField2: keyof M;

  constructor(fkField1: keyof M, fkField2: keyof M) {
    this.fkField1 = fkField1;
    this.fkField2 = fkField2;

    makeObservable(this, {
      index: observable,
      add: action,
      remove: action,
    });
  }

  /**
   * Index record
   */
  public add(record: M) {
    const key1 = record[this.fkField1] as unknown as F1;
    const key2 = record[this.fkField2] as unknown as F2;

    if (!this.index.has(key1)) {
      this.index.set(key1, new Map());
    }

    let map = this.index.get(key1)!;
    if (!map.has(key2)) {
      map.set(key2, new Set());
    }
    map.get(key2)!.add(record.id);
  }

  public remove(record: M) {
    const key1 = record[this.fkField1] as unknown as F1;
    const key2 = record[this.fkField2] as unknown as F2;

    if (this.index.has(key1)) {
      this.index.get(key1)!.get(key2)?.delete(record.id);
    }
  }
}

/**
 * An index fk1 => fk2 => rid
 */
export class PairKeysUniqueIndex<
  ID extends string | number,
  F1 extends string | number,
  F2 extends string | number,
  M extends Record<ID>
> implements Index<ID, M>
{
  public index: Map<F1, Map<F2, ID>> = new Map();

  protected fkField1: keyof M;
  protected fkField2: keyof M;

  constructor(fkField1: keyof M, fkField2: keyof M) {
    this.fkField1 = fkField1;
    this.fkField2 = fkField2;

    makeObservable(this, {
      index: observable,
      add: action,
      remove: action,
    });
  }

  /**
   * Index record
   */
  public add(record: M) {
    const key1 = record[this.fkField1] as unknown as F1;
    const key2 = record[this.fkField2] as unknown as F2;

    if (!this.index.has(key1)) {
      this.index.set(key1, new Map());
    }

    let map = this.index.get(key1)!;
    map.set(key2, record.id);
  }

  public remove(record: M) {
    const key1 = record[this.fkField1] as unknown as F1;
    const key2 = record[this.fkField2] as unknown as F2;

    if (this.index.has(key1)) {
      this.index.get(key1)!.delete(key2);
    }
  }
}

/**
 * An index fk1 => fk2 => Set<rid>
 */
export class TripleKeysIndex<
  ID extends string | number,
  F1 extends string | number,
  F2 extends string | number,
  F3 extends string | number,
  M extends Record<ID>
> implements Index<ID, M>
{
  public index: Map<F1, Map<F2, Map<F3, Set<ID>>>> = new Map();

  protected fkField1: keyof M;
  protected fkField2: keyof M;
  protected fkField3: keyof M;

  constructor(
    fkField1: keyof M,
    fkField2: keyof M,
    fkField3: keyof M,
    idField?: keyof M
  ) {
    this.fkField1 = fkField1;
    this.fkField2 = fkField2;
    this.fkField3 = fkField3;

    makeObservable(this, {
      index: observable,
      add: action,
      remove: action,
    });
  }

  /**
   * Index record
   */
  public add(record: M) {
    const key1 = record[this.fkField1] as unknown as F1;
    const key2 = record[this.fkField2] as unknown as F2;
    const key3 = record[this.fkField3] as unknown as F3;

    if (!this.index.has(key1)) {
      this.index.set(key1, new Map());
    }

    let map2 = this.index.get(key1)!;
    if (!map2.has(key2)) {
      map2.set(key2, new Map());
    }

    let map3 = map2.get(key2)!;
    if (!map3.has(key3)) {
      map3.set(key3, new Set());
    }

    map3.get(key3)!.add(record.id);
  }

  public remove(record: M) {
    const map2 = this.index.get(record[this.fkField1] as unknown as F1);
    if (map2 === undefined) return;

    const map3 = map2.get(record[this.fkField2] as unknown as F2);
    if (map3 === undefined) return;

    map3.get(record[this.fkField3] as unknown as F3)?.delete(record.id);
  }
}
