"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Map, {
    Source, Layer, Popup,
    NavigationControl, ScaleControl,
    MapRef
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import styles from './page.module.css';
import type { LayerProps } from 'react-map-gl/maplibre';
import { getCachedData, setCachedData } from '@/lib/clientCache';
import Link from 'next/link';

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// ── Layer definitions ────────────────────────────────────────────────────────

const lineLayerBG: LayerProps = {
    id: 'tracks-bg',
    type: 'line',
    source: 'atlas',
    filter: ['all', ['==', 'type', 'track'], ['==', 'gauge', 'BG']],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
        'line-color': [
            'case',
            ['==', ['get', 'status'], 'Under Construction'], '#f59e0b',
            // Default coloring fallback to Zone mapping, or fallback to Electrified distinction
            ['match',
                ['get', 'zone'],
                'SR', '#3b82f6',    // Blue
                'SWR', '#06b6d4',   // Cyan
                'SCR', '#8b5cf6',   // Purple
                'CR', '#d946ef',    // Fuchsia
                'WR', '#f43f5e',    // Rose
                'NR', '#f59e0b',    // Amber
                'NCR', '#eab308',   // Yellow
                'NER', '#84cc16',   // Lime
                'ER', '#10b981',    // Emerald
                'ECoR', '#14b8a6',  // Teal
                'SECR', '#6366f1',  // Indigo
                'SER', '#ec4899',   // Pink
                'NFR', '#22c55e',   // Green
                'NWR', '#f97316',   // Orange
                'WCR', '#0ea5e9',   // Light Blue
                'ECR', '#a855f7',   // Purple alt
                ['case', ['==', ['get', 'electrified'], true], '#60a5fa', '#f87171'] // Fallback: Blue if Electrified, Red if Not
            ]
        ],
        'line-width': [
            'interpolate', ['linear'], ['zoom'],
            4, ['case', ['==', ['get', 'track_type'], 'Double'], 1.4, 0.8],
            8, ['case', ['==', ['get', 'track_type'], 'Double'], 2.8, 1.8],
            12, ['case', ['==', ['get', 'track_type'], 'Double'], 5.0, 3.5]
        ],
        'line-opacity': [
            'case',
            ['==', ['get', 'status'], 'Under Construction'], 0.6,
            0.9
        ],
        'line-dasharray': [
            'case',
            ['==', ['get', 'status'], 'Under Construction'],
            ['literal', [4, 3]],
            ['case', ['==', ['get', 'electrified'], true], ['literal', [1, 0]], ['literal', [3, 2]]] // Dashed line if non-electrified
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
        'line-color': '#10b981', // MG = Emerald
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
        'line-color': '#a78bfa', // NG = Violet
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1.2, 12, 2],
        'line-opacity': 0.75,
        'line-dasharray': ['case', ['==', ['get', 'electrified'], true], ['literal', [1, 0]], ['literal', [3, 2]]]
    }
};

const stationLayer: LayerProps = {
    id: 'stations',
    type: 'circle',
    source: 'atlas',
    filter: ['==', 'type', 'station'],
    minzoom: 6,
    paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 2, 9, 3.5, 13, 6],
        'circle-color': [
            'case',
            ['==', ['get', 'is_junction'], true], '#f59e0b',
            '#e2e8f0'
        ],
        'circle-stroke-width': 1,
        'circle-stroke-color': '#1e293b',
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7, 1]
    }
};

