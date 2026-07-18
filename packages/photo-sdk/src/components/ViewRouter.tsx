'use client';

import { useGallery } from '../store/context';
import { CollectionsView } from './views/CollectionsView';
import {
  ActivityView,
  AlbumView,
  DuplicatesView,
  GridScreen,
  SharedAlbumsView,
} from './views/GridScreens';
import { LibraryView } from './views/LibraryView';
import { MapView } from './views/MapView';
import { PeopleView } from './views/PeopleView';
import { AlbumsOverview } from './views/ProjectsView';
import { RecentlyDeletedView } from './views/RecentlyDeletedView';
import { VersionsView } from './views/VersionsView';

export function ViewRouter() {
  const view = useGallery((s) => s.view);

  switch (view) {
    case 'collections':
      return <CollectionsView />;
    case 'map':
      return <MapView />;
    case 'people':
      return <PeopleView />;
    case 'recently-deleted':
      return <RecentlyDeletedView />;
    case 'albums':
      return <AlbumsOverview />;
    case 'shared-albums':
      return <SharedAlbumsView />;
    case 'activity':
      return <ActivityView />;
    case 'duplicates':
      return <DuplicatesView />;
    case 'versions':
      return <VersionsView />;
    case 'library':
    case 'search':
      return <LibraryView />;
    default:
      if (view.startsWith('album:') || view.startsWith('sys:')) return <AlbumView />;
      return <GridScreen />;
  }
}
