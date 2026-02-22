'use client';

import { ChevronRight, Play, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  buildCuratedCategoryQuery,
  CuratedCategoryConfig,
  TOP_RATED_CATEGORY_CONFIGS,
} from '@/lib/curated-categories';
import { processImageUrl } from '@/lib/utils';

import TmdbDetailModal, { TmdbDetailModalData } from '@/components/TmdbDetailModal';

type TmdbMediaType = 'movie' | 'tv';
type LogoLanguagePreference = 'zh' | 'en';
type LogoAspectType = 'ultraWide' | 'wide' | 'standard' | 'squareish' | 'tall';

interface RankedDiscoverItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
  backdrop?: string;
  logo?: string;
  logoAspectRatio?: number;
}

interface DiscoverApiResponse {
  code: number;
  message: string;
  list: RankedDiscoverItem[];
}

interface TmdbDetailResponse extends TmdbDetailModalData {
  logo?: string;
  logoAspectRatio?: number;
}

interface RankedSectionProps {
  title: string;
  href: string;
  mediaType: TmdbMediaType;
  items: RankedDiscoverItem[];
  loading: boolean;
  onOpenDetail: (item: RankedDiscoverItem, mediaType: TmdbMediaType) => void;
}

interface ActiveRankedItem {
  id: string;
  mediaType: TmdbMediaType;
  title: string;
  year: string;
}

const MOVIE_TOP_RATED_CONFIG =
  TOP_RATED_CATEGORY_CONFIGS.find((item) => item.slug === 'top-rated-movies') ||
  ({
    slug: 'top-rated-movies',
    title: '\u9ad8\u5206\u7535\u5f71',
    mediaType: 'movie',
    query: { sort_by: 'vote_average.desc', vote_average_gte: '7.0', vote_count_gte: '3000' },
    fallbackQuery: { sort_by: 'popularity.desc', vote_count_gte: '1000' },
  } satisfies CuratedCategoryConfig);

const TV_TOP_RATED_CONFIG =
  TOP_RATED_CATEGORY_CONFIGS.find((item) => item.slug === 'top-rated-tvshows') ||
  ({
    slug: 'top-rated-tvshows',
    title: '\u9ad8\u5206\u5267\u96c6',
    mediaType: 'tv',
    query: { sort_by: 'vote_average.desc', vote_average_gte: '7.0', vote_count_gte: '500' },
    fallbackQuery: { sort_by: 'popularity.desc', vote_count_gte: '300' },
  } satisfies CuratedCategoryConfig);

function safeImageUrl(url: string): string {
  try {
    return processImageUrl(url);
  } catch {
    return url;
  }
}

function getRankGradientClass(rank: number): string {
  if (rank === 1) {
    return 'from-[#fff6c4] via-[#f2c44a] to-[#8c5a08]';
  }
  if (rank === 2) {
    return 'from-[#f8fafc] via-[#cbd5e1] to-[#64748b]';
  }
  if (rank === 3) {
    return 'from-[#ffd7ae] via-[#c27a36] to-[#6b3e16]';
  }
  return 'from-slate-100 via-slate-300 to-slate-600';
}

function getLogoAspectType(aspectRatio?: number): LogoAspectType {
  if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return 'standard';
  }
  if (aspectRatio > 3.2) return 'ultraWide';
  if (aspectRatio > 2) return 'wide';
  if (aspectRatio >= 1.2) return 'standard';
  if (aspectRatio >= 0.8) return 'squareish';
  return 'tall';
}

function getRankedLogoContainerClass(aspectRatio?: number): string {
  const aspectType = getLogoAspectType(aspectRatio);
  if (aspectType === 'ultraWide') {
    return 'h-8 max-w-56 sm:h-9 sm:max-w-64 md:h-10 md:max-w-80';
  }
  if (aspectType === 'wide') {
    return 'h-12 max-w-48 sm:h-14 sm:max-w-56 md:h-16 md:max-w-64';
  }
  if (aspectType === 'squareish') {
    return 'h-16 max-w-16 sm:h-20 sm:max-w-20 md:h-24 md:max-w-24';
  }
  if (aspectType === 'tall') {
    return 'h-20 max-w-24 sm:h-24 sm:max-w-28 md:h-28 md:max-w-32';
  }
  return 'h-10 max-w-32 sm:h-12 sm:max-w-40 md:h-14 md:max-w-48';
}

