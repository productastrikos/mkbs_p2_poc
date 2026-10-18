import React from 'react';
import { TileLayer } from 'react-leaflet';

/* OpenStreetMap standard tiles. In dark mode the tile layer is inverted with
   a CSS filter (.tiles-dark in components.css) so it sits on the navy UI. */
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function BaseTiles({ theme }) {
  return (
    <TileLayer
      key={theme}
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution={OSM_ATTRIBUTION}
      maxZoom={19}
      className={theme === 'dark' ? 'tiles-dark' : 'tiles-light'}
    />
  );
}
