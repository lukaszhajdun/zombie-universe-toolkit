import {
  createActorReferenceArrayField,
  createActorReferenceSchema,
  createIntegerField,
  createStringField
} from "./common-fields.js";

const {
  BooleanField,
  SchemaField
} = foundry.data.fields;

export class VehicleActorData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["ZUT.DataModels.Vehicle"];

  static defineSchema() {
    return {
      owner: new SchemaField({
        actor: createActorReferenceSchema()
      }),
      driver: new SchemaField({
        actor: createActorReferenceSchema()
      }),
      passengers: createActorReferenceArrayField(),
      details: new SchemaField({
        vehicleType: createStringField(),
        seats: createIntegerField({ initial: 4 }),
        state: createStringField()
      }),
      stats: new SchemaField({
        durability: createIntegerField(),
        maneuverability: createIntegerField(),
        damage: createIntegerField(),
        armor: createIntegerField()
      }),
      storage: new SchemaField({
        trunk: new SchemaField({
          enabled: new BooleanField({ required: true, initial: true }),
          capacity: createStringField()
        })
      }),
      summary: new SchemaField({
        description: createStringField(),
        issues: createStringField()
      })
    };
  }
}
