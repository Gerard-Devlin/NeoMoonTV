'use client';

import { Clock3, Loader2, Play, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlayRecord } from '@/lib/db.client';
import {
  deletePlayRecord,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { processImageUrl } from '@/lib/utils';

import MatrixLoadingOverlay from '@/components/MatrixLoadingOverlay';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMatrixRouteTransition } from '@/hooks/useMatrixRouteTransition';

interface PlayHistoryItem extends PlayRecord {
  key: string;
}

const HISTORY_LIMIT = 12;

function parseStorageKey(key: string): { source: string; id: string } {
  const splitIndex = key.indexOf('+');
  if (splitIndex < 0) {
    return { source: '', id: '' };
  }

  return {
    source: key.slice(0, splitIndex),
    id: key.slice(splitIndex + 1),
  };
}

function formatRelativeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }

  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
  }
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function formatProgress(record: PlayHistoryItem): string {
  const totalEpisodes = Math.max(0, Number(record.total_episodes || 0));
  const currentEpisode = Math.max(0, Number(record.index || 0));
  if (totalEpisodes > 1) {
    if (currentEpisode > 0) {
      return `第 ${Math.min(currentEpisode, totalEpisodes)} / ${totalEpisodes} 集`;
    }
    return `共 ${totalEpisodes} 集`;
  }

  const totalTime = Math.max(0, Number(record.total_time || 0));
  const playTime = Math.max(0, Number(record.play_time || 0));
  if (totalTime > 0 && playTime > 0) {
    const percent = Math.round((playTime / totalTime) * 100);
    return `进度 ${Math.min(100, percent)}%`;
  }

  return '电影';
}

function buildPlayUrl(record: PlayHistoryItem): string {
  const { source, id } = parseStorageKey(record.key);
  const normalizedTitle = (record.title || '').trim();
  const normalizedSearchTitle = (record.search_title || '').trim();
  const normalizedYear = (record.year || '').trim();
  const isTv = Number(record.total_episodes || 0) > 1;

  const params = new URLSearchParams();
  if (source && id) {
    params.set('source', source);
    params.set('id', id);
    params.set('title', normalizedTitle || normalizedSearchTitle || '未知标题');
    if (normalizedSearchTitle) {
      params.set('stitle', normalizedSearchTitle);
    }
  } else {
    params.set('title', normalizedSearchTitle || normalizedTitle || '未知标题');
  }

  if (normalizedYear) {
    params.set('year', normalizedYear);
  }
  if (isTv) {
    params.set('stype', 'tv');
  }

  return `/play?${params.toString()}`;
}

