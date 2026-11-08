import { MapLayer } from '@trailence/services/map/layers/map-layer';
import * as L from 'leaflet';

export function createLeafletLayer(layer: MapLayer): L.TileLayer {
  const optional: Partial<L.TileLayerOptions> = {};
  if (layer.bounds) optional.bounds = [[layer.bounds.minlat, layer.bounds.minlng], [layer.bounds.maxlat, layer.bounds.maxlng]];
  if (layer.type === 'raster-overlay') optional.zIndex = 2;
  const options = {
    id: layer.name,
    attribution: layer.attribution,
    minZoom: layer.minZoom,
    maxZoom: layer.maxZoom,
    ...optional,
  };
  const tileLayer = new L.TileLayer('', options);
  (tileLayer as any)._trailenceMapLayerId = layer.name;
  (tileLayer as any)['createTile'] = function(coords: L.Coords, done: L.DoneCallback) {
    const img = document.createElement('IMG') as HTMLImageElement;
    layer.getTileOrFallback(coords.x, coords.y, coords.z)
    .subscribe({
      next: async result => {
        // TODO
        let fromBlob = false;
        let url: string;
        if (typeof result.img.toRaw() === 'string') {
          url = result.img.toRaw() as string;
        } else {
          fromBlob = true;
          url = URL.createObjectURL(await result.img.toBlob());
        }
        img.onload = () => {
          if (fromBlob)
            URL.revokeObjectURL(url);
          done(undefined, img);
        };
        img.onerror = () => {
          done(new Error('Cannot display tile'), img);
        };
        img.src = url;
      },
      error: e => {
        done(e, img);
      },
    });
    return img;
  };
  return tileLayer;
}
