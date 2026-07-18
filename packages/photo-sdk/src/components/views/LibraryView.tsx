'use client';

import { useRef, useState } from 'react';

import { useViewMedia } from '../../hooks/useViewMedia';
import { groupByTime } from '../../lib/grouping';
import { Icon, type IconName } from '../../icons';
import { useGallery, useGalleryStoreApi } from '../../store/context';
import { liveMedia } from '../../store/selectors';
import { MediaGrid } from '../MediaGrid';

function Welcome({ onImport }: { onImport: () => void }) {
  const hints: Array<{ icon: IconName; text: string }> = [
    { icon: 'camera', text: 'Connect a camera or memory card.' },
    { icon: 'duplicates', text: 'Drag pictures directly into Photos.' },
    { icon: 'download', text: 'Click the + button to import.' },
    { icon: 'image', text: 'Turn on iCloud Photos in Settings.' },
  ];
  return (
    <div className="apg-empty" onClick={onImport} role="button" tabIndex={0}>
      <div className="apg-empty__title">Welcome to Photos</div>
      <div className="apg-empty__subtitle">To get started with Photos, do any of the following:</div>
      <div className="apg-empty__hints">
        {hints.map((h, i) => (
          <div className="apg-empty__hint" key={i}>
            <span style={{ color: 'var(--apg-text-tertiary)' }}>
              <Icon name={h.icon} size={40} />
            </span>
            <span>{h.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LibraryView() {
  const api = useGalleryStoreApi();
  const items = useViewMedia();
  const scale = useGallery((s) => s.libraryScale);
  const searchQuery = useGallery((s) => s.searchQuery);
  const objectFocus = useGallery((s) => s.objectFocus);
  const tagFocus = useGallery((s) => s.tagFocus);
  const personFocus = useGallery((s) => s.personFocus);
  const personName = useGallery((s) => {
    if (!s.personFocus) return null;
    const p = s.people.find((x) => x.id === s.personFocus);
    return p?.name ?? 'Unnamed person';
  });
  const totalLive = useGallery((s) => liveMedia(s.media).length);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await api.getState().importFiles(files);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void importFiles(e.dataTransfer.files);
  };

  let content: React.ReactNode;
  if (items.length === 0) {
    if (totalLive === 0) {
      content = <Welcome onImport={() => fileRef.current?.click()} />;
    } else {
      content = (
        <div className="apg-empty">
          <div className="apg-empty__card">
            <div className="apg-empty__title" style={{ fontSize: 24 }}>
              No Results
            </div>
            <div className="apg-empty__subtitle">
              {objectFocus
                ? `No photos containing “${objectFocus}”.`
                : searchQuery
                  ? 'Try a different search term.'
                  : 'No items match this filter.'}
            </div>
          </div>
        </div>
      );
    }
  } else if (scale === 'all') {
    content = <MediaGrid items={items} />;
  } else {
    const granularity = scale === 'years' ? 'year' : scale === 'months' ? 'month' : 'day';
    const sections = groupByTime(items, granularity);
    content = (
      <>
        {sections.map((s) => (
          <MediaGrid key={s.key} items={s.items} title={s.title} />
        ))}
      </>
    );
  }

  return (
    <div
      className="apg-scroll"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={dragging ? { outline: '3px dashed var(--apg-accent)', outlineOffset: -8 } : undefined}
    >
      {objectFocus || tagFocus || personFocus ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 12px 0',
            fontSize: 14,
            fontWeight: 600,
            textTransform: 'capitalize',
          }}
        >
          <Icon name={objectFocus ? 'search' : personFocus ? 'person-circle' : 'tag'} size={16} />
          {objectFocus
            ? `Object: ${objectFocus}`
            : personFocus
              ? `Person: ${personName}`
              : `Tag: ${tagFocus}`}
          <button
            type="button"
            className="apg-btn"
            style={{ marginLeft: 8, padding: '3px 10px', textTransform: 'none' }}
            onClick={() =>
              objectFocus
                ? api.getState().setObjectFocus(null)
                : personFocus
                  ? api.getState().setPersonFocus(null)
                  : api.getState().setTagFocus(null)
            }
          >
            Clear
          </button>
        </div>
      ) : null}
      {content}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => void importFiles(e.target.files)}
      />
    </div>
  );
}
