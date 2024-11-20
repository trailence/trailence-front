export interface FilterNumeric {
  from?: number;
  to?: number;
}

export interface FilterEnum<T> {
  selected?: T[]
}

export interface FilterTags {
  tagsUuids: string[];
  type: 'onlyWithAnyTag' | 'onlyWithoutAnyTag' | 'include_and' | 'include_or' | 'exclude';
}

export interface NumericFilterConfig {
  min: number;
  max: number;
  step: number;
  formatter: (value: number) => string;
}
