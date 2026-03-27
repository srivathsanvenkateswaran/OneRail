"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Map, {
    Source, Layer, Popup,
    NavigationControl, ScaleControl
} from 'react-map-gl/maplibre';
import type { MapRef, LayerProps } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import styles from './page.module.css';
import { getCachedData, setCachedData } from '@/lib/clientCache';
import Link from 'next/link';

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// ── Zone names + colors for lookup ──────────────────────────────────────────
export const ZONE_METADATA: Record<string, { color: string; name: string }> = {
    SR:   { color: '#3b82f6', name: 'Southern Railway' },
    SWR:  { color: '#06b6d4', name: 'South Western Railway' },
    SCR:  { color: '#8b5cf6', name: 'South Central Railway' },
    CR:   { color: '#d946ef', name: 'Central Railway' },
    WR:   { color: '#f43f5e', name: 'Western Railway' },
    NR:   { color: '#f59e0b', name: 'Northern Railway' },
    NCR:  { color: '#eab308', name: 'North Central Railway' },
    NER:  { color: '#84cc16', name: 'North Eastern Railway' },
    ER:   { color: '#10b981', name: 'Eastern Railway' },
    ECoR: { color: '#14b8a6', name: 'East Coast Railway' },
    SECR: { color: '#6366f1', name: 'South East Central Railway' },
    SER:  { color: '#ec4899', name: 'South Eastern Railway' },
    NFR:  { color: '#22c55e', name: 'Northeast Frontier Railway' },
    NWR:  { color: '#f97316', name: 'North Western Railway' },
    WCR:  { color: '#0ea5e9', name: 'West Central Railway' },
    ECR:  { color: '#a855f7', name: 'East Central Railway' },
    KR:   { color: '#fb7185', name: 'Konkan Railway' },
};

// Build MapLibre 'match' expression from the palette if still needed for anything
const getZoneColor = (code: string) => ZONE_METADATA[code]?.color || '#94a3b8';

// ── Track line layers — colored by track_type, NOT zone ──────────────────────

// BG Tracks: Single/Unknown=blue, Double=deeper blue, Triple/Multi=gold/orange
const trackTypeColor: any = [
    'case',
    ['==', ['get', 'status'], 'Under Construction'], '#f59e0b',
    ['match', ['get', 'track_type'],
        'Single',    '#3b82f6',   // IR Blue
        'Double',    '#2563eb',   // Deeper Blue
        'Triple',    '#fbbf24',   // Amber/Gold
        'Quadruple', '#f97316',   // Orange
        '#3b82f6'                 // Fallback to IR Blue
    ]
];

const trackTypeWidth: any = [
    'interpolate', ['linear'], ['zoom'],
    4,  ['match', ['get', 'track_type'],
            'Single', 0.7, 'Double', 1.3, 'Triple', 1.8, 'Quadruple', 2.2, 0.7],
    8,  ['match', ['get', 'track_type'],
            'Single', 1.5, 'Double', 2.5, 'Triple', 3.5, 'Quadruple', 4.5, 1.5],
    13, ['match', ['get', 'track_type'],
            'Single', 2.5, 'Double', 4.5, 'Triple', 6.5, 'Quadruple', 8.5, 2.5]
];

const lineLayerBG: LayerProps = {
    id: 'tracks-bg',
    type: 'line',
    source: 'atlas',
    filter: ['all', ['==', 'type', 'track'], ['==', 'gauge', 'BG']],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
        'line-color': trackTypeColor,
        'line-width': trackTypeWidth,
        'line-opacity': ['case', ['==', ['get', 'status'], 'Under Construction'], 0.6, 0.9],
        // Dashed = non-electrified; solid = electrified
        'line-dasharray': [
            'case',
            ['==', ['get', 'status'], 'Under Construction'], ['literal', [4, 3]],
            ['case', ['==', ['get', 'electrified'], true], ['literal', [1, 0]], ['literal', [5, 3]]]
        ]
    }
};

const lineLayerMG: LayerProps = {
    id: 'tracks-mg',
    type: 'line',
    source: 'atlas',
    filter: ['all', ['==', 'type', 'track'], ['==', 'gauge', 'MG']],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
        'line-color': '#10b981',  // Emerald — always distinct from BG
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.4, 12, 2.5],
        'line-opacity': 0.8,
        'line-dasharray': ['case', ['==', ['get', 'electrified'], true], ['literal', [1, 0]], ['literal', [3, 2]]]
    }
};