function getLogoLanguagePreferenceForMediaType(
  mediaType: TmdbMediaType
): LogoLanguagePreference {
  return mediaType === 'movie' ? 'en' : 'zh';
}

async function fetchDiscoverItems(
  query: URLSearchParams,
  signal: AbortSignal
): Promise<RankedDiscoverItem[]> {
  const response = await fetch(`/api/tmdb/discover?${query.toString()}`, {
    signal,
  });
  const payload = (await response.json()) as DiscoverApiResponse;
  if (!response.ok || payload.code !== 200) {
    throw new Error(payload.message || 'Failed to fetch ranked content');
  }
  return payload.list.slice(0, 3);
}

async function fetchTmdbDetailById(
  id: string,
  mediaType: TmdbMediaType,
  options?: {
    signal?: AbortSignal;
    logoLanguagePreference?: LogoLanguagePreference;
  }
): Promise<TmdbDetailResponse> {
  const logoLanguagePreference = options?.logoLanguagePreference || 'zh';
  const params = new URLSearchParams({
    id,
    type: mediaType,
  });
  params.set('logoLang', logoLanguagePreference);

  const response = await fetch(`/api/tmdb/detail?${params.toString()}`, {
    ...(options?.signal ? { signal: options.signal } : {}),
  });
  const payload = (await response.json()) as TmdbDetailResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to fetch TMDB detail');
  }

  return payload;
}

function RankedCard({
  item,
  rank,
  mediaType,
  onOpenDetail,
}: {
  item: RankedDiscoverItem;
  rank: number;
  mediaType: TmdbMediaType;
  onOpenDetail: (item: RankedDiscoverItem, mediaType: TmdbMediaType) => void;
}) {
  const background = item.backdrop || item.poster;
  const score = item.rate || '--';

  return (
    <button
      type='button'
      onClick={() => onOpenDetail(item, mediaType)}
      className='group relative block w-full overflow-hidden rounded-[22px] border border-white/15 bg-black text-left shadow-[0_20px_50px_rgba(2,6,23,0.45)] transition-all duration-300 hover:-translate-y-1 hover:border-white/35 hover:shadow-[0_26px_58px_rgba(2,6,23,0.58)]'
    >
      <div className='relative aspect-[16/9] w-full'>
        {background ? (
          <Image
            src={background}
            alt={item.title}
            fill
            className='object-cover transition-transform duration-500 group-hover:scale-105'
            sizes='(max-width: 768px) 90vw, 33vw'
            unoptimized
          />
        ) : (
          <div className='absolute inset-0 bg-gradient-to-br from-sky-700/70 to-zinc-950' />
        )}

        <div className='absolute inset-0 bg-gradient-to-r from-black/90 via-black/35 to-black/70' />
        <div className='absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/20' />

        <div className='absolute inset-x-4 bottom-4 z-10 flex items-end gap-3'>
          <span
            className={`w-10 text-5xl font-black tracking-tight tabular-nums leading-none bg-gradient-to-b bg-clip-text text-transparent ${getRankGradientClass(
              rank
            )}`}
          >
            {rank}
          </span>
          <div className='min-w-0 flex-1 pb-1'>
            {item.logo ? (
              <div
                className={`flex items-center justify-start rounded-md bg-transparent ${getRankedLogoContainerClass(
                  item.logoAspectRatio
                )}`}
              >
                <div className='relative h-full w-full'>
                  <Image
                    src={safeImageUrl(item.logo)}
                    alt={`${item.title} logo`}
                    fill
                    className='object-contain object-left drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)]'
                    sizes='(max-width: 640px) 192px, (max-width: 768px) 224px, 256px'
                    unoptimized
                  />
                </div>
              </div>
            ) : (
              <h3 className='truncate text-xl font-bold text-white'>{item.title}</h3>
            )}
            <div className='mt-2 flex items-center gap-2 text-sm text-zinc-200/90'>
              {item.year ? <span>{item.year}</span> : null}
              <span className='text-zinc-400'>{'\u00b7'}</span>
              <span className='inline-flex items-center gap-1'>
                <Star className='h-3.5 w-3.5 text-amber-400' fill='currentColor' />
                {score}
              </span>
            </div>
          </div>
        </div>

        <div className='pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100'>
          <Play className='h-12 w-12 text-white drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)]' />
        </div>
      </div>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`ranked-loading-${index}`}
          className='aspect-[16/9] w-full animate-pulse rounded-[22px] bg-gray-200/80 dark:bg-zinc-800/80'
        />
      ))}
    </div>
  );
}

