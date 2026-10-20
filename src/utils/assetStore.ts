/**
 * Local image store for pictures you upload, paste or drop into the editor.
 *
 * Images are kept in the browser's IndexedDB (plenty of room for pictures),
 * not in the project JSON in localStorage (only a few MB). Markdown refers to
 * them as  ![name](asset:<id>)  and the app turns that into a real image URL.
 */
import { Project } from '../types/worldify';

const DB_NAME = 'worldify-assets';
const STORE = 'assets';
export const ASSET_PREFIX = 'asset:';

export interface StoredAsset {
  id: string;
  projectId: string;
  name: string;
  type: string;
  blob: Blob;
  createdAt: string;
}

export interface ImageOption {
  /** What goes in the Markdown: a normal URL or asset:<id> */
  src: string;
  name: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('projectId', 'projectId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const urlCache = new Map<string, Promise<string | null>>();

export async function saveImageAsset(file: Blob, name: string, projectId: string): Promise<ImageOption> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const asset: StoredAsset = {
    id,
    projectId,
    name: name.replace(/\.[^.]+$/, '') || 'image',
    type: file.type,
    blob: file,
    createdAt: new Date().toISOString(),
  };
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(asset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return { src: `${ASSET_PREFIX}${id}`, name: asset.name };
}

export async function listProjectAssets(projectId: string): Promise<ImageOption[]> {
  try {
    const d = await db();
    const all = await new Promise<StoredAsset[]>((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).index('projectId').getAll(projectId);
      req.onsuccess = () => resolve(req.result as StoredAsset[]);
      req.onerror = () => reject(req.error);
    });
    return all
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => ({ src: `${ASSET_PREFIX}${a.id}`, name: a.name }));
  } catch {
    return [];
  }
}

/** Turn a Markdown image source into something an <img> can load (null = missing). */
export function resolveImageSrc(src: string): Promise<string | null> {
  if (!src.startsWith(ASSET_PREFIX)) return Promise.resolve(src);
  let p = urlCache.get(src);
  if (!p) {
    p = (async () => {
      try {
        const d = await db();
        const asset = await new Promise<StoredAsset | undefined>((resolve, reject) => {
          const req = d.transaction(STORE).objectStore(STORE).get(src.slice(ASSET_PREFIX.length));
          req.onsuccess = () => resolve(req.result as StoredAsset | undefined);
          req.onerror = () => reject(req.error);
        });
        return asset ? URL.createObjectURL(asset.blob) : null;
      } catch {
        return null;
      }
    })();
    urlCache.set(src, p);
  }
  return p;
}

const MD_IMAGE = /!\[([^\]\n]*)\]\(([^)\s]+)\)/g;

/** Every image already used in the project's wiki and stories, newest uploads first. */
export async function collectProjectImages(project: Project): Promise<ImageOption[]> {
  const seen = new Map<string, ImageOption>();
  const add = (src: string, name: string) => {
    if (!seen.has(src)) seen.set(src, { src, name: name || src.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image' });
  };
  for (const a of await listProjectAssets(project.id)) add(a.src, a.name);
  const scan = (md: string) => {
    for (const m of md.matchAll(MD_IMAGE)) add(m[2], m[1]);
  };
  project.entities.forEach((e) => scan(e.contentMd));
  project.stories.forEach((s) => s.chapters.forEach((c) => c.scenes.forEach((sc) => scan(sc.contentMd))));
  project.maps.forEach((m) => m.rasterImageUrl && add(m.rasterImageUrl, m.name));
  return [...seen.values()];
}

export const isImageFile = (f: File) => f.type.startsWith('image/');
