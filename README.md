## AisStream

Lightweight AIS-to-GeoJSON streaming API that fetches Automatic Identification System (AIS) data from NOAA, caches it locally, and serves filtered GeoJSON FeatureCollections.

## Overview

AisStream provides a REST API to query historical AIS vessel tracking data. It streams data from NOAA's AIS Data Handler, filters by time range and bounding box, and returns GeoJSON features representing vessel positions.

Key features:
- **Streaming**: Efficiently streams large datasets without loading everything into memory
- **Caching**: Downloads and caches NOAA ZIP files locally for faster subsequent queries
- **Filtering**: Filters data by date/time range and geographic bounding box
- **GeoJSON Output**: Returns standard GeoJSON FeatureCollection with vessel properties
- **Compression**: Gzipped responses for reduced bandwidth

## Installation

### Prerequisites
- Node.js 18+
- Yarn or npm

### Local Development
```bash
git clone <repository-url>
cd aisstream
npm install
npm run dev
```

The server will start on `http://localhost:8080`.

### Docker
```bash
docker build -t aisstream .
docker run --rm -p 8080:8080 -v /tmp/aiscache:/tmp/aiscache aisstream
```

Mount `/tmp/aiscache` to persist cache between container runs.

## API Documentation

### Endpoint: `GET /v2/nsjson`

Streams AIS data as NDJSON GeoJSON Features.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start` | string | Yes | Start date in YYYY-MM-DD format (e.g., `2023-01-01`) |
| `bbox` | string | Yes | Bounding box as `minLng,minLat,maxLng,maxLat` (e.g., `-180,-90,180,90`) |
| `sample` | number | No | Sampling rate (default: 1, meaning every point; 2 means every other point) |
| `precision` | number | No | Coordinate precision (default: 6 decimal places) |

#### Response

Returns a gzipped NDJSON stream of GeoJSON Features:

```json
{"type":"Feature","geometry":{"type":"Point","coordinates":[-90.17964,38.65165]},"properties":{"MMSI":"368926035","BaseDateTime":"2023-01-01T00:00:05","LAT":"38.65165","LON":"-90.17964","SOG":"0.1","COG":"360.0","Heading":"511.0","VesselName":"KIMMSWICK","IMO":"","CallSign":"AENA","VesselType":"33","Status":"15","Length":"","Width":"","Draft":"","Cargo":"33","TransceiverClass":"A"}}
{"type":"Feature","geometry":{"type":"Point","coordinates":[-90.17964,38.65165]},"properties":{...}}
...
```

#### Curl Examples

**Basic query for all vessels on January 1, 2023:**
```bash
curl -s -H "Accept-Encoding: gzip" \
  "http://localhost:8080/v2/nsjson?start=2023-01-01&bbox=-180,-90,180,90" \
  | gunzip | head -c 10000
```

**Limited results with sampling:**
```bash
curl -s -H "Accept-Encoding: gzip" \
  "http://localhost:8080/v2/nsjson?start=2023-01-01&bbox=-76.4,36.7,-75.9,37.1&sample=10" \
  | gunzip | wc -l
```

**Save to file:**
```bash
curl -s -H "Accept-Encoding: gzip" \
  "http://localhost:8080/v2/nsjson?start=2023-01-01&bbox=-180,-90,180,90" \
  --output ais_data.ndjson.gz
```

### Endpoint: `GET /v1/ais`

Streams AIS data as a GeoJSON FeatureCollection.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start` | string | Yes | Start date/time in ISO 8601 format (e.g., `2023-01-01T00:00:00Z`) |
| `end` | string | Yes | End date/time in ISO 8601 format (e.g., `2023-01-01T23:59:59Z`) |
| `bbox` | string | Yes | Bounding box as `minLng,minLat,maxLng,maxLat` (e.g., `-180,-90,180,90`) |
| `head` | number | No | Limit number of features returned (default: unlimited) |

#### Response

Returns a gzipped GeoJSON FeatureCollection:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-90.17964, 38.65165]
      },
      "properties": {
        "MMSI": "368926035",
        "BaseDateTime": "2023-01-01T00:00:05",
        "LAT": "38.65165",
        "LON": "-90.17964",
        "SOG": "0.1",
        "COG": "360.0",
        "Heading": "511.0",
        "VesselName": "KIMMSWICK",
        "IMO": "",
        "CallSign": "AENA",
        "VesselType": "33",
        "Status": "15",
        "Length": "",
        "Width": "",
        "Draft": "",
        "Cargo": "33",
        "TransceiverClass": "A"
      }
    }
  ]
}
```

#### Curl Examples

**Basic query for all vessels on January 1, 2023:**
```bash
curl -s -H "Accept-Encoding: gzip" \
  "http://localhost:8080/v1/ais?start=2023-01-01T00:00:00Z&end=2023-01-01T23:59:59Z&bbox=-180,-90,180,90" \
  | gunzip | head -c 10000
