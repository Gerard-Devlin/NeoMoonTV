'use client';

import {
  CalendarDays,
  Clock3,
  Info,
  Play,
  Star,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { fetchTmdbDetailWithClientCache } from '@/lib/tmdb-detail.client';
import { processImageUrl } from '@/lib/utils';

import SeasonPickerModal from '@/components/SeasonPickerModal';
import TmdbDetailModal from '@/components/TmdbDetailModal';

interface TmdbHeroItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string;
  year: string;
  score: string;
  backdrop: string;
  poster: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  logo?: string;
}

interface TmdbHeroResponse {
  results?: TmdbHeroItem[];
}

interface TmdbRawItem {
  id: number;
  media_type?: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
}

interface TmdbRawResponse {
  results?: TmdbRawItem[];
}

interface TmdbRuntimeResponse {
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
}

interface TmdbHeroMeta {
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
}

interface TmdbLogoItem {
  file_path?: string | null;
  iso_639_1?: string | null;
  vote_average?: number;
  width?: number;
}

interface TmdbImagesResponse {
  logos?: TmdbLogoItem[];
}

interface TmdbDetailCastItem {
  id: number;
  name: string;
  character: string;
  profile: string;
}

interface TmdbHeroDetail {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string;
  backdrop: string;
  poster: string;
  score: string;
  voteCount: number;
  year: string;
  runtime: number | null;
  seasons: number | null;
  episodes: number | null;
  contentRating: string;
  genres: string[];
  language: string;
  popularity: number | null;
  cast: TmdbDetailCastItem[];
  trailerUrl: string;
}

interface TmdbDetailRawGenre {
  name?: string;
}

interface TmdbDetailRawCast {
  id?: number;
  name?: string;
  character?: string;
  profile_path?: string | null;
}

interface TmdbDetailRawVideo {
  site?: string;
  type?: string;
  key?: string;
  official?: boolean;
  iso_639_1?: string | null;
}

interface TmdbDetailRawResponse {
  id?: number;
  title?: string;
  name?: string;
  overview?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  original_language?: string;
  popularity?: number;
  genres?: TmdbDetailRawGenre[];
  credits?: {
    cast?: TmdbDetailRawCast[];
  };
  videos?: {
    results?: TmdbDetailRawVideo[];
  };
  release_dates?: {
    results?: Array<{
      iso_3166_1?: string;
      release_dates?: Array<{ certification?: string }>;
    }>;
  };
  content_ratings?: {
    results?: Array<{
      iso_3166_1?: string;
      rating?: string;
    }>;
  };
}

type HeroMediaFilter = 'all' | 'movie' | 'tv';

interface TmdbHeroBannerProps {
  mediaFilter?: HeroMediaFilter;
  withGenres?: string;
  withOriginCountry?: string;
}

interface SeasonPickerState {
  open: boolean;
  item: TmdbHeroItem | null;
  baseTitle: string;
  year: string;
  seasonCount: number;
}

const TMDB_CLIENT_API_KEY =
  process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const HERO_ITEM_LIMIT = 7;
const SWIPE_THRESHOLD_PX = 48;
const TEXT_MOVIE = '\u7535\u5f71';
const TEXT_TV = '\u5267\u96c6';
const TEXT_PLAY = '\u64ad\u653e';
const TEXT_DETAIL = '\u8be6\u60c5';
const TEXT_DETAIL_LOAD_FAILED = '\u52a0\u8f7d\u8be6\u60c5\u5931\u8d25';

function toYear(value?: string): string {
  if (!value) return '';
  const year = value.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : '';
}

function toScore(value?: number): string {
  if (typeof value !== 'number') return '';
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(1);
}

function mapRawItemToHero(item: TmdbRawItem): TmdbHeroItem | null {
  const mediaType = item.media_type === 'tv' ? 'tv' : item.media_type === 'movie' ? 'movie' : null;
  const title = (item.title || item.name || '').trim();
  const backdropPath = item.backdrop_path || '';
  const posterPath = item.poster_path || '';

  if (!mediaType || !title || !backdropPath || !posterPath) return null;

  return {
    id: item.id,
    mediaType,
    title,
    overview: (item.overview || '').trim() || 'No overview available.',
    year: toYear(item.release_date || item.first_air_date),
    score: toScore(item.vote_average),
    backdrop: `${TMDB_IMAGE_BASE_URL}/original${backdropPath}`,
    poster: `${TMDB_IMAGE_BASE_URL}/w500${posterPath}`,
    runtime: null,
    seasons: null,
    episodes: null,
  };
}

function selectBestLogoPath(logos: TmdbLogoItem[]): string {
  if (!logos.length) return '';

  const getLanguagePriority = (lang?: string | null): number => {
    if (lang === 'zh') return 4;
    if (lang === 'en') return 3;
    if (lang === null) return 2;
    if (lang === undefined) return 2;
    return 1;
  };

  const sorted = logos
    .filter((logo) => logo.file_path)
    .sort((a, b) => {
      const lp = getLanguagePriority(b.iso_639_1) - getLanguagePriority(a.iso_639_1);
      if (lp !== 0) return lp;
      const vr = (b.vote_average || 0) - (a.vote_average || 0);
      if (vr !== 0) return vr;
      return (b.width || 0) - (a.width || 0);
    });

  return sorted[0]?.file_path || '';
}

