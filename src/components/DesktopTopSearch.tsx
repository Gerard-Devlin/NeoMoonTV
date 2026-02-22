'use client';

import { Search, Star, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import type { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import TmdbDetailModal, {
  type TmdbDetailMediaType,
  type TmdbDetailModalData,
} from '@/components/TmdbDetailModal';

const SEARCH_DEBOUNCE_MS = 220;

interface SearchPayload {
  results?: SearchResult[];
}

interface TmdbTopSearchDetail extends TmdbDetailModalData {
  logo?: string;
}

function getMediaLabel(item: SearchResult): string {
  if (item.type_name === 'tv') return '剧集';
  return '电影';
}

function getMediaType(item: SearchResult): TmdbDetailMediaType {
  if (item.type_name === 'tv') return 'tv';
  return 'movie';
}

function normalizeYear(value?: string): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

function hasSeasonHint(value: string): boolean {
  const text = (value || '').toLowerCase();
  if (!text.trim()) return false;
  return (
    /第\s*[一二三四五六七八九十百千万两\d]+\s*季/.test(text) ||
    /(?:season|series|s)\s*0*\d{1,2}/i.test(text)
  );
}

function stripSeasonHint(value: string): string {
  return (value || '')
    .replace(/第\s*[一二三四五六七八九十百千万两\d]+\s*季/gi, ' ')
    .replace(/(?:season|series|s)\s*0*\d{1,2}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderHighlightedText(text: string, keyword: string): JSX.Element {
  const target = text || '';
  const query = keyword.trim();
  if (!query) return <>{target}</>;

  const lowerTarget = target.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const firstMatch = lowerTarget.indexOf(lowerQuery);
  if (firstMatch < 0) return <>{target}</>;

  const before = target.slice(0, firstMatch);
  const hit = target.slice(firstMatch, firstMatch + query.length);
  const after = target.slice(firstMatch + query.length);

  return (
    <>
      {before}
      <mark className='rounded bg-white/25 px-0.5 text-white'>{hit}</mark>
      {after}
    </>
  );
}

export default function DesktopTopSearch() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const detailRequestIdRef = useRef(0);
  const detailCacheRef = useRef<Record<string, TmdbTopSearchDetail>>({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeResult, setActiveResult] = useState<SearchResult | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<TmdbTopSearchDetail | null>(
    null
  );
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [seasonPickerData, setSeasonPickerData] = useState<{
    baseTitle: string;
    year: string;
    seasonCount: number;
    logo: string;
    backdrop: string;
  }>({
    baseTitle: '',
    year: '',
    seasonCount: 0,
    logo: '',
    backdrop: '',
  });

  const trimmedQuery = query.trim();
  const shouldShowDropdown =
    open && trimmedQuery.length > 0 && (isLoading || hasSearched);
  const isSearchActive = open || trimmedQuery.length > 0;
  const focusSearchInput = useCallback(() => {
    setOpen(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setHasSearched(true);
      try {
        const response = await fetch(
          `/api/tmdb/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          setResults([]);
          return;
        }
        const payload = (await response.json()) as SearchPayload;
        setResults(Array.isArray(payload.results) ? payload.results : []);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

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
    if (!detailOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetailOpen(false);
        setDetailLoading(false);
        setDetailError(null);
        detailRequestIdRef.current += 1;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [detailOpen]);

  useEffect(() => {
    if (!seasonPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSeasonPickerOpen(false);
        setSeasonPickerData({
          baseTitle: '',
          year: '',
          seasonCount: 0,
          logo: '',
          backdrop: '',
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [seasonPickerOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== 'k') return;
      if (detailOpen || seasonPickerOpen) return;

      event.preventDefault();
      focusSearchInput();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailOpen, focusSearchInput, seasonPickerOpen]);

  const goSearchPage = (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    setOpen(false);
  };

  const loadDetailForResult = useCallback(async (result: SearchResult) => {
    const mediaType = getMediaType(result);
    const year = normalizeYear(result.year);
    const cacheKey = `${mediaType}-${result.title.trim()}-${year}`;
    const cached = detailCacheRef.current[cacheKey];
    if (cached) {
      setDetailData(cached);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    const params = new URLSearchParams({
      title: result.title,
      type: mediaType,
    });
    if (year) params.set('year', year);
    if (result.poster) params.set('poster', result.poster);

    const requestId = ++detailRequestIdRef.current;
    setDetailLoading(true);
    setDetailError(null);
    setDetailData(null);

    try {
      const response = await fetch(`/api/tmdb/detail?${params.toString()}`);
      if (!response.ok) {
        throw new Error('TMDB detail request failed');
      }
      const payload = (await response.json()) as TmdbTopSearchDetail;
      if (detailRequestIdRef.current !== requestId) return;
      detailCacheRef.current[cacheKey] = payload;
      setDetailData(payload);
    } catch {
      if (detailRequestIdRef.current !== requestId) return;
      setDetailError('详情加载失败，请重试');
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }, []);

  const handleOpenDetail = useCallback(
    (result: SearchResult) => {
      setActiveResult(result);
      setOpen(false);
      setDetailOpen(true);
      void loadDetailForResult(result);
    },
    [loadDetailForResult]
  );

  const handleRetryDetail = useCallback(() => {
    if (!activeResult) return;
    void loadDetailForResult(activeResult);
  }, [activeResult, loadDetailForResult]);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailLoading(false);
    setDetailError(null);
    detailRequestIdRef.current += 1;
  }, []);

  const pushPlayByTitle = useCallback(
    (title: string, mediaType: TmdbDetailMediaType, year: string) => {
      router.push(
        `/play?title=${encodeURIComponent(title)}${
          year ? `&year=${year}` : ''
        }&stype=${mediaType}`
      );
    },
    [router]
  );

  const fetchTmdbSeasonCountByTitle = useCallback(
    async (title: string, year: string): Promise<number> => {
      const trimmedTitle = (title || '').trim();
      if (!trimmedTitle) return 0;

      const params = new URLSearchParams({
        title: trimmedTitle,
        mediaType: 'tv',
      });
      if (year) params.set('year', year);

      try {
        const response = await fetch(`/api/tmdb/detail?${params.toString()}`);
        if (!response.ok) return 0;
        const payload = (await response.json()) as {
          mediaType?: 'movie' | 'tv';
          seasons?: number | null;
        };
        if (payload.mediaType !== 'tv') return 0;
        if (typeof payload.seasons !== 'number' || payload.seasons <= 1) return 0;
        return Math.floor(payload.seasons);
      } catch {
        return 0;
      }
    },
    []
  );

  const handleCloseSeasonPicker = useCallback(() => {
    setSeasonPickerOpen(false);
    setSeasonPickerData({
      baseTitle: '',
      year: '',
      seasonCount: 0,
      logo: '',
      backdrop: '',
    });
  }, []);

  const handleSeasonPickerBackdropPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      handleCloseSeasonPicker();
    },
    [handleCloseSeasonPicker]
  );

  const handleSeasonPick = useCallback(
    (season: number) => {
      const base = seasonPickerData.baseTitle.trim();
      if (!base) return;
      const seasonTitle = `${base} 第${season}季`;
      const year = seasonPickerData.year;
      handleCloseSeasonPicker();
      pushPlayByTitle(seasonTitle, 'tv', year);
    },
    [handleCloseSeasonPicker, pushPlayByTitle, seasonPickerData.baseTitle, seasonPickerData.year]
  );

  const handlePlayFromDetail = useCallback(async () => {
    const title = (detailData?.title || activeResult?.title || '').trim();
    if (!title) return;
    const mediaType =
      detailData?.mediaType ||
      (activeResult ? getMediaType(activeResult) : 'movie');
    const year = normalizeYear(detailData?.year || activeResult?.year);

    if (mediaType === 'tv' && !hasSeasonHint(title)) {
      const detailSeasons =
        typeof detailData?.seasons === 'number' && detailData.seasons > 1
          ? Math.floor(detailData.seasons)
          : 0;
      const seasonCount =
        detailSeasons || (await fetchTmdbSeasonCountByTitle(title, year));
      if (seasonCount > 1) {
        handleCloseDetail();
        setSeasonPickerData({
          baseTitle: stripSeasonHint(title) || title,
          year,
          seasonCount,
          logo: detailData?.logo || '',
          backdrop: detailData?.backdrop || detailData?.poster || activeResult?.poster || '',
        });
        setSeasonPickerOpen(true);
        return;
      }
    }

    pushPlayByTitle(title, mediaType, year);
    handleCloseDetail();
  }, [
    activeResult,
    detailData,
    fetchTmdbSeasonCountByTitle,
    handleCloseDetail,
    pushPlayByTitle,
  ]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    goSearchPage(trimmedQuery);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleClearQuery = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className='relative m-0'>
      <form
        onSubmit={handleSubmit}
        className={`m-0 flex h-10 w-[min(52vw,560px)] max-w-[calc(100vw-10rem)] items-center rounded-full px-3 text-sm text-gray-200 backdrop-blur-xl focus-within:border-zinc-700/80 ${
          isSearchActive
            ? 'border border-zinc-700/80 bg-black/55 shadow-[0_12px_30px_rgba(0,0,0,0.45)]'
            : 'border border-zinc-600/60 bg-black/[0.18] shadow-[0_8px_18px_rgba(0,0,0,0.22)]'
        }`}
      >
        <Search className='h-4 w-4 shrink-0 text-gray-400' />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleInputKeyDown}
          placeholder='搜索 ...'
          className='h-full w-full appearance-none border-0 bg-transparent px-2 text-sm text-gray-100 placeholder:text-gray-400 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0'
        />
        {trimmedQuery ? (
          <button
            type='button'
            onClick={handleClearQuery}
            aria-label='clear search'
            className='inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200'
          >
            <X className='h-4 w-4' />
          </button>
        ) : (
          <button
            type='button'
            onClick={focusSearchInput}
            aria-label='focus search'
            className='inline-flex h-6 shrink-0 items-center gap-0.5 rounded-md border border-white/15 bg-black/20 px-1.5 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white'
          >
            <span className='text-[9px] leading-none'>⌘</span>
            <span className='leading-none'>K</span>
          </button>
        )}
      </form>

      {shouldShowDropdown && (
        <div className='absolute right-0 z-40 mt-2 w-full overflow-hidden rounded-3xl border border-zinc-700/80 bg-black/55 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl'>
          <div className='max-h-[420px] overflow-y-auto'>
            {isLoading ? (
              <div className='space-y-2 px-3 py-2'>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`desktop-top-search-skeleton-${index}`}
                    className='flex items-center gap-3 px-1 py-1'
                  >
                    <div className='h-14 w-10 shrink-0 animate-pulse rounded bg-zinc-800' />
                    <div className='min-w-0 flex-1 space-y-2'>
                      <div className='h-4 w-2/3 animate-pulse rounded bg-zinc-800' />
                      <div className='h-3 w-1/2 animate-pulse rounded bg-zinc-800' />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length > 0 ? (
              <>
                {results.map((item, index) => {
                  const year =
                    item.year && item.year !== 'unknown' ? item.year : '';
                  const score =
                    item.score && item.score.trim() ? item.score.trim() : '--';
                  return (
                    <button
                      key={`${item.source}-${item.id}-${index}`}
                      type='button'
                      onClick={() => handleOpenDetail(item)}
                      className='flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/20 first:pt-2.5 first:rounded-t-3xl last:pb-2.5 last:rounded-b-3xl'
                    >
                      <img
                        src={processImageUrl(item.poster)}
                        alt={item.title}
                        className='h-14 w-10 shrink-0 rounded object-cover ring-1 ring-white/10'
                        loading='lazy'
                        decoding='async'
                        referrerPolicy='no-referrer'
                      />
                      <div className='min-w-0'>
                        <p className='truncate text-base font-medium text-gray-100'>
                          {renderHighlightedText(item.title, trimmedQuery)}
                        </p>
                        <div className='flex items-center gap-1 text-sm text-gray-400'>
                          <span className='truncate'>
                            {getMediaLabel(item)}
                          </span>
                          <span className='text-gray-500'>·</span>
                          <Star
                            className='h-3.5 w-3.5 shrink-0 text-yellow-400'
                            fill='currentColor'
                          />
                          <span className='truncate'>{score}</span>
                          <span className='text-gray-500'>·</span>
                          <span className='truncate'>{year || '未知'}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </>
            ) : (
              <div className='px-4 py-3 text-sm text-gray-500'>无匹配结果</div>
            )}
          </div>
        </div>
      )}

      <TmdbDetailModal
        open={detailOpen}
        loading={detailLoading}
        error={detailError}
        detail={detailData}
        titleLogo={detailData?.logo}
        onClose={handleCloseDetail}
        onRetry={handleRetryDetail}
        onPlay={() => {
          void handlePlayFromDetail();
        }}
      />

      {seasonPickerOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className='fixed inset-0 z-[900] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm'
              onPointerDown={handleSeasonPickerBackdropPointerDown}
            >
              <div
                role='dialog'
                aria-modal='false'
                aria-label='请选择要播放的季'
                className='pointer-events-auto relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/20 bg-slate-950 text-white shadow-2xl'
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className='absolute inset-0'>
                  {seasonPickerData.backdrop ? (
                    <img
                      src={processImageUrl(seasonPickerData.backdrop)}
                      alt={seasonPickerData.baseTitle}
                      className='h-full w-full object-cover opacity-30'
                    />
                  ) : null}
                  <div className='absolute inset-0 bg-gradient-to-b from-black/20 via-slate-950/85 to-slate-950' />
                </div>

                <div className='relative p-6'>
                  <button
                    type='button'
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleCloseSeasonPicker();
                    }}
                    className='absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-zinc-200 transition-colors hover:bg-black/70 hover:text-white'
                    aria-label='关闭选季弹窗'
                  >
                    <X className='h-4 w-4' />
                  </button>

                  <div className='space-y-2 text-center sm:text-left'>
                    <h3 className='text-lg font-semibold sm:pr-10'>请选择要播放的季</h3>
                    {seasonPickerData.logo ? (
                      <div className='relative mx-auto mb-1.5 h-14 w-full max-w-[360px] sm:mx-0 sm:h-16'>
                        <img
                          src={processImageUrl(seasonPickerData.logo)}
                          alt={`${seasonPickerData.baseTitle} logo`}
                          className='h-full w-full object-contain object-center drop-shadow-[0_8px_20px_rgba(0,0,0,0.55)] sm:object-left'
                        />
                      </div>
                    ) : (
                      <p className='text-sm text-zinc-300/90'>{seasonPickerData.baseTitle}</p>
                    )}
                  </div>

                  <div className='mt-1 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto py-1 sm:grid-cols-4'>
                    {Array.from(
                      { length: Math.max(1, seasonPickerData.seasonCount) },
                      (_, idx) => idx + 1
                    ).map((season) => (
                      <button
                        key={`top-search-season-pick-${season}`}
                        type='button'
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleSeasonPick(season);
                        }}
                        className='rounded-xl border border-zinc-200/30 bg-white/10 px-2 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/20'
                      >
                        {`第 ${season} 季`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
