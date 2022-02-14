export interface JunctionRecord<
  JID extends string | number,
  AID extends string | number,
  BID extends string | number
> {
  id: JID;
  aid: AID;
  bid: BID;
}

export interface Record<ID extends string | number> {
  id: ID;
}

export interface DraftCreateRecord {
  draftID: string;
}

export interface DraftUpdateRecord<
  ID extends string | number,
  M extends Record<ID>
> {
  id: ID;

  /**
   * Inform this model that all changes had been saved into the database
   */
  markSaved(): void;

  /**
   * Convert the draft to the model.
   *
   * Return undefined if you want the object to be returned from the server
   */
  toModel(): M | undefined;
}

export interface DraftUpdateJunctionRecord<
  JID extends string | number,
  AID extends string | number,
  BID extends string | number,
  M extends JunctionRecord<JID, AID, BID>
> {
  id: JID;

  /**
   * Inform this model that all changes had been saved into the database
   */
  markSaved(): void;

  /**
   * Convert the draft to the model.
   *
   * Return undefined if you want the object to be returned from the server
   */
  toModel(): M | undefined;
}

/**
 * A simple implementation of DraftCreateRecord.
 */
export class SimpleDraftCreateRecord<
  ID extends string | number,
  M extends Record<ID>
> implements DraftCreateRecord
{
  public draftID: string;
  public record: M;

  constructor(draftID: string, record: M) {
    this.draftID = draftID;
    this.record = record;
  }
}

/**
 * Simple implementation of DraftUpdateRecord, it has no ability to tell if a record has been modified or not
 */
export class SimpleDraftUpdateRecord<
  ID extends string | number,
  M extends Record<ID>
> implements DraftUpdateRecord<ID, M>
{
  public record: M;

  constructor(record: M) {
    this.record = record;
  }

  get id() {
    return this.record.id;
  }

  markSaved(): void {}

  toModel(): M | undefined {
    return this.record;
  }
}
