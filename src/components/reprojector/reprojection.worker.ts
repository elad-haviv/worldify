import * as d3 from 'd3-geo';
import * as d3GeoProj from 'd3-geo-projection';

export type WorkerMessage =
  | {
      type: 'set_source';
      sourceData: Uint8ClampedArray;
      sourceWidth: number;
      sourceHeight: number;
    }
  | {
      type: 'render';
      targetWidth: number;
      targetHeight: number;
      projectionConfig: {
        id: string;
        rotation: [number, number, number];
        scale: number;
        translate: [number, number];
      };
      requestId: number;
      highQuality: boolean;
    };

let cachedSource: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} | null = null;

let currentRequestId = 0;

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === 'set_source') {
    cachedSource = {
      data: msg.sourceData,
      width: msg.sourceWidth,
      height: msg.sourceHeight,
    };
    return;
  }

  if (msg.type === 'render') {
    const { targetWidth, targetHeight, projectionConfig, requestId, highQuality } = msg;

    currentRequestId = requestId;

    if (!cachedSource) {
      self.postMessage({ requestId, cancelled: true });
      return;
    }

    const { data: sourceData, width: sourceWidth, height: sourceHeight } = cachedSource;

    let projection: any;
    const { id, rotation, scale, translate } = projectionConfig;

    try {
      switch (id) {
        case 'mercator':
          projection = d3.geoMercator();
          break;
        case 'equirectangular':
          projection = d3.geoEquirectangular();
          break;
        case 'naturalEarth':
          projection = d3.geoNaturalEarth1();
          break;
        case 'robinson':
          projection = (d3GeoProj as any).geoRobinson();
          break;
        case 'mollweide':
          projection = (d3GeoProj as any).geoMollweide();
          break;
        case 'winkel3':
          projection = (d3GeoProj as any).geoWinkel3();
          break;
        case 'fahey':
          projection = (d3GeoProj as any).geoFahey();
          break;
        default:
          projection = d3.geoOrthographic();
          break;
      }

      projection.rotate(rotation).scale(scale).translate(translate);

      const targetData = new Uint8ClampedArray(targetWidth * targetHeight * 4);
      const sw_360 = sourceWidth / 360;
      const sh_180 = sourceHeight / 180;

      for (let y = 0; y < targetHeight; y++) {
        // Cancel quickly if user moved the mouse again
        if (y % 15 === 0 && currentRequestId !== requestId) {
          self.postMessage({ requestId, cancelled: true });
          return;
        }

        const rowOffset = (y * targetWidth) << 2;
        for (let x = 0; x < targetWidth; x++) {
          const coords = projection.invert([x, y]);

          if (coords) {
            const lon = coords[0];
            const lat = coords[1];
            const u = (180 + lon) * sw_360;
            const v = (90 - lat) * sh_180;

            const targetIndex = rowOffset + (x << 2);

            if (highQuality) {
              // Bilinear Interpolation
              const u0 = Math.floor(u);
              const v0 = Math.floor(v);
              const u1 = Math.min(u0 + 1, sourceWidth - 1);
              const v1 = Math.min(v0 + 1, sourceHeight - 1);
              const du = u - u0;
              const dv = v - v0;

              for (let i = 0; i < 4; i++) {
                const i00 = (v0 * sourceWidth + u0) * 4 + i;
                const i10 = (v0 * sourceWidth + u1) * 4 + i;
                const i01 = (v1 * sourceWidth + u0) * 4 + i;
                const i11 = (v1 * sourceWidth + u1) * 4 + i;

                const val =
                  sourceData[i00] * (1 - du) * (1 - dv) +
                  sourceData[i10] * du * (1 - dv) +
                  sourceData[i01] * (1 - du) * dv +
                  sourceData[i11] * du * dv;
                targetData[targetIndex + i] = val;
              }
            } else {
              // Fast Nearest Neighbor
              const su = u | 0;
              const sv = v | 0;
              if (su >= 0 && su < sourceWidth && sv >= 0 && sv < sourceHeight) {
                const sourceIndex = (sv * sourceWidth + su) << 2;
                targetData[targetIndex] = sourceData[sourceIndex];
                targetData[targetIndex + 1] = sourceData[sourceIndex + 1];
                targetData[targetIndex + 2] = sourceData[sourceIndex + 2];
                targetData[targetIndex + 3] = sourceData[sourceIndex + 3];
              }
            }
          }
        }
      }

      if (currentRequestId === requestId) {
        self.postMessage(
          { targetData, requestId, highQuality, targetWidth, targetHeight },
          [targetData.buffer] as any
        );
      } else {
        self.postMessage({ requestId, cancelled: true });
      }
    } catch (err) {
      self.postMessage({ requestId, error: String(err) });
    }
  }
};