function RankedSection({
  title,
  href,
  mediaType,
  items,
  loading,
  onOpenDetail,
}: RankedSectionProps) {
  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section className='mb-10'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-2xl font-bold text-gray-900 dark:text-zinc-100'>{title}</h2>
        <Link
          href={href}
          className='group inline-flex items-center gap-1 rounded-full border border-zinc-300/70 bg-white/70 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition hover:border-sky-300 hover:bg-sky-500/10 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:border-sky-500/60 dark:hover:bg-sky-500/15 dark:hover:text-sky-300'
        >
          <span>{'\u67e5\u770b\u5168\u90e8'}</span>
          <ChevronRight className='h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
        </Link>
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div className='hidden grid-cols-3 gap-5 md:grid'>
            {items.slice(0, 3).map((item, index) => (
              <RankedCard
                key={`${mediaType}-desktop-${item.id}-${index}`}
                item={item}
                rank={index + 1}
                mediaType={mediaType}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </div>

          <div className='-mx-2 overflow-x-auto pb-1 md:hidden'>
            <div className='flex min-w-max gap-3 px-2'>
              {items.slice(0, 3).map((item, index) => (
                <div
                  key={`${mediaType}-mobile-${item.id}-${index}`}
                  className='w-[86vw] max-w-[560px] flex-shrink-0'
                >
                  <RankedCard
                    item={item}
                    rank={index + 1}
                    mediaType={mediaType}
                    onOpenDetail={onOpenDetail}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

interface TopRatedRankedRowsProps {
  className?: string;
}

export default function TopRatedRankedRows({ className }: TopRatedRankedRowsProps) {
  const router = useRouter();
  const [movieItems, setMovieItems] = useState<RankedDiscoverItem[]>([]);
  const [tvItems, setTvItems] = useState<RankedDiscoverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<TmdbDetailResponse | null>(null);
  const [activeItem, setActiveItem] = useState<ActiveRankedItem | null>(null);
  const detailCacheRef = useRef<Map<string, TmdbDetailResponse>>(new Map());
  const detailRequestIdRef = useRef(0);

  const cacheKey = useCallback(
    (
      id: string,
      mediaType: TmdbMediaType,
      logoLanguagePreference: LogoLanguagePreference
    ) => `${mediaType}:${logoLanguagePreference}:${id}`,
    []
  );

  const applyLogoToList = useCallback(
    (
      id: string,
      mediaType: TmdbMediaType,
      logo?: string,
      logoAspectRatio?: number
    ) => {
      if (!logo) return;
      const updater = (prev: RankedDiscoverItem[]) =>
        prev.map((item) =>
          item.id === id ? { ...item, logo, logoAspectRatio } : item
        );

      if (mediaType === 'movie') {
        setMovieItems(updater);
        return;
      }
      setTvItems(updater);
    },
    []
  );

  const fetchRankedItems = useCallback(
    async (config: CuratedCategoryConfig, signal: AbortSignal) => {
      try {
        const primary = await fetchDiscoverItems(
          buildCuratedCategoryQuery(config, 1, false),
          signal
        );
        if (primary.length > 0) return primary;
      } catch {
        // Try fallback query below.
      }

      if (config.fallbackQuery) {
        try {
          return await fetchDiscoverItems(
            buildCuratedCategoryQuery(config, 1, true),
            signal
          );
        } catch {
          return [];
        }
      }

      return [];
    },
    []
  );

  const hydrateItemDetails = useCallback(
    async (
      items: RankedDiscoverItem[],
      mediaType: TmdbMediaType,
      signal: AbortSignal
    ) => {
      if (!items.length) return;
      const logoLanguagePreference =
        getLogoLanguagePreferenceForMediaType(mediaType);

      const tasks = items.map(async (item) => {
        const key = cacheKey(item.id, mediaType, logoLanguagePreference);
        const cached = detailCacheRef.current.get(key);
        if (cached) {
          return { id: item.id, detail: cached };
        }

        const detail = await fetchTmdbDetailById(item.id, mediaType, {
          signal,
          logoLanguagePreference,
        });
        detailCacheRef.current.set(key, detail);
        return { id: item.id, detail };
      });

      const results = await Promise.allSettled(tasks);
      if (signal.aborted) return;

      results.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        const { id, detail } = result.value;
        applyLogoToList(id, mediaType, detail.logo, detail.logoAspectRatio);
      });
    },
    [applyLogoToList, cacheKey]
  );

  const loadDetail = useCallback(
    async (target: ActiveRankedItem) => {
      setActiveItem(target);
      setDetailOpen(true);
      setDetailError(null);

      const logoLanguagePreference = getLogoLanguagePreferenceForMediaType(
        target.mediaType
      );
      const key = cacheKey(
        target.id,
        target.mediaType,
        logoLanguagePreference
      );
      const cached = detailCacheRef.current.get(key);
      if (cached) {
        setDetailData(cached);
        setDetailLoading(false);
        applyLogoToList(
          target.id,
          target.mediaType,
          cached.logo,
          cached.logoAspectRatio
        );
        return;
      }

      const requestId = ++detailRequestIdRef.current;
      setDetailLoading(true);
      setDetailData(null);

      try {
        const detail = await fetchTmdbDetailById(target.id, target.mediaType, {
          logoLanguagePreference,
        });
        if (detailRequestIdRef.current !== requestId) return;

        detailCacheRef.current.set(key, detail);
        setDetailData(detail);
        applyLogoToList(
          target.id,
          target.mediaType,
          detail.logo,
          detail.logoAspectRatio
        );
      } catch (error) {
        if (detailRequestIdRef.current !== requestId) return;
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to fetch TMDB detail';
        setDetailError(message);
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      }
    },
    [applyLogoToList, cacheKey]
  );

  const handleOpenDetail = useCallback(
    (item: RankedDiscoverItem, mediaType: TmdbMediaType) => {
      void loadDetail({
        id: item.id,
        mediaType,
        title: item.title,
        year: item.year,
      });
    },
    [loadDetail]
  );

  const handleRetryDetail = useCallback(() => {
    if (!activeItem) return;
    void loadDetail(activeItem);
  }, [activeItem, loadDetail]);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailLoading(false);
    setDetailError(null);
  }, []);

  const handlePlayFromDetail = useCallback(() => {
    const title = (detailData?.title || activeItem?.title || '').trim();
    if (!title) return;

    const year = (detailData?.year || activeItem?.year || '').trim();
    const mediaType = detailData?.mediaType || activeItem?.mediaType || 'movie';

    setDetailOpen(false);
    router.push(
      `/play?title=${encodeURIComponent(title)}${
        year ? `&year=${encodeURIComponent(year)}` : ''
      }&stype=${mediaType}`
    );
  }, [activeItem, detailData, router]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);

      const [movies, tvShows] = await Promise.all([
        fetchRankedItems(MOVIE_TOP_RATED_CONFIG, controller.signal),
        fetchRankedItems(TV_TOP_RATED_CONFIG, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      setMovieItems(movies);
      setTvItems(tvShows);
      setLoading(false);

      void hydrateItemDetails(movies, 'movie', controller.signal);
      void hydrateItemDetails(tvShows, 'tv', controller.signal);
    };

    void load();

    return () => {
      controller.abort();
    };
  }, [fetchRankedItems, hydrateItemDetails]);

  if (!loading && movieItems.length === 0 && tvItems.length === 0) {
    return null;
  }

  return (
    <>
      <div className={`mb-2 ${className || ''}`}>
        <RankedSection
          title={MOVIE_TOP_RATED_CONFIG.title}
          href={`/curated/${MOVIE_TOP_RATED_CONFIG.slug}`}
          mediaType='movie'
          items={movieItems}
          loading={loading}
          onOpenDetail={handleOpenDetail}
        />
        <RankedSection
          title={TV_TOP_RATED_CONFIG.title}
          href={`/curated/${TV_TOP_RATED_CONFIG.slug}`}
          mediaType='tv'
          items={tvItems}
          loading={loading}
          onOpenDetail={handleOpenDetail}
        />
      </div>

      <TmdbDetailModal
        open={detailOpen}
        loading={detailLoading}
        error={detailError}
        detail={detailData}
        titleLogo={detailData?.logo}
        onClose={handleCloseDetail}
        onPlay={handlePlayFromDetail}
        onRetry={activeItem ? handleRetryDetail : undefined}
        playLabel={'\u7acb\u5373\u64ad\u653e'}
      />
    </>
  );
}
