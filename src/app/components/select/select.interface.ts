export interface SelectItem<T> {
  groupKey?: string;
  value: T;
  icon?: string;
  fixedLabel?: string;
  labelI18n?: string;
}

export interface SelectGroup {
  key: string;
  parentKey?: string;
  icon?: string;
  fixedLabel?: string;
  labelI18n?: string;
}
