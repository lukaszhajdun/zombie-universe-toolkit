import {
  createActorReferenceArrayField,
  createIntegerField,
  createKeyFigureArrayField,
  createStringArrayField,
  createStringField,
  createSummarySchema
} from "./common-fields.js";

const { SchemaField } = foundry.data.fields;

export class FactionActorData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["ZUT.DataModels.Faction"];

  static defineSchema() {
    return {
      summary: createSummarySchema(),
      identity: new SchemaField({
        size: createStringField(),
        type: createStringField(),
        leadership: createStringField(),
        doctrine: createStringField()
      }),
      resources: createStringArrayField(),
      needs: createStringArrayField(),
      problems: createStringArrayField(),
      shelter: new SchemaField({
        description: createStringField(),
        size: createStringField(),
        defense: createStringField()
      }),
      clock: new SchemaField({
        value: createIntegerField({ min: 0, max: 6, initial: 0 })
      }),
      ending: new SchemaField({
        outcome: createStringField()
      }),
      keyFigures: createKeyFigureArrayField(),
      havens: createActorReferenceArrayField(),
      challenges: createActorReferenceArrayField()
    };
  }
}
