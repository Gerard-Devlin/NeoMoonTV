/* eslint-disable no-console */
'use client';

import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type MouseEvent, useCallback, useEffect, useRef, useState } from 'react';

import type { PlayRecord } from '@/lib/db.client';
import {
  deletePlayRecord,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';

import ScrollableRow from '@/components/ScrollableRow';
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
import VideoCard from '@/components/VideoCard';

interface ContinueWatchingProps {
  className?: string;
}

const LONG_PRESS_DURATION_MS = 420;

export default function ContinueWatching({ className }: ContinueWatchingProps) {
  const router = useRouter();
  const [playRecords, setPlayRecords] = useState<
    (PlayRecord & { key: string })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressCardClickRef = useRef(false);

  const updatePlayRecords = (allRecords: Record<string, PlayRecord>) => {
    const recordsArray = Object.entries(allRecords).map(([key, record]) => ({
      ...record,
      key,
    }));

    const sortedRecords = recordsArray.sort((a, b) => b.save_time - a.save_time);
    setPlayRecords(sortedRecords);
  };

  useEffect(() => {
    const fetchPlayRecords = async () => {
      try {
        setLoading(true);
        const allRecords = await getAllPlayRecords();
        updatePlayRecords(allRecords);
      } catch (error) {
        console.error('Failed to fetch play records:', error);
        setPlayRecords([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchPlayRecords();

    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        updatePlayRecords(newRecords);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    setSelectedKeys((prev) => {
      const validKeys = new Set(playRecords.map((item) => item.key));
      return new Set(Array.from(prev).filter((key) => validKeys.has(key)));
    });
  }, [playRecords]);

  const clearLongPressTimer = useCallback(() => {
    if (!longPressTimerRef.current) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  const getProgress = (record: PlayRecord) => {
    if (record.total_time === 0) return 0;
    return (record.play_time / record.total_time) * 100;
  };

  const parseKey = (key: string) => {
    const splitIndex = key.indexOf('+');
    if (splitIndex < 0) {
      return { source: '', id: key };
    }
    return {
      source: key.slice(0, splitIndex),
      id: key.slice(splitIndex + 1),
    };
  };

  const toggleSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleLongPressStart = useCallback(
    (key: string, pointerType: string) => {
      if (isBatchMode) return;
      if (pointerType === 'mouse') return;

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        setIsBatchMode(true);
        setSelectedKeys(new Set([key]));
        suppressCardClickRef.current = true;
        longPressTimerRef.current = null;
      }, LONG_PRESS_DURATION_MS);
    },
    [clearLongPressTimer, isBatchMode]
  );

  const handleLongPressEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleCardClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!suppressCardClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressCardClickRef.current = false;
    },
    []
  );

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      const targets = playRecords.filter((item) => selectedKeys.has(item.key));
      await Promise.all(
        targets.map((item) => {
          const { source, id } = parseKey(item.key);
          return deletePlayRecord(source, id);
        })
      );
      setPlayRecords((prev) =>
        prev.filter((item) => !selectedKeys.has(item.key))
      );
      setSelectedKeys(new Set());
      setIsBatchMode(false);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  if (!loading && playRecords.length === 0) {
    return null;
  }

  return (
    <section className={`mb-8 ${className || ''}`}>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          继续观看
        </h2>
        {!loading && playRecords.length > 0 ? (
          isBatchMode ? (
            <div className='flex items-center gap-3'>
              <button
                type='button'
                className='text-sm text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-400'
                disabled={selectedKeys.size === 0}
                onClick={() => setDeleteDialogOpen(true)}
              >
                {`\u5220\u9664 (${selectedKeys.size})`}
              </button>
              <button
                type='button'
                className='text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                onClick={() => {
                  setIsBatchMode(false);
                  setSelectedKeys(new Set());
                }}
              >
                {'\u53d6\u6d88'}
              </button>
            </div>
          ) : (
            <button
              type='button'
              onClick={() => router.push('/my')}
              className='group inline-flex items-center gap-1 rounded-full border border-zinc-300/70 bg-white/70 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition hover:border-sky-300 hover:bg-sky-500/10 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:border-sky-500/60 dark:hover:bg-sky-500/15 dark:hover:text-sky-300'
            >
              <span>查看全部</span>
              <ChevronRight className='h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
            </button>
          )
        ) : null}
      </div>
      <ScrollableRow>
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className='min-w-[160px] w-40 sm:min-w-[180px] sm:w-44'
              >
                <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                  <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                </div>
                <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                <div className='mt-1 h-3 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
              </div>
            ))
          : playRecords.map((record) => {
              const { source, id } = parseKey(record.key);
              const isSelected = selectedKeys.has(record.key);
              return (
                <div
                  key={record.key}
                  className='relative min-w-[160px] w-40 sm:min-w-[180px] sm:w-44'
                  onPointerDown={(event) =>
                    handleLongPressStart(record.key, event.pointerType)
                  }
                  onPointerUp={handleLongPressEnd}
                  onPointerLeave={handleLongPressEnd}
                  onPointerCancel={handleLongPressEnd}
                  onClickCapture={handleCardClickCapture}
                >
                  <VideoCard
                    id={id}
                    title={record.title}
                    poster={record.cover}
                    year={record.year}
                    source={source}
                    source_name={record.source_name}
                    progress={getProgress(record)}
                    episodes={record.total_episodes}
                    currentEpisode={record.index}
                    query={record.search_title}
                    from='playrecord'
                    onDelete={() =>
                      setPlayRecords((prev) =>
                        prev.filter((r) => r.key !== record.key)
                      )
                    }
                    type={record.total_episodes > 1 ? 'tv' : ''}
                  />
                  {isBatchMode ? (
                    <button
                      type='button'
                      aria-label='toggle-home-play-record-selection'
                      className='absolute inset-0 z-20 rounded-lg bg-black/10 transition-colors hover:bg-black/15'
                      onClick={() => toggleSelection(record.key)}
                    >
                      <span
                        className={`absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold ${
                          isSelected
                            ? 'border-red-500 bg-red-500 text-white'
                            : 'border-white/80 bg-black/40 text-transparent'
                        }`}
                      >
                        {'\u2713'}
                      </span>
                    </button>
                  ) : null}
                </div>
              );
            })}
      </ScrollableRow>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className='w-[min(92vw,24rem)] max-w-sm overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/90 p-6 text-zinc-900 shadow-[0_30px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/85 dark:text-zinc-100'>
          <AlertDialogHeader>
            <AlertDialogTitle>{'\u786e\u8ba4\u5220\u9664\u5417\uff1f'}</AlertDialogTitle>
            <AlertDialogDescription className='text-zinc-600 dark:text-zinc-300'>
              {`\u5c06\u5220\u9664 ${selectedKeys.size} \u6761\u5386\u53f2\u8bb0\u5f55\u3002`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleting}
              className='rounded-xl border-zinc-200/80 bg-white/80 text-zinc-700 hover:bg-white dark:border-zinc-600/70 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700/90'
            >
              {'\u53d6\u6d88'}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
              className='rounded-xl bg-red-600/95 text-white shadow-[0_10px_20px_rgba(220,38,38,0.25)] hover:bg-red-600 dark:bg-red-500/90 dark:hover:bg-red-500'
            >
              {deleting ? '\u5220\u9664\u4e2d...' : '\u786e\u5b9a\u5220\u9664'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

