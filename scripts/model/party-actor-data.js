import {
  createActorReferenceArrayField,
  createStringArrayField,
  createStringField
} from "./common-fields.js";

const { SchemaField } = foundry.data.fields;
const { BooleanField } = foundry.data.fields;

export class PartyActorData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["ZUT.DataModels.Party"];

  static defineSchema() {
    return {
      members: createActorReferenceArrayField(),
      details: new SchemaField({
        mode: createStringField({ initial: "simple" }),
        skillSourceEnabled: new BooleanField({ required: true, initial: false }),
        skillSourceTarget: createStringField({ initial: "party" }),
        location: createStringField(),
        tags: createStringArrayField()
      })
    };
  }
}
