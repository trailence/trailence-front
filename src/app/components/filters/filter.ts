export interface FilterNumeric {
  from?: number;
  to?: number;
}

export interface FilterEnum<T> {
  selected?: T[]
}

export interface FilterTags {
  tagsUuids: string[];
  exclude: boolean;

  onlyWithoutAnyTag: boolean;
  onlyWithAnyTag: boolean;
}
