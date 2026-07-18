'use client';

import { useState } from 'react';

import { useIsMobile } from '../hooks/useMediaQuery';
import { Icon, type IconName } from '../icons';
import { useGallery, useGalleryStoreApi } from '../store/context';
import type { Album, ViewId } from '../types';
import { closeContextMenu, openContextMenu } from './ContextMenu';
import { openSecuritySettings, promptAlbumName } from './modals';

interface RowProps {
  icon: IconName;
  label: string;
  view?: ViewId;
  trailing?: IconName;
  indent?: boolean;
  disclosure?: boolean;
  open?: boolean;
  /** Suppress active highlight (for duplicate rows that share a view). */
  noActive?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** When set, the trailing icon becomes its own clickable control. */
  onTrailingClick?: () => void;
  trailingLabel?: string;
}

function Row({
  icon,
  label,
  view,
  trailing,
  indent,
  disclosure,
  open,
  noActive,
  onToggle,
  onClick,
  onContextMenu,
  onTrailingClick,
  trailingLabel,
}: RowProps) {
  const api = useGalleryStoreApi();
  const isMobile = useIsMobile();
  const active = useGallery((s) => (view && !noActive ? s.view === view : false));

  const handleClick = () => {
    if (onClick) onClick();
    else if (view) api.getState().setView(view);
    if (isMobile) api.getState().setSidebar(false);
  };

  return (
    <button
      type="button"
      className={[
        'apg-sidebar__item',
        indent ? 'apg-sidebar__child' : '',
        active ? 'apg-sidebar__item--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      onContextMenu={onContextMenu}
      aria-current={active ? 'page' : undefined}
    >
      {disclosure ? (
        <span
          className={['apg-sidebar__disclosure', open ? 'apg-sidebar__disclosure--open' : ''].join(
            ' ',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
        >
          <Icon name="chevron-right" size={13} />
        </span>
      ) : null}
      <span className="apg-sidebar__item-icon">
        <Icon name={icon} size={17} />
      </span>
      <span className="apg-sidebar__item-label">{label}</span>
      {trailing ? (
        onTrailingClick ? (
          <span
            className="apg-sidebar__item-trail apg-sidebar__item-trail--btn"
            role="button"
            tabIndex={0}
            aria-label={trailingLabel}
            title={trailingLabel}
            onClick={(e) => {
              e.stopPropagation();
              onTrailingClick();
            }}
          >
            <Icon name={trailing} size={14} />
          </span>
        ) : (
          <span className="apg-sidebar__item-trail">
            <Icon name={trailing} size={14} />
          </span>
        )
      ) : null}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="apg-sidebar__section-label">{children}</div>;
}

export function Sidebar() {
  const api = useGalleryStoreApi();
  const sidebarOpen = useGallery((s) => s.sidebarOpen);
  const albums = useGallery((s) => s.albums);
  // Recently Deleted lock state → closed lock when protected & not yet opened.
  const locked = useGallery((s) => s.lock.hash !== null && !s.lockUnlocked);
  const lockIcon: IconName = locked ? 'lock' : 'unlock';
  const [sharingOpen, setSharingOpen] = useState(true);
  const [albumsOpen, setAlbumsOpen] = useState(true);
  const [objectsOpen, setObjectsOpen] = useState(true);

  // Sidebar lock toggle: no password → set one; unlocked → re-lock; locked → go unlock.
  const toggleLock = () => {
    const s = api.getState();
    if (!s.lock.hash) openSecuritySettings();
    else if (s.lockUnlocked) s.relock();
    else s.setView('recently-deleted');
  };

  const userAlbums = albums.filter((a) => a.kind === 'user' || a.kind === 'folder');
  // Auto "one album per detected object" (chair, table, person, car…), sorted by count.
  const objectAlbums = albums.filter((a) => a.id.startsWith('sys:obj:'));

  const albumMenu = (album: Album) => (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      {
        label: 'Rename Album',
        icon: 'collections',
        onClick: () =>
          promptAlbumName('Rename Album', album.name, (name) =>
            api.getState().renameAlbum(album.id, name),
          ),
      },
      {
        label: 'Duplicate Album',
        icon: 'duplicates',
        onClick: () => api.getState().duplicateAlbum(album.id),
      },
      { type: 'separator' },
      {
        label: 'Delete Album',
        icon: 'trash',
        danger: true,
        onClick: () => api.getState().deleteAlbum(album.id),
      },
    ]);
  };

  const newAlbum = () =>
    promptAlbumName('New Album', '', (name) => {
      const id = api.getState().createAlbum(name);
      api.getState().setView(`album:${id}` as ViewId);
    });

  return (
    <nav
      className={['apg-sidebar', sidebarOpen ? '' : 'apg-sidebar--collapsed'].join(' ')}
      aria-label="Library navigation"
    >
      <Row icon="library" label="Library" view="library" />
      <Row icon="collections" label="Collections" view="collections" />

      <SectionLabel>Pinned</SectionLabel>
      <Row icon="heart" label="Favourites" view="favourites" />
      <Row icon="download" label="Recently Saved" view="recently-saved" />
      <Row icon="map" label="Map" view="map" />
      <Row icon="video" label="Videos" view="videos" />
      <Row icon="screenshot" label="Screenshots" view="screenshots" />
      <Row icon="document" label="Documents" view="sys:documents" />
      <Row icon="person-circle" label="People & Pets" view="people" />
      <Row
        icon="trash"
        label="Recently Deleted"
        view="recently-deleted"
        trailing={lockIcon}
        onTrailingClick={toggleLock}
        trailingLabel={locked ? 'Unlock Recently Deleted' : 'Lock Recently Deleted'}
      />

      <div
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu(e.clientX, e.clientY, [
            { label: 'New Album', icon: 'collections', onClick: newAlbum },
          ]);
        }}
      >
        <SectionLabel>Albums</SectionLabel>
      </div>
      <Row
        icon="collections"
        label="All Albums"
        view="albums"
        disclosure
        open={albumsOpen}
        onToggle={() => {
          setAlbumsOpen((v) => !v);
          closeContextMenu();
        }}
      />
      {albumsOpen ? (
        <>
          <Row icon="plus" label="New Album" onClick={newAlbum} indent />
          {userAlbums.map((a) => (
            <Row
              key={a.id}
              icon={a.kind === 'folder' ? 'folder' : 'image'}
              label={a.name}
              view={a.id as ViewId}
              indent
              onContextMenu={albumMenu(a)}
            />
          ))}
        </>
      ) : null}

      {objectAlbums.length ? (
        <>
          <SectionLabel>Objects</SectionLabel>
          <Row
            icon="tag"
            label="All Objects"
            view="collections"
            disclosure
            open={objectsOpen}
            onToggle={() => {
              setObjectsOpen((v) => !v);
              closeContextMenu();
            }}
          />
          {objectsOpen
            ? objectAlbums.map((a) => (
                <Row
                  key={a.id}
                  icon={(a.icon as IconName) ?? 'tag'}
                  label={a.name}
                  view={a.id as ViewId}
                  indent
                />
              ))
            : null}
        </>
      ) : null}

      <SectionLabel>Sharing</SectionLabel>
      <Row
        icon="people"
        label="Shared Albums"
        view="shared-albums"
        disclosure
        open={sharingOpen}
        onToggle={() => {
          setSharingOpen((v) => !v);
          closeContextMenu();
        }}
      />
      {sharingOpen ? <Row icon="chat" label="Activity" view="activity" indent /> : null}

      <SectionLabel>Utilities</SectionLabel>
      <Row
        icon="trash"
        label="Recently Deleted"
        view="recently-deleted"
        trailing={lockIcon}
        noActive
        onTrailingClick={toggleLock}
        trailingLabel={locked ? 'Unlock Recently Deleted' : 'Lock Recently Deleted'}
      />
      <Row icon="duplicates" label="Duplicates" view="duplicates" />
      <Row icon="clock" label="Versions & Audit" view="versions" />
      <Row icon="map" label="Map" view="map" noActive />
    </nav>
  );
}
