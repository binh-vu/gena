import { action, makeObservable, observable } from "mobx";

/**
 * An index (fk1) => rid[]
 */
export class SingleKeyIndex<
  ID extends string | number,
  F extends string | number
> {
  public index: Map<F, Set<ID>> = new Map();

  protected fkField: string;
  protected idField: string;

  constructor(field: string, idField?: string) {
    this.fkField = field;
    this.idField = idField || "id";
    makeObservable(this, {
      index: observable,
      add: action,
    });
  }

  public add(record: any) {
    const key = record[this.fkField];

    if (!this.index.has(key)) {
      this.index.set(key, new Set());
    }

    this.index.get(key)!.add(record[this.idField]);
  }

  public remove(record: any) {
    const key = record[this.fkField];
    this.index.get(key)?.delete(record[this.idField]);
  }
}

/**
 * An index fk1 => fk2 => Set<rid>
 */
export class PairKeysIndex<
  ID extends string | number,
  F1 extends string | number,
  F2 extends string | number
> {
  public index: Map<F1, Map<F2, Set<ID>>> = new Map();

  protected fkField1: string;
  protected fkField2: string;
  protected idField: string;

  constructor(fkField1: string, fkField2: string, idField?: string) {
    this.fkField1 = fkField1;
    this.fkField2 = fkField2;
    this.idField = idField || "id";

    makeObservable(this, {
      index: observable,
      add: action,
    });
  }

  /**
   * Index record
   */
  public add(record: any) {
    const key1 = record[this.fkField1];
    const key2 = record[this.fkField2];

    if (!this.index.has(key1)) {
      this.index.set(key1, new Map());
    }

    let map = this.index.get(key1)!;
    if (!map.has(key2)) {
      map.set(key2, new Set());
    }
    map.get(key2)!.add(record[this.idField]);
  }

  public remove(record: any) {
    const key1 = record[this.fkField1];
    const key2 = record[this.fkField2];

    if (this.index.has(key1)) {
      this.index.get(key1)!.get(key2)?.delete(record[this.idField]);
    }
  }
}

/**
 * An index fk1 => fk2 => rid
 */
export class PairKeysUniqueIndex<
  ID extends string | number,
  F1 extends string | number,
  F2 extends string | number
> {
  public index: Map<F1, Map<F2, ID>> = new Map();

  protected fkField1: string;
  protected fkField2: string;
  protected idField: string;

  constructor(fkField1: string, fkField2: string, idField?: string) {
    this.fkField1 = fkField1;
    this.fkField2 = fkField2;
    this.idField = idField || "id";

    makeObservable(this, {
      index: observable,
      add: action,
    });
  }

  /**
   * Index record
   */
  public add(record: any) {
    const key1 = record[this.fkField1];
    const key2 = record[this.fkField2];

    if (!this.index.has(key1)) {
      this.index.set(key1, new Map());
    }

    let map = this.index.get(key1)!;
    map.set(key2, record[this.idField]);
  }

  public remove(record: any) {
    const key1 = record[this.fkField1];
    const key2 = record[this.fkField2];

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
  F3 extends string | number
> {
  public index: Map<F1, Map<F2, Map<F3, Set<ID>>>> = new Map();

  protected fkField1: string;
  protected fkField2: string;
  protected fkField3: string;
  protected idField: string;

  constructor(
    fkField1: string,
    fkField2: string,
    fkField3: string,
    idField?: string
  ) {
    this.fkField1 = fkField1;
    this.fkField2 = fkField2;
    this.fkField3 = fkField3;
    this.idField = idField || "id";

    makeObservable(this, {
      index: observable,
      add: action,
    });
  }

  /**
   * Index record
   */
  public add(record: any) {
    const key1 = record[this.fkField1];
    const key2 = record[this.fkField2];
    const key3 = record[this.fkField3];

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

    map3.get(key3)!.add(record[this.idField]);
  }

  public remove(record: any) {
    const map2 = this.index.get(record[this.fkField1]);
    if (map2 === undefined) return;

    const map3 = map2.get(record[this.fkField2]);
    if (map3 === undefined) return;

    map3.get(record[this.fkField3])?.delete(record[this.idField]);
  }
}
