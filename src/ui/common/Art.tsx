import { useState } from 'react';
import { ART_FALLBACK, artUrl, type ArtId } from '../assets';

const failed = new Set<string>();

/** 그림 한 장. 없거나 못 읽으면 색 모양 + 이름표(크래시 없음). */
export function Art({ id, className = '', alt = '', label }: { id: ArtId; className?: string; alt?: string; label?: string }) {
  const url = artUrl(id);
  const [, force] = useState(0);
  const fb = ART_FALLBACK[id];
  if (!url || failed.has(url)) {
    return (
      <span className={'art-fb ' + className} style={{ ['--fb' as any]: fb.color }} role="img" aria-label={alt || label || fb.label} data-art={id}>
        {id === 'bg_village' ? null : <b>{label ?? fb.label}</b>}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={url}
      alt={alt}
      draggable={false}
      data-art={id}
      onError={() => {
        failed.add(url);
        force((n) => n + 1);
      }}
    />
  );
}