function buildPlayUrl(item: TmdbHeroItem): string {
  const params = new URLSearchParams({
    title: item.title,
    stype: item.mediaType,
  });
  if (item.year) {
    params.set('year', item.year);
  }
  return `/play?${params.toString()}`;
}

function buildPlayUrlByTitle(
  title: string,
  mediaType: 'movie' | 'tv',
  year?: string
): string {
  const params = new URLSearchParams({
    title,
    stype: mediaType,
  });
  if (year) {
    params.set('year', year);
  }
  return `/play?${params.toString()}`;
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

function formatRuntime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
}

function pickPreferredCertification(byCountry: Map<string, string>): string {
  const preferredCountries = ['US', 'CN', 'GB', 'HK', 'JP'];
  for (const country of preferredCountries) {
    const certification = byCountry.get(country);
    if (certification) return certification;
  }
  const first = byCountry.values().next();
  return first.done ? '' : first.value;
}

function pickMovieContentRatingFromRaw(raw: TmdbDetailRawResponse): string {
  const byCountry = new Map<string, string>();
  for (const item of raw.release_dates?.results || []) {
    const country = (item.iso_3166_1 || '').toUpperCase();
    if (!country) continue;
    const certification =
      item.release_dates?.find((entry) => (entry.certification || '').trim())
        ?.certification || '';
    if (!certification) continue;
    byCountry.set(country, certification);
  }
  return pickPreferredCertification(byCountry);
}

function pickTvContentRatingFromRaw(raw: TmdbDetailRawResponse): string {
  const byCountry = new Map<string, string>();
  for (const item of raw.content_ratings?.results || []) {
    const country = (item.iso_3166_1 || '').toUpperCase();
    const rating = (item.rating || '').trim();
    if (!country || !rating) continue;
    byCountry.set(country, rating);
  }
  return pickPreferredCertification(byCountry);
}

function pickTrailerUrlFromRaw(raw: TmdbDetailRawResponse): string {
  const candidates = (raw.videos?.results || []).filter(
    (item) =>
      item.site === 'YouTube' &&
      item.type === 'Trailer' &&
      Boolean(item.key)
  );
  if (!candidates.length) return '';

  const getLangPriority = (lang?: string | null): number => {
    if (lang === 'zh') return 3;
    if (lang === 'en') return 2;
    if (lang === null || lang === undefined) return 1;
    return 0;
  };

  const sorted = [...candidates].sort((a, b) => {
    const officialDelta = Number(Boolean(b.official)) - Number(Boolean(a.official));
    if (officialDelta !== 0) return officialDelta;
    return getLangPriority(b.iso_639_1) - getLangPriority(a.iso_639_1);
  });

  const key = sorted[0]?.key;
  return key ? `https://www.youtube.com/watch?v=${key}` : '';
}

function mapRawDetailToHeroDetail(
  raw: TmdbDetailRawResponse,
  item: TmdbHeroItem
): TmdbHeroDetail {
  const cast = (raw.credits?.cast || [])
    .slice(0, 8)
    .map((member) => ({
      id: member.id ?? 0,
      name: member.name || '',
      character: member.character || '',
      profile: member.profile_path
        ? `${TMDB_IMAGE_BASE_URL}/w185${member.profile_path}`
        : '',
    }))
    .filter((member) => member.id > 0 && member.name);

  const contentRating =
    item.mediaType === 'movie'
      ? pickMovieContentRatingFromRaw(raw)
      : pickTvContentRatingFromRaw(raw);

  const runtime =
    item.mediaType === 'movie'
      ? (raw.runtime ?? null)
      : (raw.episode_run_time?.[0] ?? null);

  return {
    id: raw.id || item.id,
    mediaType: item.mediaType,
    title: (raw.title || raw.name || item.title || '').trim(),
    overview: (raw.overview || item.overview || '').trim() || 'No overview available.',
    backdrop: raw.backdrop_path
      ? `${TMDB_IMAGE_BASE_URL}/original${raw.backdrop_path}`
      : item.backdrop,
    poster: raw.poster_path
      ? `${TMDB_IMAGE_BASE_URL}/w500${raw.poster_path}`
      : item.poster,
    score: toScore(raw.vote_average) || item.score,
    voteCount: raw.vote_count || 0,
    year: toYear(raw.release_date || raw.first_air_date) || item.year,
    runtime,
    seasons: raw.number_of_seasons ?? null,
    episodes: raw.number_of_episodes ?? null,
    contentRating,
    genres: (raw.genres || [])
      .map((genre) => (genre.name || '').trim())
      .filter(Boolean),
    language: (raw.original_language || '').toUpperCase(),
    popularity:
      typeof raw.popularity === 'number' ? Math.round(raw.popularity) : null,
    cast,
    trailerUrl: pickTrailerUrlFromRaw(raw),
  };
}

function matchesMediaFilter(
  mediaType: 'movie' | 'tv',
  mediaFilter: HeroMediaFilter
): boolean {
  return mediaFilter === 'all' || mediaType === mediaFilter;
}