```

**Limited results with head parameter:**
```bash
curl -s -H "Accept-Encoding: gzip" \
  "http://localhost:8080/v1/ais?start=2023-01-01T00:00:00Z&end=2023-01-01T23:59:59Z&bbox=-76.4,36.7,-75.9,37.1&head=100" \
  | gunzip | jq '.features | length'
```

**Save to file:**
```bash
curl -s -H "Accept-Encoding: gzip" \
  "http://localhost:8080/v1/ais?start=2023-01-01T00:00:00Z&end=2023-01-01T23:59:59Z&bbox=-180,-90,180,90" \
  --output ais_data.json.gz
```

### Endpoint: `GET /v1/s2`

Returns Sentinel-2 satellite imagery metadata as a JSON object.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start` | string | Yes | Start date in ISO 8601 format (e.g., `2023-01-01T00:00:00Z`) |
| `end` | string | Yes | End date in ISO 8601 format (e.g., `2023-01-01T23:59:59Z`) |
| `bbox` | string | Yes | Bounding box as `minLng,minLat,maxLng,maxLat` (e.g., `-180,-90,180,90`) |
| `productType` | string | No | Product type: `S2MSI2A` (Level-2A), `S2MSI1C` (Level-1C), or `ANY` (default: `ANY`) |
| `cloudLt` | number | No | Maximum cloud cover percentage (e.g., `20` for ≤20% cloud cover) |
| `limit` | number | No | Maximum number of scenes to return (default: 6) |
| `frames` | number | No | Number of scenes to include in response (default: same as limit) |
| `save` | boolean | No | Save quicklook images locally (default: false) |

#### Response

Returns a JSON object with Sentinel-2 scene metadata:

```json
{
  "count": 2,
  "bbox": [-180, -90, 180, 90],
  "start": "2023-01-01T00:00:00Z",
  "end": "2023-01-01T23:59:59Z",
  "productType": "ANY",
  "scenes": [
    {
      "type": "scene",
      "id": "S2B_MSIL2A_20230101T000000_N0214_R000_T01ABC_20230101T000000",
      "datetime": "2023-01-01T00:00:00Z",
      "cloud": 5.2,
      "productType": "S2MSI2A",
      "footprint": { "type": "Polygon", "coordinates": [[[ ... ]]] },
      "mgrs": { "zone": "01", "latBand": "A", "grid": "BC" },
      "bands": {
        "B02": "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/tiles/01/A/BC/2023/1/1/B02.tif",
        "B03": "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/tiles/01/A/BC/2023/1/1/B03.tif",
        "B04": "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/tiles/01/A/BC/2023/1/1/B04.tif",
        "SCL": "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/tiles/01/A/BC/2023/1/1/SCL.tif"
      },
      "tileTemplate": "http://localhost:8000/cog/tiles/{z}/{x}/{y}.png?expression=rgb(B04,B03,B02)&rescale=0,3000",
      "quicklook": "/v1/s2/quicklook?href=https%3A//example.com/quicklook.jpg"
    }
  ]
}
```

#### Curl Examples

**Basic query for Sentinel-2 scenes on January 1, 2023:**
```bash
curl "http://localhost:8080/v1/s2?start=2023-01-01T00:00:00Z&end=2023-01-01T23:59:59Z&bbox=-180,-90,180,90"
```

**Limited results with cloud cover filter:**
```bash
curl "http://localhost:8080/v1/s2?start=2023-01-01T00:00:00Z&end=2023-01-01T23:59:59Z&bbox=-76.4,36.7,-75.9,37.1&cloudLt=20&limit=5"
```

**Save quicklooks locally:**
```bash
curl "http://localhost:8080/v1/s2?start=2023-01-01T00:00:00Z&end=2023-01-01T23:59:59Z&bbox=-180,-90,180,90&save=true"
```

### Endpoint: `GET /v1/s2.ndjson`

Streams Sentinel-2 satellite imagery metadata as NDJSON.

#### Query Parameters

Same as `/v1/s2`, but `limit` defaults to 8.

#### Response

Returns a stream of NDJSON lines, each a JSON object representing a scene, followed by a summary:

```json
{"type":"scene","id":"S2B_MSIL2A_20230101T000000_N0214_R000_T01ABC_20230101T000000","datetime":"2023-01-01T00:00:00Z","cloud":5.2,"productType":"S2MSI2A","footprint":{...},"mgrs":{...},"bands":{...},"tileTemplate":"...","quicklook":"..."}
{"type":"scene",...}
{"type":"summary","count":2,"bbox":[-180,-90,180,90],"start":"2023-01-01T00:00:00Z","end":"2023-01-01T23:59:59Z","productType":"ANY"}
```

