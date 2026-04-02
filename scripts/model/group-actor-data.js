import {
  createActorReferenceArrayField,
  createActorReferenceSchema,
  createStringArrayField,
  createStringField,
  createSummarySchema
} from "./common-fields.js";

const { SchemaField } = foundry.data.fields;

export class GroupActorData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["ZUT.DataModels.Group"];

  static defineSchema() {
    return {
      summary: createSummarySchema(),
      affiliation: new SchemaField({
        faction: createActorReferenceSchema()
      }),
      members: createActorReferenceArrayField(),
      details: new SchemaField({
        faction: createStringField(),
        tags: createStringArrayField(),
        status: createStringField(),
        location: createStringField()
      })
    };
  }
}
