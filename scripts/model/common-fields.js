const fields = foundry.data.fields;

const {
  ArrayField,
  NumberField,
  SchemaField,
  StringField
} = fields;

export function createStringField(options = {}) {
  return new StringField({
    required: false,
    blank: true,
    initial: "",
    ...options
  });
}

export function createIntegerField(options = {}) {
  return new NumberField({
    required: true,
    integer: true,
    min: 0,
    initial: 0,
    ...options
  });
}

export function createStringArrayField(options = {}) {
  return new ArrayField(
    createStringField(),
    {
      required: true,
      initial: [],
      ...options
    }
  );
}

export function createSummarySchema() {
  return new SchemaField({
    description: createStringField(),
    notes: createStringField()
  });
}

export function createActorReferenceSchema() {
  return new SchemaField({
    uuid: createStringField(),
    id: createStringField(),
    name: createStringField(),
    img: createStringField(),
    type: createStringField()
  });
}

export function createActorReferenceArrayField(options = {}) {
  return new ArrayField(
    createActorReferenceSchema(),
    {
      required: true,
      initial: [],
      ...options
    }
  );
}

export function createKeyFigureEntrySchema() {
  return new SchemaField({
    actor: createActorReferenceSchema(),
    role: createStringField()
  });
}

export function createKeyFigureArrayField(options = {}) {
  return new ArrayField(
    createKeyFigureEntrySchema(),
    {
      required: true,
      initial: [],
      ...options
    }
  );
}
