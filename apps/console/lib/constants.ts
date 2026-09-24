// Fixed demo IDs from db/seed.sql — see docs/API_CONTRACT.md "Demo fixed IDs".
export const DEMO_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000002";

// The demo turf ("Sun Ray Estates A", db/seed.sql) as a rough bounding-box polygon, hand
// copied from the seed's ST_GeomFromText WKT literal:
//   POLYGON((-121.495 38.575, -121.485 38.575, -121.485 38.582, -121.495 38.582, -121.495 38.575))
// The live API doesn't return turf geometry over the /console/live-ops or /console/safety-board
// contract shapes (they carry `turfName` only, no geom field), so this is hardcoded here as a
// stand-in for what a future `GET /turfs/:id` (or an expanded contract) would supply. If real
// geometry becomes available, swap this constant for that response and delete the note.
export const DEMO_TURF_NAME = "Sun Ray Estates A";
export const DEMO_TURF_POLYGON: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: { name: DEMO_TURF_NAME },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-121.495, 38.575],
        [-121.485, 38.575],
        [-121.485, 38.582],
        [-121.495, 38.582],
        [-121.495, 38.575],
      ],
    ],
  },
};

export const DEMO_TURF_CENTER: [number, number] = [-121.49, 38.5785];
