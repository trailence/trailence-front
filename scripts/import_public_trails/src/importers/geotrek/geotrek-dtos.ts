export type GeoTrekTranslations = {[key:string]: string};

export interface GeoTrekResponse {
  next: string | null | undefined;
  results: GeoTrekDto[] | undefined;
  count: number | undefined;
}

export interface GeoTrekDto {
  id: number;
  access: GeoTrekTranslations;
  advice: GeoTrekTranslations;
  advised_parking: GeoTrekTranslations;
  ambiance: GeoTrekTranslations;
  arrival: GeoTrekTranslations;
  ascent: number;
  attachments: GeoTrekAttachmentDto[];
  create_datetime: string;
  departure: GeoTrekTranslations;
  departure_city: number;
  descent: number;
  description: GeoTrekTranslations;
  description_teaser: GeoTrekTranslations;
  difficulty: number;
  duration: number;
  geometry: GeoTrekGeometry;
  gpx: string;
  max_elevation: number;
  min_elevation: number;
  name: GeoTrekTranslations;
  points_reference: GeoTrekGeometry;
  practice: number;
  published: {[lang: string]: boolean};
  update_datetime: string;
  uuid: string;
}

export interface GeoTrekAttachmentDto {
  type: string;
  license: string | null;
  legend: string; // may be empty
  title: string;
  url: string;
  uuid: string;
}

export interface GeoTrekGeometry {
  type: string;
  coordinates: number[][];
}