export default function DesktopTopHistory() {
  const router = useRouter();
  const { showMatrixLoading, navigateWithMatrixLoading } =
    useMatrixRouteTransition();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlayHistoryItem | null>(
    null
  );
  const [items, setItems] = useState<PlayHistoryItem[]>([]);

  const updateRecords = useCallback((records: Record<string, PlayRecord>) => {
    const sorted = Object.entries(records)
      .map(([key, record]) => ({
        ...record,
        key,
      }))
      .sort((a, b) => b.save_time - a.save_time);
    setItems(sorted);
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        const records = await getAllPlayRecords();
        if (!alive) return;
        updateRecords(records);
      } catch {
        if (alive) {
          setItems([]);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void load();

    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (records: Record<string, PlayRecord>) => {
        updateRecords(records);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [updateRecords]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const displayItems = items.slice(0, HISTORY_LIMIT);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    const { source, id } = parseStorageKey(deleteTarget.key);
    if (!source || !id) {
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    try {
      await deletePlayRecord(source, id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const handleNavigateWithMatrixLoading = useCallback(
    (href: string) => {
      navigateWithMatrixLoading(href, {
        onBeforeNavigate: () => {
          setOpen(false);
        },
      });
    },
    [navigateWithMatrixLoading]
  );

  return (
    <div ref={rootRef} className='relative m-0'>
      <MatrixLoadingOverlay visible={showMatrixLoading} />

      <button
        type='button'
        onClick={() => setOpen((prev) => !prev)}
        aria-label='历史记录'
        className='inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white'
      >
        <Clock3 className='h-5 w-5' />
      </button>

      {open ? (
        <div className='absolute right-0 z-40 mt-2 w-[min(92vw,390px)] overflow-hidden rounded-3xl border border-zinc-700/80 bg-black/55 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl'>
          <div className='flex items-center justify-between border-b border-zinc-700/80 px-4 py-3'>
            <div className='flex items-center gap-2 text-sm font-semibold text-zinc-100'>
              <Clock3 className='h-4 w-4 text-zinc-300' />
              <span>播放历史</span>
            </div>
            <button
              type='button'
              onClick={() => handleNavigateWithMatrixLoading('/my')}
              className='text-xs text-zinc-300 transition-colors hover:text-white'
            >
              查看全部
            </button>
          </div>

          <div className='max-h-[440px] overflow-y-auto'>
            {loading ? (
              <div className='space-y-2 px-3 py-3'>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`desktop-top-history-skeleton-${index}`}
                    className='flex items-center gap-3 rounded-2xl px-2 py-2'
                  >
                    <div className='h-16 w-11 shrink-0 animate-pulse rounded-md bg-zinc-800' />
                    <div className='min-w-0 flex-1 space-y-2'>
                      <div className='h-4 w-2/3 animate-pulse rounded bg-zinc-800' />
                      <div className='h-3 w-1/2 animate-pulse rounded bg-zinc-800' />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayItems.length > 0 ? (
              displayItems.map((item, index) => (
                <div
                  key={item.key}
                  className='group flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-white/20'
                >
                  <button
                    type='button'
                    onClick={() => {
                      setOpen(false);
                      router.push(buildPlayUrl(item));
                    }}
                    className='flex min-w-0 flex-1 items-center gap-2.5 text-left'
                  >
                    <Image
                      src={processImageUrl(item.cover)}
                      alt={item.title}
                      width={44}
                      height={64}
                      unoptimized
                      className='h-16 w-11 shrink-0 rounded-md object-cover ring-1 ring-white/10'
                      loading={index < 3 ? 'eager' : 'lazy'}
                      referrerPolicy='no-referrer'
                    />
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium text-zinc-100'>
                        {item.title || '未知标题'}
                      </p>
                      <div className='mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400'>
                        <Play className='h-3.5 w-3.5 shrink-0 text-zinc-500' />
                        <span className='truncate'>
                          {formatProgress(item)}
                        </span>
                        <span className='text-zinc-500'>·</span>
                        <span className='truncate'>
                          {formatRelativeTime(item.save_time)}
                        </span>
                      </div>
                    </div>
                  </button>

                  <button
                    type='button'
                    aria-label='删除历史'
                    disabled={deleting}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDeleteTarget(item);
                    }}
                    className='inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 opacity-0 transition-opacity hover:bg-black/35 hover:text-red-300 group-hover:opacity-100 disabled:cursor-not-allowed disabled:text-zinc-600'
                  >
                    {deleting && deleteTarget?.key === item.key ? (
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    ) : (
                      <Trash2 className='h-3.5 w-3.5' />
                    )}
                  </button>
                </div>
              ))
            ) : (
              <div className='px-4 py-8 text-center text-sm text-zinc-400'>
                暂无历史记录
              </div>
            )}
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deleting) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className='w-[min(92vw,24rem)] max-w-sm overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/90 p-6 text-zinc-900 shadow-[0_30px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/85 dark:text-zinc-100'>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除吗？</AlertDialogTitle>
            <AlertDialogDescription className='text-zinc-600 dark:text-zinc-300'>
              将删除这条播放历史记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className='rounded-xl border-zinc-200/80 bg-white/80 text-zinc-700 hover:bg-white dark:border-zinc-600/70 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700/90'
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
              className='rounded-xl bg-red-600/95 text-white shadow-[0_10px_20px_rgba(220,38,38,0.25)] hover:bg-red-600 dark:bg-red-500/90 dark:hover:bg-red-500'
            >
              {deleting ? '删除中...' : '确定删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
