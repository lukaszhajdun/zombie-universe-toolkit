import {
  createActorReferenceArrayField,
  createActorReferenceSchema,
  createStringArrayField,
  createStringField,
  createSummarySchema
} from "./common-fields.js";

const { SchemaField } = foundry.data.fields;
const { BooleanField } = foundry.data.fields;

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
        skillSourceEnabled: new BooleanField({ required: true, initial: false }),
        skillSourceTarget: createStringField({ initial: "group" }),
        tags: createStringArrayField(),
        status: createStringField(),
        location: createStringField()
      })
    };
  }
}