const lineLayerNG: LayerProps = {
    id: 'tracks-ng',
    type: 'line',
    source: 'atlas',
    filter: ['all', ['==', 'type', 'track'], ['==', 'gauge', 'NG']],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
        'line-color': '#f472b6', // Changed from '#a78bfa'
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1.2, 12, 2.2], // Changed from 2
        'line-opacity': 0.8, // Changed from 0.75
        'line-dasharray': ['case', ['==', ['get', 'electrified'], true], ['literal', [1, 0]], ['literal', [3, 2]]]
    }
};

const tracksClickLayer: LayerProps = {
    id: 'tracks-click-surface',
    type: 'line',
    source: 'atlas',
    filter: ['==', 'type', 'track'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
        'line-width': 20, // Huge hit surface
        'line-color': 'transparent',
    }
};

const stationLayer: LayerProps = {
    id: 'stations',
    type: 'circle',
    source: 'atlas',
    filter: ['==', 'type', 'station'],
    minzoom: 6,
    paint: {
        'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            6, ['case', 
                ['==', ['get', 'is_junction'], true], 3.5, 
                ['==', ['get', 'is_terminus'], true], 3.5,
                1.5
            ],
            9, ['case', 
                ['==', ['get', 'is_junction'], true], 6, 
                ['==', ['get', 'is_terminus'], true], 6,
                2.5
            ],
            13, ['case', 
                ['==', ['get', 'is_junction'], true], 10, 
                ['==', ['get', 'is_terminus'], true], 10,
                4
            ]
        ],
        'circle-color': [
            'case',
            ['==', ['get', 'is_junction'], true], '#f59e0b', // Amber for junctions
            ['==', ['get', 'is_terminus'], true], '#ef4444', // Ruby for terminals
            '#ffffff'                                     // White for stops
        ],
        'circle-stroke-width': [
            'case',
            ['==', ['get', 'is_junction'], true], 2.5,
            ['==', ['get', 'is_terminus'], true], 2.5,
            1
        ],
        'circle-stroke-color': [
            'case',
            ['==', ['get', 'is_junction'], true], '#b45309', // Dark amber stroke
            ['==', ['get', 'is_terminus'], true], '#b91c1c', // Dark ruby stroke
            '#1e293b'                                     // Slate stroke
        ],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 8, 1]
    }
};

const stationLabelLayer: LayerProps = {
    id: 'station-labels',
    type: 'symbol',
    source: 'atlas',
    filter: ['all', 
        ['==', 'type', 'station'],
        ['any', 
            ['>', ['zoom'], 10],
            ['==', ['get', 'is_junction'], true],
            ['==', ['get', 'is_terminus'], true]
        ]
    ],
    minzoom: 8,
    layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 13],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-max-width': 8
    },
    paint: {
        'text-color': '#e2e8f0',
        'text-halo-color': '#0f172a',
        'text-halo-width': 1.5
    }
};

interface HoverInfo {
    lng: number;
    lat: number;
    feature: any;
}

interface LayerVisibility {
    BG: boolean;
    MG: boolean;
    NG: boolean;
    stations: boolean;
    construction: boolean;
}

// ── Sub-components ────────────────────────────────────────────────────────────

export function LayerToggle({ color, label, active, onToggle, isCircle, isDashed }: {
    color: string;
    label: string;
    active: boolean;
    onToggle: () => void;
    isCircle?: boolean;
    isDashed?: boolean;
}) {
    return (
        <button className={`${styles.layerToggle} ${active ? styles.layerActive : styles.layerInactive}`} onClick={onToggle}>
            {isCircle ? (
                <div className={styles.toggleCircle} style={{ background: active ? color : '#374151', borderColor: color }} />
            ) : isDashed ? (
                <div className={styles.toggleDashed} style={{ borderColor: active ? color : '#374151' }} />
            ) : (
                <div className={styles.toggleLine} style={{ background: active ? color : '#374151' }} />
            )}
            <span>{label}</span>
            <span className={styles.toggleCheck}>{active ? '✓' : ''}</span>
        </button>
    );
}