#### Curl Examples

**Stream scenes to console:**
```bash
curl "http://localhost:8080/v1/s2.ndjson?start=2023-01-01T00:00:00Z&end=2023-01-01T23:59:59Z&bbox=-180,-90,180,90"
```

**Save to file:**
```bash
curl "http://localhost:8080/v1/s2.ndjson?start=2023-01-01T00:00:00Z&end=2023-01-01T23:59:59Z&bbox=-76.4,36.7,-75.9,37.1&cloudLt=20" --output s2_data.ndjson
```

### Endpoint: `GET /v1/s2/quicklook`

Proxies quicklook images for Sentinel-2 scenes.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `href` | string | Yes | URL of the quicklook image to proxy (e.g., from a scene's `quicklook` field) |

#### Response

Returns the image file (e.g., JPEG) or a text error message.

#### Curl Examples

**Fetch a quicklook image:**
```bash
curl "http://localhost:8080/v1/s2/quicklook?href=https%3A//example.com/quicklook.jpg" --output quicklook.jpg
```

## React UI Integration

Here's a simple React component to fetch and display AIS data on a map:

```jsx
import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function AISMap() {
  const [vessels, setVessels] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAISData = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        'http://localhost:8080/v1/ais?' +
        new URLSearchParams({
          start: '2023-01-01T00:00:00Z',
          end: '2023-01-01T23:59:59Z',
          bbox: '-180,-90,180,90',
          head: '1000'
        }),
        {
          headers: {
            'Accept-Encoding': 'gzip'
          }
        }
      );

      const data = await response.json();
      setVessels(data.features || []);
    } catch (error) {
      console.error('Error fetching AIS data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAISData();
  }, []);

  return (
    <div style={{ height: '500px' }}>
      <button onClick={fetchAISData} disabled={loading}>
        {loading ? 'Loading...' : 'Refresh Data'}
      </button>
      <MapContainer center={[0, 0]} zoom={2} style={{ height: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {vessels.map((vessel, index) => (
          <Marker
            key={index} 
            position={[vessel.geometry.coordinates[1], vessel.geometry.coordinates[0]]}
          >
            <Popup>
              <div>
                <h3>{vessel.properties.VesselName || 'Unknown'}</h3>
                <p>MMSI: {vessel.properties.MMSI}</p>
                <p>Speed: {vessel.properties.SOG} knots</p>
                <p>Course: {vessel.properties.COG}°</p>
                <p>Time: {vessel.properties.BaseDateTime}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default AISMap;
```

### Setup React App

1. Create a new React app:
```bash
npx create-react-app ais-map
cd ais-map
npm install leaflet react-leaflet
```

2. Replace `src/App.js` with the component above.

3. Start the React app:
```bash
npm start
```

4. Ensure the AisStream API is running on `http://localhost:8080`.

## Project Structure

```
aisstream/
├── src/
│   ├── index.ts          # Express app setup
│   ├── routes/
│   │   └── ais.ts        # AIS API endpoint
│   └── lib/
│       ├── cache.ts      # File caching utilities
│       ├── fetchDay.ts   # Data fetching and streaming
│       ├── geometry.ts   # Geographic utilities
│       └── urls.ts       # URL generation for NOAA data
├── test/                 # Jest tests
├── Dockerfile            # Docker configuration
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── jest.config.mjs       # Jest configuration
├── eslint.config.mjs     # ESLint configuration
└── README.md             # This file
```

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode

### Testing

Run the full test suite:
```bash
npm test
```

Tests include:
- API endpoint validation
- Data filtering logic
- Caching functionality
- Error handling

### Linting

```bash
npm run lint
```

### Environment Variables

- `PORT` - Server port (default: 8080)
- `MAX_CACHE_BYTES` - Maximum cache size in bytes (default: 50GB)

## Caching

AisStream caches downloaded NOAA ZIP files in `/tmp/aiscache` to improve performance for repeated queries. The cache:

- Stores raw ZIP files from NOAA
- Persists between server restarts (when using Docker volume mount)
- Has a configurable size limit
- Automatically reuses cached data for faster responses

Cache statistics can be monitored via the `getCacheStats()` function in `src/lib/cache.ts`.

## Data Source

AIS data is sourced from NOAA's Coastal Management Solution Program:
- URL pattern: `https://coast.noaa.gov/htdata/CMSP/AISDataHandler/{year}/AIS_{year}_{month}_{day}.zip`
- Data format: CSV files within ZIP archives
- Update frequency: Daily files

## License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.

AIS data courtesy of NOAA’s Coastal Management Solution Program. NOAA data are public domain under U.S. law.

