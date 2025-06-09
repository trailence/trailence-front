export function parseCoordinates(s: string): L.LatLngLiteral | undefined {
  return parseCoordinatesDD(s) ?? parseCoordinatesDMS(s) ?? parseCoordinatesDDM(s);
}

function parseCoordinatesDD(s: string): L.LatLngLiteral | undefined {
  return parseCoordinatesDDVariant1(s) ?? parseCoordinatesDDVariant2(s);
}

const DD1_REGEXP = /^\s*(-?\d{1,2}(?:[.,]\d+)?)(?:\s+|\s*[,\/;]\s*|\s*°\s*[,\/;]?\s*)(-?\d{1,3}(?:[.,]\d+)?)\s*°?\s*$/; // NOSONAR

function parseCoordinatesDDVariant1(s: string): L.LatLngLiteral | undefined {
  const match = DD1_REGEXP.exec(s);
  if (!match || match.length !== 3) return undefined;
  const lat = parseFloat(match[1].replace(',', '.'));
  if (isNaN(lat) || lat < -90 || lat > 90) return undefined;
  const lng = parseFloat(match[2].replace(',', '.'));
  if (isNaN(lng) || lng < -180 || lng > 180) return undefined;
  return {lat, lng};
}

const DD2_REGEXP = /^\s*([NnSs])\s*(\d{1,2}(?:[.,]\d+)?)(?:\s+|\s*[,\/;]\s*|\s*°\s*[,\/;]?\s*)([EeWw])\s*(\d{1,3}(?:[.,]\d+)?)\s*°?\s*$/; // NOSONAR

function parseCoordinatesDDVariant2(s: string): L.LatLngLiteral | undefined {
  const match = DD2_REGEXP.exec(s);
  if (!match || match.length !== 5) return undefined;
  const NS = match[1].toUpperCase();
  let lat = parseFloat(match[2].replace(',', '.'));
  if (isNaN(lat) || lat < 0 || lat > 90) return undefined;
  if (NS === 'S') lat = -lat;
  const EW = match[3].toUpperCase();
  let lng = parseFloat(match[4].replace(',', '.'));
  if (isNaN(lng) || lng < 0 || lng > 180) return undefined;
  if (EW === 'W') lng = -lng;
  return {lat, lng};
}

function parseCoordinatesDMS(s: string): L.LatLngLiteral | undefined {
  return parseCoordinatesDMSPrefix(s) ?? parseCoordinatesDMSSuffix(s);
}