export default function TmdbHeroBanner({
  mediaFilter = 'all',
  withGenres = '',
  withOriginCountry = '',
}: TmdbHeroBannerProps) {
  const router = useRouter();
  const [items, setItems] = useState<TmdbHeroItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [heroWidth, setHeroWidth] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<TmdbHeroItem | null>(null);
  const [detailData, setDetailData] = useState<TmdbHeroDetail | null>(null);
  const [seasonPicker, setSeasonPicker] = useState<SeasonPickerState>({
    open: false,
    item: null,
    baseTitle: '',
    year: '',
    seasonCount: 0,
  });
  const heroRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchAxisRef = useRef<'x' | 'y' | null>(null);
  const detailCacheRef = useRef<Record<string, TmdbHeroDetail>>({});
  const detailRequestIdRef = useRef(0);
  const fullWidthSectionClass = 'relative mb-8 -mx-2 sm:-mx-10';

  const goToNext = useCallback(() => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const goToPrev = useCallback(() => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  const handleHeroTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchAxisRef.current = null;
    setIsDragging(false);
    setDragOffsetX(0);
  }, []);

  const clearTouchState = useCallback(() => {
    touchStartRef.current = null;
    touchAxisRef.current = null;
    setIsDragging(false);
    setDragOffsetX(0);
  }, []);

  const handleHeroTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;
      if (!start || items.length <= 1) return;

      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (touchAxisRef.current === null && (absX > 6 || absY > 6)) {
        touchAxisRef.current = absX > absY ? 'x' : 'y';
      }

      if (touchAxisRef.current !== 'x') return;

      setIsDragging(true);
      const limit = heroWidth > 0 ? heroWidth * 0.9 : 320;
      const nextOffset = Math.max(-limit, Math.min(limit, deltaX));
      setDragOffsetX(nextOffset);
    },
    [heroWidth, items.length]
  );

  const handleHeroTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || items.length <= 1) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      const isHorizontalGesture =
        touchAxisRef.current === 'x' || (absX > absY && absX > 8);
      touchAxisRef.current = null;

      if (!isHorizontalGesture) {
        setIsDragging(false);
        setDragOffsetX(0);
        return;
      }

      setIsDragging(false);
      setDragOffsetX(0);

      if (absX < SWIPE_THRESHOLD_PX || absX <= absY) return;

      if (deltaX < 0) {
        goToNext();
      } else {
        goToPrev();
      }
    },
    [goToNext, goToPrev, items.length]
  );

  const fetchLogoForItem = useCallback(
    async (
      mediaType: 'movie' | 'tv',
      id: number,
      signal?: AbortSignal
    ): Promise<string> => {
      try {
        if (!TMDB_CLIENT_API_KEY) return '';
        const params = new URLSearchParams({
          api_key: TMDB_CLIENT_API_KEY,
          include_image_language: 'zh,en,null',
        });
        const response = await fetch(
          `${TMDB_API_BASE_URL}/${mediaType}/${id}/images?${params.toString()}`,
          { signal }
        );
        if (!response.ok) return '';
        const data = (await response.json()) as TmdbImagesResponse;
        const logoPath = selectBestLogoPath(data.logos || []);
        return logoPath ? `${TMDB_IMAGE_BASE_URL}/w500${logoPath}` : '';
      } catch {
        return '';
      }
    },
    []
  );

  const fetchHeroMetaForItem = useCallback(
    async (
      mediaType: 'movie' | 'tv',
      id: number,
      signal?: AbortSignal
    ): Promise<TmdbHeroMeta> => {
      try {
        if (!TMDB_CLIENT_API_KEY) {
          return {
            runtime: null,
            seasons: null,
            episodes: null,
          };
        }
        const params = new URLSearchParams({
          api_key: TMDB_CLIENT_API_KEY,
          language: 'zh-CN',
        });
        const response = await fetch(
          `${TMDB_API_BASE_URL}/${mediaType}/${id}?${params.toString()}`,
          { signal }
        );
        if (!response.ok) {
          return {
            runtime: null,
            seasons: null,
            episodes: null,
          };
        }
        const data = (await response.json()) as TmdbRuntimeResponse;
        const runtime =
          mediaType === 'movie' ? data.runtime : data.episode_run_time?.[0];
        const seasons = data.number_of_seasons;
        const episodes = data.number_of_episodes;
        return {
          runtime: typeof runtime === 'number' && runtime > 0 ? runtime : null,
          seasons:
            mediaType === 'tv' && typeof seasons === 'number' && seasons > 0
              ? seasons
              : null,
          episodes:
            mediaType === 'tv' && typeof episodes === 'number' && episodes > 0
              ? episodes
              : null,
        };
      } catch {
        return {
          runtime: null,
          seasons: null,
          episodes: null,
        };
      }
    },
    []
  );

  const fetchDirectFromTmdb = useCallback(async (signal?: AbortSignal) => {
    if (!TMDB_CLIENT_API_KEY) return [];

    const normalizedGenres = (withGenres || '').trim();
    const normalizedOriginCountry = (withOriginCountry || '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();
    const shouldUseDiscover = Boolean(
      normalizedGenres || normalizedOriginCountry
    );
    const discoverMediaType: 'movie' | 'tv' =
      mediaFilter === 'movie' ? 'movie' : 'tv';
    const params = new URLSearchParams({
      api_key: TMDB_CLIENT_API_KEY,
      language: 'zh-CN',
      page: '1',
    });
    if (shouldUseDiscover) {
      params.set('sort_by', 'popularity.desc');
      params.set('include_adult', 'false');
      if (normalizedGenres) {
        params.set('with_genres', normalizedGenres);
      }
      if (normalizedOriginCountry) {
        params.set('with_origin_country', normalizedOriginCountry);
      }
    }

    const endpoint = shouldUseDiscover
      ? `${TMDB_API_BASE_URL}/discover/${discoverMediaType}`
      : `${TMDB_API_BASE_URL}/trending/all/day`;

    const response = await fetch(`${endpoint}?${params.toString()}`, {
      signal,
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as TmdbRawResponse;
    const baseItems = (data.results || [])
      .map((item) =>
        shouldUseDiscover
          ? mapRawItemToHero({ ...item, media_type: discoverMediaType })
          : mapRawItemToHero(item)
      )
      .filter((item): item is TmdbHeroItem => item !== null)
      .filter((item) => matchesMediaFilter(item.mediaType, mediaFilter))
      .slice(0, HERO_ITEM_LIMIT);

    const itemsWithLogo = await Promise.all(
      baseItems.map(async (item) => {
        const [logo, meta] = await Promise.all([
          fetchLogoForItem(item.mediaType, item.id, signal),
          fetchHeroMetaForItem(item.mediaType, item.id, signal),
        ]);
        return {
          ...item,
          runtime: meta.runtime,
          seasons: meta.seasons,
          episodes: meta.episodes,
          logo: logo || undefined,
        };
      })
    );
    const logoOnlyItems = itemsWithLogo.filter((item) => Boolean(item.logo));
    return logoOnlyItems.length > 0 ? logoOnlyItems : itemsWithLogo;
  }, [
    fetchHeroMetaForItem,
    fetchLogoForItem,
    mediaFilter,
    withGenres,
    withOriginCountry,
  ]);

  const safeImageUrl = useCallback((url: string): string => {
    try {
      return processImageUrl(url);
    } catch {
      return url;
    }
  }, []);

  const fetchDetailDirectFromTmdb = useCallback(async (item: TmdbHeroItem) => {
    if (!TMDB_CLIENT_API_KEY) return null;

    const appendToResponse =
      item.mediaType === 'movie'
        ? 'credits,videos,release_dates'
        : 'credits,videos,content_ratings';

    const params = new URLSearchParams({
      api_key: TMDB_CLIENT_API_KEY,
      language: 'zh-CN',
      append_to_response: appendToResponse,
    });

    const response = await fetch(
      `${TMDB_API_BASE_URL}/${item.mediaType}/${item.id}?${params.toString()}`,
      { cache: 'no-store' }
    );

    if (!response.ok) return null;

    const raw = (await response.json()) as TmdbDetailRawResponse;
    return mapRawDetailToHeroDetail(raw, item);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailLoading(false);
    setDetailError(null);
    detailRequestIdRef.current += 1;
  }, []);

  const handleCloseSeasonPicker = useCallback(() => {
    setSeasonPicker({
      open: false,
      item: null,
      baseTitle: '',
      year: '',
      seasonCount: 0,
    });
  }, []);

  const handleOpenDetail = useCallback(async (item: TmdbHeroItem) => {
    const cacheKey = `${item.mediaType}-${item.id}`;
    setDetailOpen(true);
    setDetailItem(item);
    setDetailError(null);

    const cached = detailCacheRef.current[cacheKey];
    if (cached) {
      setDetailData(cached);
      setDetailLoading(false);
      return;
    }

    setDetailData(null);
    setDetailLoading(true);
    const requestId = ++detailRequestIdRef.current;
    let resolved: TmdbHeroDetail | null = null;
    try {
      const data = await fetchTmdbDetailWithClientCache<TmdbHeroDetail>({
        id: item.id,
        mediaType: item.mediaType,
      });
      if (!data?.id) {
        throw new Error('TMDB detail returned empty payload');
      }
      resolved = data;
    } catch (err) {
      try {
        resolved = await fetchDetailDirectFromTmdb(item);
      } catch {
        resolved = null;
      }

      if (!resolved && detailRequestIdRef.current === requestId) {
        setDetailError((err as Error).message || TEXT_DETAIL_LOAD_FAILED);
      }
    } finally {
      if (detailRequestIdRef.current === requestId) {
        if (resolved) {
          detailCacheRef.current[cacheKey] = resolved;
          setDetailData(resolved);
          setDetailError(null);
        }
        setDetailLoading(false);
      }
    }
  }, [fetchDetailDirectFromTmdb]);

  const resolveSeasonCountForItem = useCallback(
    async (item: TmdbHeroItem): Promise<number> => {
      if (item.mediaType !== 'tv') return 0;

      if (typeof item.seasons === 'number' && item.seasons > 1) {
        return Math.floor(item.seasons);
      }

      if (
        detailItem?.id === item.id &&
        detailData?.mediaType === 'tv' &&
        typeof detailData.seasons === 'number' &&
        detailData.seasons > 1
      ) {
        return Math.floor(detailData.seasons);
      }

      try {
        const detail = await fetchTmdbDetailWithClientCache<{
          seasons?: number | null;
        }>({
          id: item.id,
          mediaType: 'tv',
        });
        const seasons = detail.seasons;
        if (typeof seasons === 'number' && Number.isFinite(seasons) && seasons > 1) {
          return Math.floor(seasons);
        }
      } catch {
        // ignore and fallback to title lookup
      }

      try {
        const detail = await fetchTmdbDetailWithClientCache<{
          seasons?: number | null;
        }>({
          title: item.title,
          mediaType: 'tv',
          year: item.year,
        });
        const seasons = detail.seasons;
        if (typeof seasons !== 'number' || !Number.isFinite(seasons) || seasons <= 1) {
          return 0;
        }
        return Math.floor(seasons);
      } catch {
        return 0;
      }
    },
    [detailData, detailItem?.id]
  );

  const handlePlayFromItem = useCallback(
    async (item: TmdbHeroItem) => {
      if (item.mediaType === 'tv' && !hasSeasonHint(item.title)) {
        const seasonCount = await resolveSeasonCountForItem(item);
        if (seasonCount > 1) {
          setSeasonPicker({
            open: true,
            item,
            baseTitle: stripSeasonHint(item.title) || item.title,
            year: item.year || '',
            seasonCount,
          });
          return;
        }
      }

      router.push(buildPlayUrl(item));
    },
    [resolveSeasonCountForItem, router]
  );

  const handleSeasonPick = useCallback(
    (season: number) => {
      const current = seasonPicker;
      if (!current.item) return;
      const base = current.baseTitle.trim();
      if (!base) return;

      const seasonTitle = `${base} 第${season}季`;
      handleCloseSeasonPicker();
      router.push(buildPlayUrlByTitle(seasonTitle, 'tv', current.year));
    },
    [handleCloseSeasonPicker, router, seasonPicker]
  );

  const fetchHeroData = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (mediaFilter !== 'all') {
        params.set('mediaType', mediaFilter);
      }
      const normalizedGenres = (withGenres || '').trim();
      if (normalizedGenres) {
        params.set('with_genres', normalizedGenres);
      }
      const normalizedOriginCountry = (withOriginCountry || '')
        .trim()
        .replace(/\s+/g, '')
        .toUpperCase();
      if (normalizedOriginCountry) {
        params.set('with_origin_country', normalizedOriginCountry);
      }
      const response = await fetch(
        `/api/tmdb/hero${params.toString() ? `?${params.toString()}` : ''}`,
        {
          signal,
        }
      );
      if (!response.ok) {
        const directItems = await fetchDirectFromTmdb(signal);
        const limitedItems = directItems.slice(0, HERO_ITEM_LIMIT);
        setItems(limitedItems);
        setError(
          limitedItems.length > 0
            ? null
            : `TMDB request failed: ${response.status}`
        );
        return;
      }
      const data = (await response.json()) as TmdbHeroResponse;
      let nextItems = (data.results || []).filter((item) =>
        matchesMediaFilter(item.mediaType, mediaFilter)
      );
      if (nextItems.length === 0) {
        nextItems = await fetchDirectFromTmdb(signal);
      }
      const logoOnlyItems = nextItems.filter((item) => Boolean(item.logo));
      const finalItems = logoOnlyItems.length > 0 ? logoOnlyItems : nextItems;
      const limitedItems = finalItems.slice(0, HERO_ITEM_LIMIT);
      setItems(limitedItems);
      if (limitedItems.length === 0) {
        setError('TMDB returned empty results');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      try {
        const directItems = await fetchDirectFromTmdb(signal);
        const limitedItems = directItems.slice(0, HERO_ITEM_LIMIT);
        setItems(limitedItems);
        setError(
          limitedItems.length > 0
            ? null
            : (err as Error).message || 'TMDB fetch failed'
        );
      } catch {
        setItems([]);
        setError((err as Error).message || 'TMDB fetch failed');
      }
    } finally {
      setLoading(false);
    }
  }, [fetchDirectFromTmdb, mediaFilter, withGenres, withOriginCountry]);

  useEffect(() => {
    const controller = new AbortController();
    fetchHeroData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchHeroData]);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;

    const updateWidth = () => {
      setHeroWidth(el.clientWidth || 0);
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (items.length <= 1) return;
    if (isDragging) return;
    if (detailOpen) return;
    if (seasonPicker.open) return;
    const timer = setInterval(() => {
      goToNext();
    }, 7000);
    return () => clearInterval(timer);
  }, [detailOpen, goToNext, isDragging, items.length, seasonPicker.open]);

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, items.length]);

  useEffect(() => {
    if (!detailOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseDetail();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [detailOpen, handleCloseDetail]);

  const activeItem = useMemo(() => items[activeIndex], [items, activeIndex]);
  const dragOffsetPercent =
    heroWidth > 0 ? (dragOffsetX / heroWidth) * 100 : 0;

  const getCircularOffset = useCallback(
    (index: number): number => {
      const total = items.length;
      if (total <= 1) return 0;
      let relative = index - activeIndex;
      if (relative > total / 2) relative -= total;
      if (relative < -total / 2) relative += total;
      return relative;
    },
    [activeIndex, items.length]
  );

  if (loading) {
    return (
      <section className={fullWidthSectionClass}>
        <div className='relative h-[78vh] overflow-hidden bg-slate-950 text-white md:h-screen'>
          <div className='absolute inset-0 bg-gradient-to-br from-slate-700/30 via-slate-900/50 to-black' />
          <div className='absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent' />
          <div className='absolute inset-0 bg-gradient-to-r from-black/75 to-transparent' />
          <div className='absolute -left-20 top-8 h-48 w-48 rounded-full bg-white/10 blur-3xl animate-pulse' />
          <div className='absolute right-0 top-1/4 h-72 w-72 rounded-full bg-white/10 blur-3xl animate-pulse' />

          <div className='absolute bottom-0 left-0 z-20 hidden w-full p-4 md:block md:w-3/4 md:translate-y-4 md:px-8 md:pt-8 md:pb-0 lg:w-1/2 lg:translate-y-6 lg:px-12 lg:pt-12 lg:pb-1'>
            <div className='space-y-4 rounded-lg p-2 md:p-3 animate-pulse'>
              <div className='h-16 w-full max-w-[460px] rounded-md bg-white/20 sm:h-20 md:h-24 lg:h-28' />

              <div className='flex flex-wrap items-center gap-3'>
                <span className='h-5 w-16 rounded-full bg-white/25' />
                <span className='h-5 w-14 rounded-full bg-white/20' />
                <span className='h-5 w-16 rounded-full bg-white/20' />
                <span className='h-5 w-24 rounded-full bg-white/20' />
              </div>

              <div className='max-w-xl space-y-2'>
                <div className='h-4 w-full rounded bg-white/20' />
                <div className='h-4 w-[88%] rounded bg-white/20' />
                <div className='h-4 w-[74%] rounded bg-white/10' />
              </div>

              <div className='flex flex-wrap items-center gap-3'>
                <div className='inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/20 px-5 py-2.5 shadow-lg backdrop-blur-md'>
                  <Play size={16} className='opacity-0' aria-hidden='true' />
                  <span className='text-sm font-semibold text-transparent'>
                    {TEXT_PLAY}
                  </span>
                </div>
                <div className='inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-5 py-2.5 shadow-lg backdrop-blur-md'>
                  <Info size={16} className='opacity-0' aria-hidden='true' />
                  <span className='text-sm font-semibold text-transparent'>
                    {TEXT_DETAIL}
                  </span>
                </div>
              </div>

              <div className='hidden pt-2 lg:block'>
                <div
                  className='grid gap-2 pb-2'
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(HERO_ITEM_LIMIT, 1)}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: HERO_ITEM_LIMIT }).map((_, index) => (
                    <div
                      key={`hero-skeleton-thumb-${index}`}
                      className='flex min-w-0 flex-col items-center'
                    >
                      <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg border-2 border-white/30 bg-white/10' />
                      <div className='mt-2 flex w-full justify-center'>
                        <div className='h-3 w-[76%] rounded bg-white/20' />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className='absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-20 md:hidden'>
            <div className='rounded-xl bg-black/35 p-3 backdrop-blur-sm'>
              <div className='animate-pulse'>
                <div className='flex gap-4'>
                  <div className='aspect-[2/3] w-24 flex-shrink-0 rounded-md bg-white/20' />
                  <div className='min-w-0 flex-1 space-y-2'>
                    <div className='h-9 w-36 max-w-full rounded-md bg-white/20' />
                    <div className='flex items-center gap-2'>
                      <span className='h-4 w-10 rounded-full bg-white/20' />
                      <span className='h-4 w-8 rounded-full bg-white/20' />
                      <span className='h-4 w-10 rounded-full bg-white/20' />
                    </div>
                    <div className='space-y-1.5'>
                      <div className='h-3.5 w-full rounded bg-white/20' />
                      <div className='h-3.5 w-[90%] rounded bg-white/20' />
                      <div className='h-3.5 w-[76%] rounded bg-white/10' />
                    </div>
                  </div>
                </div>

                <div className='mt-3 flex gap-3'>
                  <div className='inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/20 px-4 py-2 backdrop-blur-sm'>
                    <Play size={14} className='opacity-0' aria-hidden='true' />
                    <span className='text-sm font-semibold text-transparent'>
                      {TEXT_PLAY}
                    </span>
                  </div>
                  <div className='inline-flex items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/10 px-4 py-2 backdrop-blur-sm'>
                    <Info size={14} className='opacity-0' aria-hidden='true' />
                    <span className='text-sm font-semibold text-transparent'>
                      {TEXT_DETAIL}
                    </span>
                  </div>
                </div>

                <div className='mt-3 flex justify-center gap-2'>
                  <span className='h-2 w-8 rounded-full bg-white/35' />
                  <span className='h-2 w-2 rounded-full bg-white/25' />
                  <span className='h-2 w-2 rounded-full bg-white/25' />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!activeItem) {
    return (
      <section className={fullWidthSectionClass}>
        <div className='relative min-h-[320px] overflow-hidden bg-slate-900 px-6 py-8 text-white sm:min-h-[420px] sm:px-12 sm:py-10'>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(14,165,233,0.18),transparent_45%)]' />
          <div className='relative z-10 max-w-2xl space-y-3'>
            <h2 className='text-2xl font-bold sm:text-3xl'>TMDB Hero Unavailable</h2>
            <p className='text-sm text-white/75 sm:text-base'>
              {error || 'No data available at the moment.'}
            </p>
            <button
              type='button'
              onClick={() => fetchHeroData()}
              className='inline-flex items-center rounded-full border border-white/25 bg-black/30 px-4 py-2 text-sm font-semibold transition-colors hover:bg-black/50'
            >
              Retry
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={fullWidthSectionClass}>
      <div
        ref={heroRef}
        className='relative h-[78vh] overflow-hidden bg-slate-950 text-white md:h-screen'
        onTouchStart={handleHeroTouchStart}
        onTouchMove={handleHeroTouchMove}
        onTouchEnd={handleHeroTouchEnd}
        onTouchCancel={clearTouchState}
        style={{ touchAction: 'pan-y' }}
      >
        <div className='absolute inset-0 z-0 overflow-hidden'>
          {items.map((item, index) => {
            const offset = getCircularOffset(index) * 100 + dragOffsetPercent;
            const isCurrent = index === activeIndex;
            return (
              <div
                key={`hero-bg-${item.id}`}
                className={`absolute inset-0 ${
                  isDragging
                    ? 'transition-none'
                    : 'transition-transform duration-300 ease-out'
                }`}
                style={{
                  transform: `translate3d(${offset}%, 0, 0)`,
                }}
              >
                <Image
                  src={safeImageUrl(item.backdrop)}
                  alt={item.title}
                  fill
                  priority={isCurrent}
                  className='object-cover object-center brightness-[0.42]'
                />
              </div>
            );
          })}
        </div>
        <div className='absolute inset-0 z-10 bg-gradient-to-t from-black/65 via-black/20 to-transparent' />
        <div className='absolute inset-0 z-10 bg-gradient-to-r from-black/45 to-transparent' />

        <div className='absolute bottom-0 left-0 z-20 hidden w-full p-4 md:block md:w-3/4 md:translate-y-4 md:px-8 md:pt-8 md:pb-0 lg:w-1/2 lg:translate-y-6 lg:px-12 lg:pt-12 lg:pb-1'>
          <div className='space-y-4 rounded-lg p-2 md:p-3'>
            {activeItem.logo ? (
              <div className='relative h-16 w-full max-w-[560px] sm:h-20 md:h-24 lg:h-28'>
                <Image
                  src={safeImageUrl(activeItem.logo)}
                  alt={`${activeItem.title} logo`}
                  fill
                  className='object-contain object-left drop-shadow-[0_10px_26px_rgba(0,0,0,0.65)]'
                />
              </div>
            ) : (
              <h2 className='text-3xl font-extrabold leading-tight text-white sm:text-5xl md:text-6xl'>
                {activeItem.title}
              </h2>
            )}

            <div className='flex flex-wrap items-center gap-4 text-sm text-white/90'>
              {activeItem.score && (
                <span className='inline-flex items-center gap-1'>
                  <Star size={16} className='text-yellow-400' fill='currentColor' />
                  <span className='font-semibold'>{activeItem.score}</span>
                </span>
              )}
              {activeItem.year && (
                <span className='inline-flex items-center gap-1 text-white/80'>
                  <CalendarDays size={14} />
                  {activeItem.year}
                </span>
              )}
              <span className='rounded border border-white/30 px-1.5 py-0.5 text-[11px] font-medium uppercase text-white/90'>
                {activeItem.mediaType === 'movie' ? TEXT_MOVIE : TEXT_TV}
              </span>
              {activeItem.mediaType === 'movie' && activeItem.runtime ? (
                <span className='inline-flex items-center gap-1 text-white/80'>
                  <Clock3 size={14} />
                  {formatRuntime(activeItem.runtime)}
                </span>
              ) : null}
              {activeItem.mediaType === 'tv' &&
              activeItem.seasons &&
              activeItem.episodes ? (
                <span className='inline-flex items-center gap-1 text-white/80'>
                  <Users size={14} />
                  {activeItem.seasons} Seasons / {activeItem.episodes} Episodes
                </span>
              ) : null}
            </div>

            <p className='max-w-xl text-sm leading-6 text-white/90 line-clamp-2 md:line-clamp-3 md:text-base'>
              {activeItem.overview}
            </p>

            <div className='flex flex-wrap items-center gap-3'>
              <button
                type='button'
                onClick={() => {
                  void handlePlayFromItem(activeItem);
                }}
                className='inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/20 px-5 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-white/30 hover:shadow-xl'
              >
                <Play size={16} />
                {TEXT_PLAY}
              </button>
              <button
                type='button'
                onClick={() => handleOpenDetail(activeItem)}
                className='inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-white/20 hover:shadow-xl'
              >
                <Info size={16} />
                {TEXT_DETAIL}
              </button>
            </div>

            <div className='relative hidden lg:block pt-2'>
              <div
                className='grid gap-2 overflow-hidden pb-1'
                style={{
                  gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))`,
                }}
              >
                {items.map((item, index) => (
                  <button
                    key={`${item.mediaType}-${item.id}`}
                    type='button'
                    onClick={() => setActiveIndex(index)}
                    className='group flex min-w-0 flex-col items-center text-center'
                    aria-label={`Switch to ${item.title}`}
                  >
                    <div
                      className={`relative aspect-[2/3] w-full overflow-hidden rounded-lg border-2 transition-all duration-300 ${
                        index === activeIndex
                          ? 'border-sky-300'
                          : 'border-transparent group-hover:border-white/70'
                      }`}
                    >
                      <Image
                        src={safeImageUrl(item.poster)}
                        alt={item.title}
                        fill
                        className='object-cover transition-transform duration-300 group-hover:scale-105'
                      />
                    </div>
                    <span
                      className={`mt-2 line-clamp-2 text-[11px] font-medium text-white transition-opacity duration-300 ${
                        index === activeIndex
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {item.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className='absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-20 md:hidden'>
          <div className='rounded-xl bg-black/35 p-3 backdrop-blur-sm'>
            <div className='flex gap-4'>
              <div className='relative aspect-[2/3] w-24 flex-shrink-0 overflow-hidden rounded-md border border-white/20'>
                <Image
                  src={safeImageUrl(activeItem.poster)}
                  alt={activeItem.title}
                  fill
                  className='object-cover'
                />
              </div>
              <div className='min-w-0 flex-1'>
                {activeItem.logo ? (
                  <div className='relative h-10 w-full max-w-[220px]'>
                    <Image
                      src={safeImageUrl(activeItem.logo)}
                      alt={`${activeItem.title} logo`}
                      fill
                      className='object-contain object-left'
                    />
                  </div>
                ) : (
                  <h3 className='line-clamp-2 text-lg font-bold text-white'>
                    {activeItem.title}
                  </h3>
                )}

                <div className='mt-2 flex items-center gap-2 text-xs text-white/90'>
                  {activeItem.score && (
                    <span className='inline-flex items-center gap-1'>
                      <Star
                        size={12}
                        className='text-yellow-400'
                        fill='currentColor'
                      />
                      <span className='font-medium'>{activeItem.score}</span>
                    </span>
                  )}
                  {activeItem.year && <span>{activeItem.year}</span>}
                  <span className='rounded border border-white/30 px-1 py-0.5 uppercase'>
                    {activeItem.mediaType === 'movie' ? TEXT_MOVIE : TEXT_TV}
                  </span>
                  {activeItem.mediaType === 'movie' && activeItem.runtime ? (
                    <span className='inline-flex items-center gap-1 text-white/80'>
                      <Clock3 size={12} />
                      {formatRuntime(activeItem.runtime)}
                    </span>
                  ) : null}
                  {activeItem.mediaType === 'tv' &&
                  activeItem.seasons &&
                  activeItem.episodes ? (
                    <span className='inline-flex items-center gap-1 text-white/80'>
                      <Users size={12} />
                      {activeItem.seasons}S / {activeItem.episodes}E
                    </span>
                  ) : null}
                </div>

                <p className='mt-2 line-clamp-3 text-xs leading-relaxed text-white/90'>
                  {activeItem.overview}
                </p>
              </div>
            </div>

            <div className='mt-3 flex gap-3'>
              <button
                type='button'
                onClick={() => {
                  void handlePlayFromItem(activeItem);
                }}
                className='inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/20 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm'
              >
                <Play size={14} />
                {TEXT_PLAY}
              </button>
              <button
                type='button'
                onClick={() => handleOpenDetail(activeItem)}
                className='inline-flex items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm'
              >
                <Info size={14} />
                {TEXT_DETAIL}
              </button>
            </div>

            <div className='mt-3 flex justify-center gap-2'>
              {items.map((item, index) => (
                <button
                  key={`mobile-dot-${item.id}`}
                  type='button'
                  onClick={() => setActiveIndex(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    activeIndex === index
                      ? 'w-8 bg-white'
                      : 'w-2 bg-white/40 hover:bg-white/60'
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        <TmdbDetailModal
          open={detailOpen}
          loading={detailLoading}
          error={detailError}
          detail={detailData}
          titleLogo={detailItem?.logo}
          onClose={handleCloseDetail}
          onRetry={
            detailItem
              ? () => {
                  void handleOpenDetail(detailItem);
                }
              : undefined
          }
          onPlay={() => {
            if (detailItem) {
              void handlePlayFromItem(detailItem);
            }
          }}
        />
        <SeasonPickerModal
          open={seasonPicker.open}
          title={seasonPicker.baseTitle || seasonPicker.item?.title || ''}
          logo={seasonPicker.item?.logo || ''}
          backdrop={
            seasonPicker.item?.backdrop ||
            seasonPicker.item?.poster ||
            detailData?.backdrop ||
            ''
          }
          seasonCount={seasonPicker.seasonCount}
          onClose={handleCloseSeasonPicker}
          onPickSeason={handleSeasonPick}
        />

      </div>
    </section>
  );
}

