/* =========================================================================
   Trondheim Map Viewer (Leaflet + shp.js + rasters)
   ========================================================================= */

const INITIAL_VIEW = {
  center: [63.4305, 10.3951], // Trondheim
  zoom: 12,
};

// --- Configure your layers here ------------------------------------------
const LAYER_CONFIG = [
  // --- Your existing shapefiles ---
  {
    file: "data/Urban Areas.zip",
    name: "Trondheim's Urban Area",
    color: "rgba(0, 0, 0, 0.97)",
    weight: 1,
    fill: true,
    fillOpacity: 0.01,
    visible: true,   // shown at startup
  },
  {
    file: "data/Districts.zip",
    name: "Trondheim's Districts",
    color: "#0ea5e9",
    weight: 1,
    fill: true,
    fillOpacity: 0.1,
    visible: false,  // off at startup
    labelField: "Dist_name",
    labelPermanent: false,
    pointAsCircles: true,
  },
  {
    file: "data/City Centre.zip",
    name: "Trondheim's City Centre",
    color: "rgba(233, 14, 14, 1)",
    weight: 1,
    fill: true,
    fillOpacity: 0.2,
    visible: false,
    labelField: "Dist_name",
    labelPermanent: false,
    pointAsCircles: true,
  },

  /* --- Raster examples (uncomment the ones you need) ------------------ */

  // 1) Local GeoTIFF (works with Cloud-Optimized GeoTIFFs too)
  //{
  //   type: "geotiff",
  //   file: "data/geotiffs/LLraw.tif",
  //   name: "DTM (GeoTIFF)",
  //   opacity: 0.6,         // 0..1
  //   colormap: "grayscale", // "grayscale" | "fire"
  //   visible: false,
  //},

  // 2) Static image overlay with known bounds (PNG/JPG)
  // {
  //   type: "image",
  //   file: "data/overlay.png",
  //   name: "Overlay PNG",
  //   bounds: [[63.35, 10.25], [63.50, 10.55]], // [S,W], [N,E]
  //   opacity: 0.5,
  //   visible: false
  // },

  // 3) XYZ raster tiles
  // {
  //   type: "xyz",
  //   url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  //   name: "OpenTopo (XYZ)",
  //   maxZoom: 17,
  //   opacity: 0.7,
  //   visible: false
  // },

  // 4) WMS
  // {
  //   type: "wms",
  //   url: "https://ahocevar.com/geoserver/wms",
  //   name: "WMS: Topp States",
  //   layers: "topp:states",
  //   format: "image/png",
  //   transparent: true,
  //   opacity: 0.6,
  //   visible: false
  // }
];
// --------------------------------------------------------------------------

/* Base maps with road names (OSM) and a light alternative (Carto) */
const baseLayers = {
  "OpenStreetMap": L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  ),
  "Esri World Street Map": L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri — Sources: Esri, HERE, Garmin, OpenStreetMap, etc.'
    }
  ),
  "Carto Light": L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 20,
      attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>, © OSM'
    }
  )
};

// Create map
const map = L.map("map", {
  center: INITIAL_VIEW.center,
  zoom: INITIAL_VIEW.zoom,
  layers: [baseLayers["OpenStreetMap"]],
});

// Scale bar
L.control.scale({ metric: true, imperial: false }).addTo(map);

// Layer groups registry for control + global bounds
const overlays = {};
const globalBounds = L.latLngBounds();

// Utility: pretty print properties into a popup table
function propsTable(props) {
  const rows = Object.entries(props || {})
    .map(([k, v]) => `<tr><th style="text-align:left; padding-right:6px;">${k}</th><td>${v}</td></tr>`)
    .join("");
  return `<table>${rows}</table>`;
}

/* ---------------------- Loaders --------------------------------------- */

// Shapefile ZIP -> GeoJSON (returns a Leaflet layer)
async function loadShapefileLayer(cfg) {
  const fileURL = encodeURI(cfg.file); // handle spaces in filenames
  const geojson = await shp(fileURL);  // reads zip -> GeoJSON (FeatureCollection)

  const onEachFeature = (feature, layer) => {
    if (feature && feature.properties) {
      layer.bindPopup(propsTable(feature.properties));
    }
    const labelField = cfg.labelField;
    if (labelField && feature && feature.properties && feature.properties[labelField] != null) {
      const text = String(feature.properties[labelField]);
      layer.bindTooltip(text, {
        permanent: !!cfg.labelPermanent,
        direction: "top",
        opacity: 0.9,
        sticky: !cfg.labelPermanent
      });
    }
  };

  const style = () => ({
    color: cfg.color || "#0077b6",
    weight: cfg.weight != null ? cfg.weight : 2,
    fill: !!cfg.fill,
    fillOpacity: cfg.fillOpacity != null ? cfg.fillOpacity : 0.2
  });

  const pointToLayer = (feature, latlng) => {
    if (cfg.pointAsCircles) {
      return L.circleMarker(latlng, {
        radius: cfg.pointRadius != null ? cfg.pointRadius : 6,
        color: cfg.color || "#0077b6",
        weight: cfg.weight != null ? cfg.weight : 2,
        fill: true,
        fillOpacity: cfg.fillOpacity != null ? cfg.fillOpacity : 0.8
      });
    }
    return L.marker(latlng);
  };

  return L.geoJSON(geojson, { onEachFeature, style, pointToLayer });
}

