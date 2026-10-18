export interface SelectItem<T> {
  groupKey?: string;
  value: T;
  icon?: string;
  fixedLabel?: string;
  labelI18n?: string;
  selectFixedLabel?: string;
  selectI18nLabel?: string;
}

export interface SelectGroup {
  key: string;
  parentKey?: string;
  icon?: string;
  fixedLabel?: string;
  labelI18n?: string;
}
