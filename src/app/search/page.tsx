/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any, @next/next/no-img-element */
'use client';

import { ChevronDown, ChevronRight, Search, Star, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import {
  addSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';
import { yellowWords } from '@/lib/yellow';

import Loader from '@/components/Loader';
import PageLayout from '@/components/PageLayout';
import TmdbDetailModal, {
  type TmdbDetailMediaType,
  type TmdbDetailModalData,
} from '@/components/TmdbDetailModal';
import VideoCard from '@/components/VideoCard';

interface SearchPersonResult {
  id: number;
  name: string;
  profile: string;
  popularity: number;
  department: string;
  known_for: string[];
}

interface SearchPayload {
  results?: SearchResult[];
}

interface TmdbTopSearchDetail extends TmdbDetailModalData {
  logo?: string;
}

const SEARCH_SUGGEST_DEBOUNCE_MS = 220;
const SEARCH_SUGGEST_LIMIT = 6;

const DEPARTMENT_LABELS: Record<string, string> = {
  Acting: '演员',
  Directing: '导演',
  Production: '制片',
  Writing: '编剧',
  Creator: '创作',
  Camera: '摄影',
  Editing: '剪辑',
  Sound: '声音',
  Art: '美术',
  'Costume & Make-Up': '服装化妆',
  'Visual Effects': '视觉特效',
};

function formatDepartment(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';
  return DEPARTMENT_LABELS[normalized] || normalized;
}

function getMediaLabel(item: SearchResult): string {
  if ((item.type_name || '').trim().toLowerCase() === 'tv') return '剧集';
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

function getEpisodeCount(item: SearchResult): number {
  if (typeof item.total_episodes === 'number' && item.total_episodes > 0) {
    return item.total_episodes;
  }
  if (
    item.source === 'tmdb' &&
    (item.type_name || '').trim().toLowerCase() === 'tv'
  ) {
    return 0;
  }
  return Array.isArray(item.episodes) ? item.episodes.length : 0;
}

function isTvResult(item: SearchResult): boolean {
  const normalizedType = (item.type_name || '').trim().toLowerCase();
  if (normalizedType === 'tv') return true;
  if (normalizedType === 'movie') return false;
  return getEpisodeCount(item) > 1;
}

function aggregateSearchResults(
  items: SearchResult[],
  query: string
): Array<[string, SearchResult[]]> {
  const map = new Map<string, SearchResult[]>();
  items.forEach((item) => {
    const key = `${item.title.replaceAll(' ', '')}-${item.year || 'unknown'}-${
      isTvResult(item) ? 'tv' : 'movie'
    }`;
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  });

  return Array.from(map.entries()).sort((a, b) => {
    const normalizedQuery = query.trim().replaceAll(' ', '');
    const aExactMatch = a[1][0].title
      .replaceAll(' ', '')
      .includes(normalizedQuery);
    const bExactMatch = b[1][0].title
      .replaceAll(' ', '')
      .includes(normalizedQuery);

    if (aExactMatch && !bExactMatch) return -1;
    if (!aExactMatch && bExactMatch) return 1;

    if (a[1][0].year === b[1][0].year) {
      return a[0].localeCompare(b[0]);
    }

    const aYear = a[1][0].year;
    const bYear = b[1][0].year;
    if (aYear === 'unknown' && bYear === 'unknown') return 0;
    if (aYear === 'unknown') return 1;
    if (bYear === 'unknown') return -1;
    return aYear > bYear ? -1 : 1;
  });
}

function SearchPageClient() {
  // 鎼滅储鍘嗗彶
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLDivElement | null>(null);
  const detailRequestIdRef = useRef(0);
  const detailCacheRef = useRef<Record<string, TmdbTopSearchDetail>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [suggestionResults, setSuggestionResults] = useState<SearchResult[]>(
    []
  );
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [hasSuggestionSearched, setHasSuggestionSearched] = useState(false);
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
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [personResults, setPersonResults] = useState<SearchPersonResult[]>([]);
  const [legacySearchResults, setLegacySearchResults] = useState<
    SearchResult[]
  >([]);
  const [legacyExpanded, setLegacyExpanded] = useState(false);
  const trimmedSearchQuery = searchQuery.trim();
  const shouldShowSuggestionDropdown =
    suggestionOpen &&
    trimmedSearchQuery.length > 0 &&
    (suggestionLoading || hasSuggestionSearched);

  // 获取默认聚合设置：只读取用户本地设置，默认值为 true
  const getDefaultAggregate = () => {
    if (typeof window !== 'undefined') {
      const userSetting = localStorage.getItem('defaultAggregateSearch');
      if (userSetting !== null) {
        return JSON.parse(userSetting);
      }
    }
    return true; // 默认启用聚合
  };

  const [viewMode, setViewMode] = useState<'agg' | 'all'>(() => {
    return getDefaultAggregate() ? 'agg' : 'all';
  });

  const aggregatedResults = useMemo(
    () => aggregateSearchResults(searchResults, searchQuery),
    [searchResults, searchQuery]
  );

  const aggregatedLegacyResults = useMemo(
    () => aggregateSearchResults(legacySearchResults, searchQuery),
    [legacySearchResults, searchQuery]
  );

  useEffect(() => {
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();

    getSearchHistory().then(setSearchHistory);

    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!searchInputRef.current) return;
      if (searchInputRef.current.contains(event.target as Node)) return;
      setSuggestionOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!detailOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

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
      document.body.style.paddingRight = originalPaddingRight;
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
    if (!suggestionOpen || !trimmedSearchQuery) {
      if (!trimmedSearchQuery) {
        setSuggestionResults([]);
        setSuggestionLoading(false);
        setHasSuggestionSearched(false);
      }
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionLoading(true);
      setHasSuggestionSearched(true);
      try {
        const response = await fetch(
          `/api/tmdb/search?q=${encodeURIComponent(trimmedSearchQuery)}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          setSuggestionResults([]);
          return;
        }
        const payload = (await response.json()) as SearchPayload;
        const results = Array.isArray(payload.results) ? payload.results : [];
        setSuggestionResults(results.slice(0, SEARCH_SUGGEST_LIMIT));
      } catch {
        if (!controller.signal.aborted) {
          setSuggestionResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSuggestionLoading(false);
        }
      }
    }, SEARCH_SUGGEST_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmedSearchQuery, suggestionOpen]);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      setSuggestionOpen(false);
      fetchSearchResults(query);
      addSearchHistory(query);
    } else {
      setShowResults(false);
      setPersonResults([]);
      setLegacySearchResults([]);
      setLegacyExpanded(false);
      setSuggestionOpen(false);
    }
  }, [searchParams]);

  const fetchSearchResults = async (query: string) => {
    try {
      setIsLoading(true);
      setLegacyExpanded(false);
      const trimmedQuery = query.trim();

      const [tmdbPayload, legacyPayload] = await Promise.all([
        fetch(`/api/tmdb/search?q=${encodeURIComponent(trimmedQuery)}`)
          .then(async (response) => {
            if (!response.ok) return { results: [], people: [] };
            return (await response.json()) as {
              results?: SearchResult[];
              people?: SearchPersonResult[];
            };
          })
          .catch(() => ({ results: [], people: [] })),
        fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`)
          .then(async (response) => {
            if (!response.ok) return { results: [] };
            return (await response.json()) as { results?: SearchResult[] };
          })
          .catch(() => ({ results: [] })),
      ]);

      let results = Array.isArray(tmdbPayload.results)
        ? tmdbPayload.results
        : [];
      const people = Array.isArray(tmdbPayload.people)
        ? tmdbPayload.people
        : [];
      const legacyResults = Array.isArray(legacyPayload.results)
        ? legacyPayload.results
        : [];
      if (
        typeof window !== 'undefined' &&
        !(window as any).RUNTIME_CONFIG?.DISABLE_YELLOW_FILTER
      ) {
        results = results.filter((result: SearchResult) => {
          const typeName = result.type_name || '';
          return !yellowWords.some((word: string) => typeName.includes(word));
        });
      }
      setSearchResults(
        results.sort((a: SearchResult, b: SearchResult) => {
          const aExactMatch = a.title === trimmedQuery;
          const bExactMatch = b.title === trimmedQuery;

          if (aExactMatch && !bExactMatch) return -1;
          if (!aExactMatch && bExactMatch) return 1;

          if (a.year === b.year) {
            return a.title.localeCompare(b.title);
          }

          if (a.year === 'unknown' && b.year === 'unknown') return 0;
          if (a.year === 'unknown') return 1;
          if (b.year === 'unknown') return -1;
          return parseInt(a.year) > parseInt(b.year) ? -1 : 1;
        })
      );
      setPersonResults(people);
      setLegacySearchResults(legacyResults);
      setShowResults(true);
    } catch (error) {
      setSearchResults([]);
      setPersonResults([]);
      setLegacySearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    setSearchQuery(trimmed);
    setSuggestionOpen(false);
    setIsLoading(true);
    setShowResults(true);

    router.push(`/search?q=${encodeURIComponent(trimmed)}`);

    fetchSearchResults(trimmed);

    addSearchHistory(trimmed);
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
      setSuggestionOpen(false);
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
        if (typeof payload.seasons !== 'number' || payload.seasons <= 1)
          return 0;
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
    [
      handleCloseSeasonPicker,
      pushPlayByTitle,
      seasonPickerData.baseTitle,
      seasonPickerData.year,
    ]
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
          backdrop:
            detailData?.backdrop ||
            detailData?.poster ||
            activeResult?.poster ||
            '',
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

  const clearSearch = () => {
    setSearchQuery('');
    setSuggestionResults([]);
    setSuggestionOpen(false);
    setHasSuggestionSearched(false);
    setSearchResults([]);
    setPersonResults([]);
    setLegacySearchResults([]);
    setShowResults(false);
    router.replace('/search');
    const input = document.getElementById(
      'searchInput'
    ) as HTMLInputElement | null;
    input?.focus();
  };

  return (
    <div className='min-h-screen w-full'>
      <div className='relative w-full'>
        <PageLayout activePath='/search'>
          <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible mb-10'>
            <div className='mb-8'>
              <form
                onSubmit={handleSearch}
                className='mx-auto w-full max-w-[720px]'
              >
                <div ref={searchInputRef} className='relative'>
                  <Search className='absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
                  <input
                    id='searchInput'
                    type='text'
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSuggestionOpen(true);
                    }}
                    onFocus={() => setSuggestionOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setSuggestionOpen(false);
                      }
                    }}
                    placeholder='搜索电影、剧集、人物...'
                    className='h-12 w-full rounded-3xl border border-gray-200/50 bg-gray-50/80 py-3 pl-10 pr-12 text-sm text-gray-700 placeholder-gray-400 shadow-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:bg-gray-700'
                  />
                  {searchQuery && (
                    <button
                      type='button'
                      onClick={clearSearch}
                      aria-label='清空搜索'
                      className='absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:text-gray-500 dark:hover:text-gray-300'
                    >
                      <X className='h-4 w-4' />
                    </button>
                  )}
                  {shouldShowSuggestionDropdown && (
                    <div className='absolute right-0 z-40 mt-2 w-full overflow-hidden rounded-3xl border border-zinc-700/80 bg-black/55 shadow-[0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl'>
                      <div className='max-h-[420px] overflow-y-auto'>
                        {suggestionLoading ? (
                          <div className='space-y-2 px-3 py-2'>
                            {Array.from({ length: 3 }).map((_, index) => (
                              <div
                                key={`search-suggest-skeleton-${index}`}
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
                        ) : suggestionResults.length > 0 ? (
                          suggestionResults.map((item, index) => {
                            const year =
                              item.year && item.year !== 'unknown'
                                ? item.year
                                : '未知';
                            const score =
                              item.score && item.score.trim()
                                ? item.score.trim()
                                : '--';

                            return (
                              <button
                                key={`search-suggest-${item.source}-${item.id}-${index}`}
                                type='button'
                                onClick={() => handleOpenDetail(item)}
                                className='flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/20 first:rounded-t-3xl first:pt-2.5 last:rounded-b-3xl last:pb-2.5'
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
                                    {renderHighlightedText(
                                      item.title,
                                      trimmedSearchQuery
                                    )}
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
                                    <span className='truncate'>
                                      {year || '未知'}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className='px-4 py-3 text-sm text-gray-500'>
                            无匹配结果
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className='max-w-[95%] mx-auto mt-12 overflow-visible'>
              {isLoading ? (
                <div className='flex justify-center items-center h-40'>
                  <Loader />
                </div>
              ) : showResults ? (
                <section className='mb-12'>
                  {personResults.length > 0 && (
                    <div className='mb-10'>
                      <h3 className='mb-4 text-lg font-semibold text-gray-800 dark:text-gray-200'>
                        人物
                      </h3>
                      <div className='grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-4'>
                        {personResults.map((person) => (
                          <Link
                            key={`person-${person.id}`}
                            href={`/person/${person.id}`}
                            className='group overflow-hidden rounded-xl border border-gray-200/70 bg-white/70 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-gray-700/60 dark:bg-gray-800/70'
                          >
                            <div className='relative aspect-[2/3] w-full overflow-hidden bg-gray-200 dark:bg-gray-700'>
                              {person.profile ? (
                                <Image
                                  src={person.profile}
                                  alt={person.name}
                                  fill
                                  unoptimized
                                  className='object-cover transition-transform duration-300 group-hover:scale-105'
                                />
                              ) : (
                                <div className='flex h-full w-full items-center justify-center text-sm text-gray-500 dark:text-gray-400'>
                                  No profile
                                </div>
                              )}
                            </div>
                            <div className='space-y-1 p-3'>
                              <p className='truncate text-sm font-semibold text-gray-900 dark:text-gray-100'>
                                {person.name}
                              </p>
                              {person.department && (
                                <p className='truncate text-xs text-gray-500 dark:text-gray-400'>
                                  {formatDepartment(person.department)}
                                </p>
                              )}
                              {person.known_for.length > 0 && (
                                <p className='line-clamp-2 text-xs text-gray-600 dark:text-gray-300'>
                                  {person.known_for.join(' / ')}
                                </p>
                              )}
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className='mb-8 flex items-center justify-between'>
                    <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      搜索结果
                    </h2>
                    <label className='flex items-center gap-2 cursor-pointer select-none'>
                      <span className='text-sm text-gray-700 dark:text-gray-300'>
                        聚合
                      </span>
                      <div className='relative'>
                        <input
                          type='checkbox'
                          className='sr-only peer'
                          checked={viewMode === 'agg'}
                          onChange={() =>
                            setViewMode(viewMode === 'agg' ? 'all' : 'agg')
                          }
                        />
                        <div className='w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-blue-500 transition-colors dark:bg-gray-600'></div>
                        <div className='absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4'></div>
                      </div>
                    </label>
                  </div>
                  <div
                    key={`search-results-${viewMode}`}
                    className='justify-start grid grid-cols-2 gap-x-2 gap-y-8 sm:gap-y-8 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'
                  >
                    {viewMode === 'agg'
                      ? aggregatedResults.map(([mapKey, group]) => {
                          return (
                            <div key={`agg-${mapKey}`} className='w-full'>
                              <VideoCard
                                from='search'
                                items={group}
                                query={
                                  searchQuery.trim() !== group[0].title
                                    ? searchQuery.trim()
                                    : ''
                                }
                              />
                            </div>
                          );
                        })
                      : searchResults.map((item) => (
                          <div
                            key={`all-${item.source}-${item.id}`}
                            className='w-full'
                          >
                            <VideoCard
                              id={item.id}
                              title={item.title}
                              poster={item.poster}
                              episodes={getEpisodeCount(item)}
                              source={item.source}
                              source_name={item.source_name}
                              douban_id={item.douban_id?.toString()}
                              query={
                                searchQuery.trim() !== item.title
                                  ? searchQuery.trim()
                                  : ''
                              }
                              year={item.year}
                              from='search'
                              type={isTvResult(item) ? 'tv' : 'movie'}
                            />
                          </div>
                        ))}
                    {searchResults.length === 0 &&
                      legacySearchResults.length === 0 && (
                        <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                          {personResults.length > 0
                            ? 'No movie/tv results'
                            : '无搜索结果'}
                        </div>
                      )}
                  </div>

                  {legacySearchResults.length > 0 && (
                    <div className='mt-12'>
                      <button
                        type='button'
                        onClick={() => setLegacyExpanded((prev) => !prev)}
                        className='mb-4 flex w-full items-center justify-between text-left'
                      >
                        <span className='inline-flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-gray-200'>
                          {legacyExpanded ? (
                            <ChevronDown className='h-4 w-4' />
                          ) : (
                            <ChevronRight className='h-4 w-4' />
                          )}
                          原搜索结果
                        </span>
                        <span className='text-sm text-gray-500 dark:text-gray-400'>
                          {viewMode === 'agg'
                            ? aggregatedLegacyResults.length
                            : legacySearchResults.length}{' '}
                          项
                        </span>
                      </button>

                      {legacyExpanded && (
                        <div className='justify-start grid grid-cols-2 gap-x-2 gap-y-8 sm:gap-y-8 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                          {viewMode === 'agg'
                            ? aggregatedLegacyResults.map(([mapKey, group]) => (
                                <div
                                  key={`legacy-agg-${mapKey}`}
                                  className='w-full'
                                >
                                  <VideoCard
                                    from='search'
                                    items={group}
                                    query={
                                      searchQuery.trim() !== group[0].title
                                        ? searchQuery.trim()
                                        : ''
                                    }
                                  />
                                </div>
                              ))
                            : legacySearchResults.map((item, index) => (
                                <div
                                  key={`legacy-all-${item.source}-${item.id}-${index}`}
                                  className='w-full'
                                >
                                  <VideoCard
                                    id={item.id}
                                    title={item.title}
                                    poster={item.poster}
                                    episodes={getEpisodeCount(item)}
                                    source={item.source}
                                    source_name={item.source_name}
                                    douban_id={item.douban_id?.toString()}
                                    query={
                                      searchQuery.trim() !== item.title
                                        ? searchQuery.trim()
                                        : ''
                                    }
                                    year={item.year}
                                    from='search'
                                    type={isTvResult(item) ? 'tv' : 'movie'}
                                  />
                                </div>
                              ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              ) : searchHistory.length > 0 ? (
                <section className='mb-12'>
                  <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                    搜索历史
                    {/* {searchHistory.length > 0 && (
                  <button
                    onClick={() => {
                    className='ml-3 text-sm text-gray-500 hover:text-red-500 transition-colors dark:text-gray-400 dark:hover:text-red-500'
                  >
                  </button>
                )} */}
                  </h2>
                  <div className='flex flex-wrap gap-2'>
                    {searchHistory.map((item) => (
                      <div key={item} className='relative group'>
                        <button
                          onClick={() => {
                            setSearchQuery(item);
                            router.push(
                              `/search?q=${encodeURIComponent(item.trim())}`
                            );
                          }}
                          className='px-4 py-2 bg-gray-500/10 hover:bg-gray-300 rounded-full text-sm text-gray-700 transition-colors duration-200 dark:bg-gray-700/50 dark:hover:bg-gray-600 dark:text-gray-300'
                        >
                          {item}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </PageLayout>

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
                  aria-label='请选择要播放的季数'
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
                      <h3 className='text-lg font-semibold sm:pr-10'>
                        请选择要播放的季数
                      </h3>
                      {seasonPickerData.logo ? (
                        <div className='relative mx-auto mb-1.5 h-14 w-full max-w-[360px] sm:mx-0 sm:h-16'>
                          <img
                            src={processImageUrl(seasonPickerData.logo)}
                            alt={`${seasonPickerData.baseTitle} logo`}
                            className='h-full w-full object-contain object-center drop-shadow-[0_8px_20px_rgba(0,0,0,0.55)] sm:object-left'
                          />
                        </div>
                      ) : (
                        <p className='text-sm text-zinc-300/90'>
                          {seasonPickerData.baseTitle}
                        </p>
                      )}
                    </div>

                    <div className='mt-1 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto py-1 sm:grid-cols-4'>
                      {Array.from(
                        { length: Math.max(1, seasonPickerData.seasonCount) },
                        (_, idx) => idx + 1
                      ).map((season) => (
                        <button
                          key={`search-season-pick-${season}`}
                          type='button'
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleSeasonPick(season);
                          }}
                          className='rounded-xl border border-zinc-200/30 bg-white/10 px-2 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/20'
                        >
                          {`第${season}季`}
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
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
