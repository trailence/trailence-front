export function posTo2DegTile(lat: number, lon: number): number {
  const x = Math.floor((lon + 180) / 2);
  const y = Math.floor((lat + 90) / 2);
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('Invalid coordinates: ' + lat + ', ' + lon);
  return y * 180 + x;
}

export function posTo1DegTile(lat: number, lon: number): number {
  const x = Math.floor(lon + 180);
  const y = Math.floor(lat + 90);
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('Invalid coordinates: ' + lat + ', ' + lon);
  return y * 360 + x;
}

export function posTo05DegTile(lat: number, lon: number): number {
  const x = Math.floor((lon + 180) * 2);
  const y = Math.floor((lat + 90) * 2);
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('Invalid coordinates: ' + lat + ', ' + lon);
  return y * 360 * 2 + x;
}

export function posTo025DegTile(lat: number, lon: number): number {
  const x = Math.floor((lon + 180) * 4);
  const y = Math.floor((lat + 90) * 4);
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('Invalid coordinates: ' + lat + ', ' + lon);
  return y * 360 * 4 + x;
}

export function posTo0125DegTile(lat: number, lon: number): number {
  const x = Math.floor((lon + 180) * 8);
  const y = Math.floor((lat + 90) * 8);
  if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('Invalid coordinates: ' + lat + ', ' + lon);
  return y * 360 * 8 + x;
}