const stationLabelLayer: LayerProps = {
    id: 'station-labels',
    type: 'symbol',
    source: 'atlas',
    filter: ['==', 'type', 'station'],
    minzoom: 10,
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

// ── Types ────────────────────────────────────────────────────────────────────

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
                // Check IDB cache first to avoid hammering the DB
                const cacheKey = 'atlas-geojson-v2';
                let json = await getCachedData(cacheKey);

                if (!json) {
                    console.log("Fetching Atlas data from API...");
                    const res = await fetch('/api/atlas/geojson?type=all&limit=200000');
                    if (!res.ok) throw new Error("Failed to fetch atlas network");
                    json = await res.json();
                    
                    if (json.features) {
                        try {
                            await setCachedData(cacheKey, json);
                            console.log("Cached Atlas data successfully.");
                        } catch (e) {
                            console.error("IDB Cache failed:", e);
                        }
                    }
                } else {
                    console.log("Loaded Atlas data from IDB Cache.");
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

    const onHover = useCallback((event: any) => {
        // Only trigger hover if we haven't 'pinned' a selected feature via click
        if (selectedFeature) return;

        const { features, lngLat } = event;
        const f = features?.[0];
        if (f) {
            setHoverInfo({ feature: f, lng: lngLat.lng, lat: lngLat.lat });
        } else {
            setHoverInfo(null);
        }
    }, [selectedFeature]);

    const onClick = useCallback((event: any) => {
        const { features, lngLat } = event;
        const f = features?.[0];
        if (f) {
            // Pin the popup so it doesn't vanish on mouseleave
            setSelectedFeature({ feature: f, lng: lngLat.lng, lat: lngLat.lat });
            setHoverInfo(null);
        } else {
            setSelectedFeature(null);
        }
    }, []);

    const toggleLayer = (key: keyof LayerVisibility) => {
        setLayers(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Build the filter for each gauge layer based on visibility + construction toggle
    const bgFilter: any = layers.construction
        ? ['all', ['==', 'type', 'track'], ['==', 'gauge', 'BG']]
        : ['all', ['==', 'type', 'track'], ['==', 'gauge', 'BG'], ['==', 'status', 'Operational']];

    const mgFilter: any = layers.construction
        ? ['all', ['==', 'type', 'track'], ['==', 'gauge', 'MG']]
        : ['all', ['==', 'type', 'track'], ['==', 'gauge', 'MG'], ['==', 'status', 'Operational']];

    const ngFilter: any = ['all', ['==', 'type', 'track'], ['==', 'gauge', 'NG']];

    return (
        <div className={styles.container}>
            {/* ── Side Panel ── */}
            <div className={`${styles.panel} ${panelOpen ? styles.panelOpen : styles.panelClosed}`}>
                <button
                    className={styles.panelToggle}
                    onClick={() => setPanelOpen(v => !v)}
                    title={panelOpen ? 'Collapse panel' : 'Expand panel'}
                >
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

                        {loading && (
                            <div className={styles.loadingState}>
                                <div className={styles.spinner} />
                                <span>Loading network data...</span>
                            </div>
                        )}

                        {error && (
                            <div className={styles.errorState}>
                                ⚠️ {error}
                            </div>
                        )}

                        {metadata && (
                            <div className={styles.statsGrid}>
                                <div className={styles.statCard}>
                                    <div className={styles.statNum}>{metadata.tracks.toLocaleString()}</div>
                                    <div className={styles.statLabel}>Track Segments</div>
                                </div>
                                <div className={styles.statCard}>
                                    <div className={styles.statNum}>{metadata.stations.toLocaleString()}</div>
                                    <div className={styles.statLabel}>Stations</div>
                                </div>
                            </div>
                        )}

                        {/* Layer Toggles */}
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Track Gauge</div>
                            <LayerToggle
                                color="#3b82f6"
                                label="Broad Gauge (BG)"
                                active={layers.BG}
                                onToggle={() => toggleLayer('BG')}
                            />
                            <LayerToggle
                                color="#10b981"
                                label="Metre Gauge (MG)"
                                active={layers.MG}
                                onToggle={() => toggleLayer('MG')}
                            />
                            <LayerToggle
                                color="#a78bfa"
                                label="Narrow Gauge (NG)"
                                active={layers.NG}
                                onToggle={() => toggleLayer('NG')}
                            />
                        </div>

                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Overlays</div>
                            <LayerToggle
                                color="#e2e8f0"
                                label="Stations"
                                active={layers.stations}
                                onToggle={() => toggleLayer('stations')}
                                isCircle
                            />
                            <LayerToggle
                                color="#f59e0b"
                                label="Under Construction"
                                active={layers.construction}
                                onToggle={() => toggleLayer('construction')}
                                isDashed
                            />
                        </div>

                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Legend</div>
                            <div className={styles.legendItem}>
                                <div className={styles.legendLine} style={{ background: '#3b82f6' }} />
                                <span>Operational (BG)</span>
                            </div>
                            <div className={styles.legendItem}>
                                <div className={styles.legendDashed} />
                                <span>Non-Electrified / Construction</span>
                            </div>
                            <div className={styles.legendItem}>
                                <div className={styles.legendDot} style={{ background: '#f59e0b' }} />
                                <span>Junction / Major Station</span>
                            </div>
                        </div>

                        <div className={styles.footer}>
                            Data: OpenStreetMap contributors
                        </div>
                    </>
                )}
            </div>

            {/* ── Map ── */}
            <div className={styles.mapWrapper}>
                {mapLoaded && (
                    <Map
                        ref={mapRef}
                        initialViewState={viewState}
                        onMoveEnd={(e) => {
                            const state = {
                                longitude: e.viewState.longitude,
                                latitude: e.viewState.latitude,
                                zoom: e.viewState.zoom
                            };
                            localStorage.setItem('atlasViewState', JSON.stringify(state));
                        }}
                        mapStyle={MAP_STYLE}
                        interactiveLayerIds={[...(layers.BG ? ['tracks-bg'] : []), 'stations']}
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
                            anchor="bottom"
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
                            anchor="bottom"
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

// ── Sub-components ────────────────────────────────────────────────────────────

function LayerToggle({ color, label, active, onToggle, isCircle, isDashed }: {
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

function TrackTooltip({ props }: { props: any }) {
    return (
        <div className={styles.tooltip}>
            <div className={styles.tooltipTitle}>
                {props.gauge || 'BG'} Track Segment
            </div>
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Status</span>
                <span className={`${styles.tooltipVal} ${props.status === 'Operational' ? styles.valGreen : styles.valAmber}`}>
                    {props.status}
                </span>
            </div>
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Gauge</span>
                <span className={styles.tooltipVal}>{
                    props.gauge === 'BG' ? 'Broad Gauge (1676mm)' :
                    props.gauge === 'MG' ? 'Metre Gauge (1000mm)' :
                    'Narrow Gauge'
                }</span>
            </div>
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Track</span>
                <span className={styles.tooltipVal}>{props.track_type || 'Single'}</span>
            </div>
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Electrified</span>
                <span className={styles.tooltipVal}>{props.electrified ? '⚡ Yes' : 'No'}</span>
            </div>
        </div>
    );
}

function StationTooltip({ props }: { props: any }) {
    return (
        <div className={styles.tooltip}>
            <div className={styles.tooltipTitle}>{props.name}</div>
            <div className={styles.tooltipRow}>
                <span className={styles.tooltipKey}>Code</span>
                <span className={styles.tooltipVal}>{props.code}</span>
            </div>
            {props.zone && (
                <div className={styles.tooltipRow}>
                    <span className={styles.tooltipKey}>Zone</span>
                    <span className={styles.tooltipVal}>{props.zone}</span>
                </div>
            )}
            {props.is_junction && (
                <div className={styles.tooltipBadge}>📍 Junction</div>
            )}
            <Link href={`/station/${props.code}`} target="_blank" className={styles.tooltipHintWrapper}>
                <div className={styles.tooltipHint}>Click to view full details ↗</div>
            </Link>
        </div>
    );
}