export function TrackTooltip({ props }: { props: any }) {
    const zoneName = props.zone ? (ZONE_METADATA[props.zone]?.name || props.zone) : null;

    return (
        <div className={styles.tooltip}>
            <div className={styles.tooltipTitle}>Railway Section</div>
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Endpoints</span>
                <span className={styles.tooltipVal}>{props.from} ↔ {props.to}</span>
            </div>
            {zoneName && (
                <div className={styles.tooltipRow}>
                    <span className={styles.tooltipKey}>Zone</span>
                    <span className={styles.tooltipVal} title={props.zone}>{zoneName}</span>
                </div>
            )}
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Distance</span>
                <span className={styles.tooltipVal}>{props.distance_km?.toFixed(1) || '—'} km</span>
            </div>
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Track</span>
                <span className={styles.tooltipVal}>{props.track_type || 'Single'} Line</span>
            </div>
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Electrified</span>
                <span className={styles.tooltipVal}>{props.electrified ? '⚡ Yes' : 'No'}</span>
            </div>
        </div>
    );
}

export function StationTooltip({ props }: { props: any }) {
    const zoneName = props.zone ? (ZONE_METADATA[props.zone]?.name || props.zone) : null;

    return (
        <div className={styles.tooltip}>
            <div className={styles.tooltipTitle}>{props.name}</div>
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Code</span>
                <span className={styles.tooltipVal}>{props.code}</span>
            </div>
            {zoneName && (
                <div className={styles.tooltipRow}>
                    <span className={styles.tooltipKey}>Zone</span>
                    <span className={styles.tooltipVal} title={props.zone}>{zoneName}</span>
                </div>
            )}
            {props.is_junction && <div className={styles.tooltipBadge}>📍 Junction</div>}
            <Link href={`/station/${props.code}`} target="_blank" className={styles.tooltipHintWrapper}>
                <div className={styles.tooltipHint}>Click to view full details ↗</div>
            </Link>
        </div>
    );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AtlasPage() {
    const [data, setData] = useState<any>(null);
    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
    const [selectedFeature, setSelectedFeature] = useState<HoverInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<{ tracks: number; stations: number } | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [viewState, setViewState] = useState({ longitude: 78.9629, latitude: 22.5937, zoom: 4.5 });
    const [layers, setLayers] = useState<LayerVisibility>({
        BG: true, MG: true, NG: true, stations: true, construction: true
    });
    const [panelOpen, setPanelOpen] = useState(true);
    const mapRef = useRef<MapRef>(null);

    useEffect(() => {
        const saved = localStorage.getItem('atlasViewState');
        if (saved) {
            try { setViewState(JSON.parse(saved)); } catch (e) {}
        }
        setMapLoaded(true);

        const loadNetwork = async () => {
            setLoading(true);
            try {
                const cacheKey = 'atlas-geojson-v15';
                let json = await getCachedData(cacheKey);

                if (!json) {
                    const res = await fetch('/api/atlas/geojson?type=all&limit=200000');
                    if (!res.ok) throw new Error("Failed to fetch atlas network");
                    json = await res.json();
                    if (json.features) await setCachedData(cacheKey, json);
                }
                setData(json);
                if (json.metadata) setMetadata(json.metadata);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadNetwork();
    }, []);

    const onHover = useCallback((e: any) => {
        if (selectedFeature) return;
        const feature = e.features?.[0];
        if (feature) {
            setHoverInfo({ lng: e.lngLat.lng, lat: e.lngLat.lat, feature: feature });
            e.target.getCanvas().style.cursor = 'pointer';
        } else {
            setHoverInfo(null);
            e.target.getCanvas().style.cursor = '';
        }
    }, [selectedFeature]);

    const onClick = useCallback((event: any) => {
        const { features, lngLat } = event;
        const f = features?.[0];
        if (f) {
            setSelectedFeature({ feature: f, lng: lngLat.lng, lat: lngLat.lat });
            setHoverInfo(null);
        } else {
            setSelectedFeature(null);
        }
    }, []);

    const toggleLayer = (key: keyof LayerVisibility) => {
        setLayers(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const bgFilter: any = layers.construction
        ? ['all', ['==', 'type', 'track'], ['==', 'gauge', 'BG']]
        : ['all', ['==', 'type', 'track'], ['==', 'gauge', 'BG'], ['==', 'status', 'Operational']];

    const mgFilter: any = layers.construction
        ? ['all', ['==', 'type', 'track'], ['==', 'gauge', 'MG']]
        : ['all', ['==', 'type', 'track'], ['==', 'gauge', 'MG'], ['==', 'status', 'Operational']];

    const ngFilter: any = ['all', ['==', 'type', 'track'], ['==', 'gauge', 'NG']];

    return (
        <div className={styles.container}>
            <div className={`${styles.panel} ${panelOpen ? styles.panelOpen : styles.panelClosed}`}>
                <button className={styles.panelToggle} onClick={() => setPanelOpen(v => !v)}>
                    {panelOpen ? '◀' : '▶'}
                </button>
                {panelOpen && (
                    <>
                        <div className={styles.panelHeader}>
                            <div className={styles.panelLogo}>🛤️</div>
                            <div>
                                <h1 className={styles.overlayTitle}>OneRail Atlas</h1>
                                <p className={styles.overlayDesc}>Indian Railways Network Map</p>
                            </div>
                        </div>
                        {loading && <div className={styles.loadingState}><div className={styles.spinner} /><span>Loading...</span></div>}
                        {error && <div className={styles.errorState}>⚠️ {error}</div>}
                        {metadata && (
                            <div className={styles.statsGrid}>
                                <div className={styles.statCard}><div className={styles.statNum}>{metadata.tracks.toLocaleString()}</div><div className={styles.statLabel}>Tracks</div></div>
                                <div className={styles.statCard}><div className={styles.statNum}>{metadata.stations.toLocaleString()}</div><div className={styles.statLabel}>Stations</div></div>
                            </div>
                        )}
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Track Gauge</div>
                            <LayerToggle color="#3b82f6" label="Broad Gauge (BG)" active={layers.BG} onToggle={() => toggleLayer('BG')} />
                            <LayerToggle color="#10b981" label="Metre Gauge (MG)" active={layers.MG} onToggle={() => toggleLayer('MG')} />
                            <LayerToggle color="#a78bfa" label="Narrow Gauge (NG)" active={layers.NG} onToggle={() => toggleLayer('NG')} />
                        </div>
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Overlays</div>
                            <LayerToggle color="#e2e8f0" label="Stations" active={layers.stations} onToggle={() => toggleLayer('stations')} isCircle />
                            <LayerToggle color="#f59e0b" label="Construction" active={layers.construction} onToggle={() => toggleLayer('construction')} isDashed />
                        </div>
                    </>
                )}
            </div>
            <div className={styles.mapWrapper}>
                {mapLoaded && (
                    <Map
                        ref={mapRef}
                        mapLib={maplibregl}
                        initialViewState={viewState}
                        onMove={(evt) => {
                            const state = { longitude: evt.viewState.longitude, latitude: evt.viewState.latitude, zoom: evt.viewState.zoom };
                            setViewState(state);
                            localStorage.setItem('atlasViewState', JSON.stringify(state));
                        }}
                        mapStyle={MAP_STYLE}
                        interactiveLayerIds={['tracks-click-surface', 'stations']}
                        onMouseMove={onHover}
                        onMouseLeave={() => setHoverInfo(null)}
                        onClick={onClick}
                        cursor={hoverInfo ? 'pointer' : 'grab'}
                    >
                        <NavigationControl position="bottom-right" />
                        <ScaleControl position="bottom-left" unit="metric" />
                        {data && (
                            <Source id="atlas" type="geojson" data={data}>
                                {layers.BG && <Layer {...(lineLayerBG as any)} filter={bgFilter} />}
                                {layers.MG && <Layer {...(lineLayerMG as any)} filter={mgFilter} />}
                                {layers.NG && <Layer {...(lineLayerNG as any)} filter={ngFilter} />}
                                <Layer {...(tracksClickLayer as any)} />
                                {layers.stations && <Layer {...(stationLayer as any)} />}
                                {layers.stations && <Layer {...(stationLabelLayer as any)} />}
                            </Source>
                        )}
                        {hoverInfo && hoverInfo.feature.properties.type === 'track' && (
                            <Popup
                                longitude={hoverInfo.lng}
                                latitude={hoverInfo.lat}
                                closeButton={false}
                                closeOnClick={false}
                                maxWidth="280px"
                            >
                                <TrackTooltip props={hoverInfo.feature.properties} />
                            </Popup>
                        )}
                        {(selectedFeature || hoverInfo) && (selectedFeature || hoverInfo)!.feature.properties.type === 'station' && (
                            <Popup
                                longitude={(selectedFeature || hoverInfo)!.lng}
                                latitude={(selectedFeature || hoverInfo)!.lat}
                                closeButton={!!selectedFeature}
                                closeOnClick={false}
                                onClose={() => setSelectedFeature(null)}
                                maxWidth="240px"
                            >
                                <StationTooltip props={(selectedFeature || hoverInfo)!.feature.properties} />
                            </Popup>
                        )}
                    </Map>
                )}
            </div>
        </div>
    );
}