const DMS_REGEXP_PREFIX = /^\s*([NnSs])\s*(\d{1,2})[°\s](\d{1,2})['’\s](\d{1,2}(?:[.]\d+)?)["″”]?(?:\s+|\s*[,\/;]\s*)([EeWw])\s*(\d{1,3})[°\s](\d{1,2})['’\s](\d{1,2}(?:[.]\d+)?)["″”]?\s*$/; // NOSONAR

function parseCoordinatesDMSPrefix(s: string): L.LatLngLiteral | undefined {
  const match = DMS_REGEXP_PREFIX.exec(s);
  if (!match || match.length !== 9) return undefined;
  const NS = match[1].toUpperCase();
  let lat = parseDMS(match[2], match[3], match[4]);
  if (lat === undefined) return undefined;
  if (NS === 'S') lat = -lat;
  if (lat < -90 || lat > 90) return undefined;
  const EW = match[5].toUpperCase();
  let lng = parseDMS(match[6], match[7], match[8]);
  if (lng === undefined) return undefined;
  if (EW === 'W') lng = -lng;
  if (lng < 0 || lng > 180) return undefined;
  return {lat, lng};
}

const DMS_REGEXP_SUFFIX = /^\s*(\d{1,2})[°\s](\d{1,2})['’\s](\d{1,2}(?:[.]\d+)?)["″”]?\s*([NnSs])(?:\s+|\s*[,\/;]\s*)(\d{1,3})[°\s](\d{1,2})['’\s](\d{1,2}(?:[.]\d+)?)["″”]?\s*([EeWw])\s*$/; // NOSONAR

function parseCoordinatesDMSSuffix(s: string): L.LatLngLiteral | undefined {
  const match = DMS_REGEXP_SUFFIX.exec(s);
  if (!match || match.length !== 9) return undefined;
  let lat = parseDMS(match[1], match[2], match[3]);
  if (lat === undefined) return undefined;
  const NS = match[4].toUpperCase();
  if (NS === 'S') lat = -lat;
  if (lat < -90 || lat > 90) return undefined;
  let lng = parseDMS(match[5], match[6], match[7]);
  if (lng === undefined) return undefined;
  const EW = match[8].toUpperCase();
  if (EW === 'W') lng = -lng;
  if (lng < 0 || lng > 180) return undefined;
  return {lat, lng};
}

function parseDMS(degrees: string, minutes: string, seconds: string): number | undefined {
  const d = parseInt(degrees);
  if (isNaN(d) || d < 0) return undefined;
  const m = parseInt(minutes);
  if (isNaN(m) || m < 0 || m >= 60) return undefined;
  const s = parseFloat(seconds.replace(',', '.'));
  if (isNaN(s) || s < 0 || s >= 60) return undefined;
  return d + m/60.0 + s/(60.0*60);
}

export function convertDMSToDD(direction: string, degrees: number, minutes: number, seconds: number): number {
  const dd = degrees + minutes/60.0 + seconds/(60.0*60);
  if (direction === 'S' || direction === 'W') {
      return -dd;
  }
  return dd; // N or E
}

function parseCoordinatesDDM(s: string): L.LatLngLiteral | undefined {
  return parseCoordinatesDDMPrefix(s) ?? parseCoordinatesDDMSuffix(s);
}

const DDM_REGEXP_PREFIX = /^\s*([NnSs])\s*(\d{1,2})[°\s](\d{1,2}(?:[.]\d+)?)(?:\s+|\s*[,\/;]\s*)([EeWw])\s*(\d{1,3})[°\s](\d{1,2}(?:[.]\d+)?)\s*$/; // NOSONAR

function parseCoordinatesDDMPrefix(s: string): L.LatLngLiteral | undefined {
  const match = DDM_REGEXP_PREFIX.exec(s);
  if (!match || match.length !== 7) return undefined;
  const NS = match[1].toUpperCase();
  let lat = parseDDM(match[2], match[3]);
  if (lat === undefined) return undefined;
  if (NS === 'S') lat = -lat;
  if (lat < -90 || lat > 90) return undefined;
  const EW = match[4].toUpperCase();
  let lng = parseDDM(match[5], match[6]);
  if (lng === undefined) return undefined;
  if (EW === 'W') lng = -lng;
  if (lng < 0 || lng > 180) return undefined;
  return {lat, lng};
}

const DDM_REGEXP_SUFFIX = /^\s*(\d{1,2})[°\s](\d{1,2}(?:[.]\d+)?)\s*([NnSs])(?:\s+|\s*[,\/;]\s*)(\d{1,3})[°\s](\d{1,2}(?:[.]\d+)?)\s*([EeWw])\s*$/; // NOSONAR

function parseCoordinatesDDMSuffix(s: string): L.LatLngLiteral | undefined {
  const match = DDM_REGEXP_SUFFIX.exec(s);
  if (!match || match.length !== 7) return undefined;
  let lat = parseDDM(match[1], match[2]);
  if (lat === undefined) return undefined;
  const NS = match[3].toUpperCase();
  if (NS === 'S') lat = -lat;
  if (lat < -90 || lat > 90) return undefined;
  let lng = parseDDM(match[4], match[5]);
  if (lng === undefined) return undefined;
  const EW = match[6].toUpperCase();
  if (EW === 'W') lng = -lng;
  if (lng < 0 || lng > 180) return undefined;
  return {lat, lng};
}

function parseDDM(degrees: string, minutes: string): number | undefined {
  const d = parseInt(degrees);
  if (isNaN(d) || d < 0) return undefined;
  const m = parseFloat(minutes.replace(',', '.'));
  if (isNaN(m) || m < 0 || m >= 60) return undefined;
  return d + m/60.0;
}