// GeoTIFF / COG
async function loadGeoTiffLayer(cfg) {
  const res = await fetch(encodeURI(cfg.file));
  if (!res.ok) throw new Error(`Failed to fetch ${cfg.file}: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();

  const georaster = await parseGeoraster(arrayBuffer);
  const min = georaster.mins?.[0] ?? georaster.minimum ?? 0;
  const max = georaster.maxs?.[0] ?? georaster.maximum ?? 1;
  const span = max - min || 1;

  const pixelValuesToColorFn = (values) => {
    const v = values[0];
    if (v == null || isNaN(v)) return null;
    const t = Math.min(1, Math.max(0, (v - min) / span));
    if (cfg.colormap === "fire") {
      // black->red->yellow->white
      const r = Math.floor(255 * Math.min(1, t * 2));
      const g = Math.floor(255 * Math.max(0, Math.min(1, (t - 0.5) * 2)));
      const b = Math.floor(255 * Math.max(0, (t - 0.85) * 6));
      return `rgba(${r},${g},${b},1)`;
    }
    // grayscale default
    const g = Math.floor(255 * t);
    return `rgba(${g},${g},${g},1)`;
  };

  const layer = new GeoRasterLayer({
    georaster,
    opacity: cfg.opacity ?? 0.6,
    pixelValuesToColorFn,
    resolution: 256 // increase for faster redraw, decrease for sharper
  });

  return layer;
}

// Static image overlay (PNG/JPG) with bounds
async function loadImageOverlayLayer(cfg) {
  if (!cfg.bounds) throw new Error("Image overlay requires 'bounds': [[S,W],[N,E]]");
  return L.imageOverlay(encodeURI(cfg.file), cfg.bounds, {
    opacity: cfg.opacity ?? 0.6,
    interactive: false
  });
}

// XYZ tiles
async function loadXYZLayer(cfg) {
  return L.tileLayer(cfg.url, {
    maxZoom: cfg.maxZoom ?? 20,
    opacity: cfg.opacity ?? 0.8,
    attribution: cfg.attribution || ""
  });
}

// WMS
async function loadWMSLayer(cfg) {
  return L.tileLayer.wms(cfg.url, {
    layers: cfg.layers,
    format: cfg.format || "image/png",
    transparent: cfg.transparent ?? true,
    opacity: cfg.opacity ?? 0.6,
    attribution: cfg.attribution || ""
  });
}

/* ---------------------- Dispatcher ------------------------------------ */
async function loadLayer(cfg) {
  const type = (cfg.type || inferTypeFromFile(cfg.file)).toLowerCase();
  if (type === "geotiff") return loadGeoTiffLayer(cfg);
  if (type === "image")   return loadImageOverlayLayer(cfg);
  if (type === "xyz")     return loadXYZLayer(cfg);
  if (type === "wms")     return loadWMSLayer(cfg);
  // default: shapefile
  return loadShapefileLayer(cfg);
}

function inferTypeFromFile(file = "") {
  const f = (file || "").toLowerCase();
  if (f.endsWith(".tif") || f.endsWith(".tiff")) return "geotiff";
  if (f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image";
  if (f.endsWith(".zip")) return "shapefile";
  return "shapefile";
}

/* ---------------------- Legend control -------------------------------- */
const LegendControl = L.Control.extend({
  options: { position: "bottomright" },
  onAdd: function () {
    this._div = L.DomUtil.create("div", "leaflet-control legend");
    this._div.innerHTML = "<strong>Legend</strong><div id='legend-rows'></div>";
    return this._div;
  }
});
const legend = new LegendControl();
legend.addTo(map);

function addLegendRow(label, color) {
  const container = document.getElementById("legend-rows");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `<span class="swatch" style="background:${color}"></span> ${label}`;
  container.appendChild(row);
}

/* ---------------------- Init (respect visible flag) ------------------- */
(async function initLayers() {
  for (const cfg of LAYER_CONFIG) {
    try {
      const layer = await loadLayer(cfg);

      overlays[cfg.name] = layer;

      if (cfg.visible !== false) {
        layer.addTo(map);

        // Only fit to layers that can report bounds
        try {
          const b = layer.getBounds?.();
          if (b && b.isValid()) globalBounds.extend(b);
        } catch (_) {}
      }

      addLegendRow(cfg.name, cfg.color || "#0077b6");

    } catch (err) {
      console.error(`Failed to load ${cfg.file || cfg.name}`, err);
      alert(`Could not load layer: ${cfg.name}\n${err.message}`);
    }
  }

  if (globalBounds.isValid()) {
    map.fitBounds(globalBounds.pad(0.08));
  }

  L.control.layers(baseLayers, overlays, { collapsed: false }).addTo(map);
})();

// About panel UI
const aboutBtn = document.getElementById("aboutBtn");
const aboutPanel = document.getElementById("aboutPanel");
const closeAbout = document.getElementById("closeAbout");
aboutBtn?.addEventListener("click", () => (aboutPanel.hidden = !aboutPanel.hidden));
closeAbout?.addEventListener("click", () => (aboutPanel.hidden = true));
