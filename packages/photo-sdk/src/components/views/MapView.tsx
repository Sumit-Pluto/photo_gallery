'use client';

import { useEffect, useRef, useState } from 'react';

import { MAP_TILES } from '../../constants';
import { groupByTime } from '../../lib/grouping';
import { Icon } from '../../icons';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import { clusterByLocation, type LocationCluster, liveMedia, locatedMedia } from '../../store/selectors';
import { MediaGrid } from '../MediaGrid';
import { MosaicGrid } from './MosaicGrid';

export function MapView() {
  const api = useGalleryStoreApi();
  const mapMode = useGallery((s) => s.mapMode);
  const media = useGallery((s) => s.media);
  const mapFocus = useGallery((s) => s.mapFocus);
  const located = locatedMedia(media);

  // The location pin the user tapped → its photos shown date-grouped in a sheet.
  const [cluster, setCluster] = useState<LocationCluster | null>(null);
  // Sheet height as a fraction of the viewport (drag the handle up → toward full).
  const [sheetH, setSheetH] = useState(0.5);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onHandleDown = (e: React.PointerEvent) => {
    dragRef.current = { startY: e.clientY, startH: sheetH };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY; // dragging up is positive
    const next = dragRef.current.startH + dy / window.innerHeight;
    setSheetH(Math.max(0.18, Math.min(0.98, next)));
  };
  const onHandleUp = () => {
    if (dragRef.current && sheetH <= 0.2) setCluster(null); // dragged down → dismiss
    dragRef.current = null;
  };

  const containerRef = useRef<HTMLDivElement>(null);
  // Leaflet instances kept in refs (typed loosely to avoid an SSR import).
  const mapRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  // addMarkers reads the latest `located` + setCluster via refs (Leaflet callbacks
  // are created once, so closing over state directly would go stale).
  const locatedRef = useRef(located);
  locatedRef.current = located;
  const openClusterRef = useRef<(c: LocationCluster) => void>(() => {});
  openClusterRef.current = (c) => {
    setCluster(c);
    setSheetH(0.5); // reset to half height each time a pin is opened
  };

  // Create the map once when entering a map tile mode.
  useEffect(() => {
    if (mapMode === 'grid' || !containerRef.current || mapRef.current) return;
    let cancelled = false;

    void import('leaflet').then((mod) => {
      const L = (mod as any).default ?? mod;
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        worldCopyJump: true,
      }).setView([20, 0], 2);
      mapRef.current = map;
      addTiles();
      addMarkers();
      // Re-cluster pins each time the zoom changes (precision is zoom-dependent).
      map.on('zoomend', addMarkers);
      // Center on a focused photo (from the Info mini-map), else fit to all markers.
      if (mapFocus) {
        map.setView([mapFocus.lat, mapFocus.lng], 12, { animate: false });
      } else if (located.length) {
        const bounds = L.latLngBounds(located.map((m) => [m.location!.lat, m.location!.lng]));
        map.fitBounds(bounds.pad(0.3), { animate: false });
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMode]);

  // Tear the map down when leaving map tile modes.
  useEffect(() => {
    if (mapMode === 'grid' && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      tileRef.current = null;
      markersRef.current = null;
    }
  }, [mapMode]);

  // Destroy on unmount.
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        tileRef.current = null;
        markersRef.current = null;
      }
    };
  }, []);

  const addTiles = () => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    const cfg = mapMode === 'satellite' ? MAP_TILES.satellite : MAP_TILES.map;
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map);
  };

  const addMarkers = () => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    // Keep markers in a dedicated layer group so they can be re-synced wholesale.
    if (!markersRef.current) markersRef.current = L.layerGroup().addTo(map);
    markersRef.current.clearLayers();

    // Tighter clustering as you zoom in, so pins split apart (macOS behaviour).
    const zoom = map.getZoom?.() ?? 2;
    const precision = zoom < 4 ? 0 : zoom < 7 ? 1 : zoom < 11 ? 2 : 3;
    const clusters = clusterByLocation(locatedRef.current, precision);

    for (const c of clusters) {
      const cover = c.items[0]!;
      // Static markup only (no interpolated data) so Leaflet's innerHTML can't be
      // injected; the thumbnail src + count are set via DOM after the marker mounts.
      const icon = L.divIcon({
        className: 'apg-pin-wrap',
        // Static markup only (data set via DOM after mount → XSS-safe). Includes a
        // hover tooltip with an image preview + caption.
        html:
          '<span class="apg-pin"><img class="apg-pin__img" alt=""/>' +
          '<span class="apg-pin__count"></span>' +
          '<span class="apg-pin__tip"><img class="apg-pin__tip-img" alt=""/>' +
          '<span class="apg-pin__tip-cap"></span></span></span>',
        iconSize: [56, 64],
        iconAnchor: [28, 64],
      });
      const marker = L.marker([c.lat, c.lng], { icon, keyboard: false });
      marker.on('add', () => {
        const el: HTMLElement | null = marker.getElement();
        if (!el) return;
        const thumb = cover.thumbnail ?? cover.src;
        const img = el.querySelector('.apg-pin__img') as HTMLImageElement | null;
        if (img) img.src = thumb;
        const tipImg = el.querySelector('.apg-pin__tip-img') as HTMLImageElement | null;
        if (tipImg) tipImg.src = thumb;
        const cap = el.querySelector('.apg-pin__tip-cap') as HTMLElement | null;
        if (cap) {
          // textContent (never innerHTML) — place names are attacker-influencable.
          const place = cover.location?.place ?? '';
          const n = c.items.length;
          cap.textContent = place ? `${place}${n > 1 ? ` · ${n} photos` : ''}` : `${n} photo${n === 1 ? '' : 's'}`;
        }
        const badge = el.querySelector('.apg-pin__count') as HTMLElement | null;
        if (badge) {
          badge.textContent = String(c.items.length);
          if (c.items.length < 2) badge.style.display = 'none';
        }
      });
      marker.on('click', () => openClusterRef.current(c));
      markersRef.current.addLayer(marker);
    }
  };

  // Swap tile layer when Map/Satellite toggles.
  useEffect(() => {
    if (mapRef.current) addTiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMode]);

  // Re-sync markers when the located set changes while the map stays mounted.
  useEffect(() => {
    if (mapRef.current) addMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);

  // Recenter when a photo's location is focused (from the Info mini-map).
  useEffect(() => {
    if (mapFocus && mapRef.current) {
      mapRef.current.setView([mapFocus.lat, mapFocus.lng], 12, { animate: true });
    }
  }, [mapFocus]);

  if (mapMode === 'grid') {
    // The Grid tab shows ALL photos in the macOS Memories-style mosaic (not just
    // located ones) so it's a rich date-grouped collage, per the design.
    const all = liveMedia(media);
    if (all.length === 0) {
      return (
        <div className="apg-empty">
          <div className="apg-empty__card">
            <div className="apg-empty__title" style={{ fontSize: 22 }}>
              No Photos
            </div>
            <div className="apg-empty__subtitle">Imported photos appear here as a mosaic.</div>
          </div>
        </div>
      );
    }
    return <MosaicGrid items={all} groupBy="month" />;
  }

  return (
    <div className="apg-map">
      <div ref={containerRef} className="apg-map__leaflet" />
      <div className="apg-map__controls">
        <button
          type="button"
          className="apg-iconbtn apg-iconbtn--circle"
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          className="apg-iconbtn apg-iconbtn--circle"
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
        >
          <Icon name="minus" />
        </button>
        <button
          type="button"
          className="apg-iconbtn apg-iconbtn--circle"
          aria-label="Reset north"
          onClick={() => mapRef.current?.setView([20, 0], 2)}
        >
          <Icon name="compass" size={22} />
        </button>
      </div>
      <a className="apg-map__legal" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer noopener">
        Legal
      </a>

      {cluster ? (
        <div
          className="apg-map__sheet"
          role="dialog"
          aria-label="Photos at this location"
          style={{ height: `${Math.round(sheetH * 100)}%` }}
        >
          <div
            className="apg-map__grip"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            title="Drag to resize"
            aria-hidden
          >
            <span className="apg-map__grip-bar" />
          </div>
          <div className="apg-map__sheet-head">
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {cluster.items[0]?.location?.place ?? 'This location'}
              </div>
              <div style={{ color: 'var(--apg-text-secondary)', fontSize: 12 }}>
                {cluster.items.length} photo{cluster.items.length === 1 ? '' : 's'}
              </div>
            </div>
            <button
              type="button"
              className="apg-iconbtn"
              aria-label="Close"
              onClick={() => setCluster(null)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="apg-map__sheet-body apg-scroll">
            {groupByTime(cluster.items, 'day').map((s) => (
              <MediaGrid key={s.key} items={s.items} title={s.title} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
