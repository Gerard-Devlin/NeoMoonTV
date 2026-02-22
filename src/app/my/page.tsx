'use client';

import { BarChart3, Heart, History, Search, X } from 'lucide-react';
import {
  type MouseEvent,
  type SyntheticEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { Favorite, PlayRecord } from '@/lib/db.client';
import {
  deleteFavorite,
  deletePlayRecord,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { processImageUrl } from '@/lib/utils';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import PageLayout from '@/components/PageLayout';
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

type PlayRecordItem = PlayRecord & { key: string };

interface FavoriteItem {
  key: string;
  source: string;
  id: string;
  title: string;
  poster: string;
  year: string;
  episodes: number;
  sourceName: string;
  currentEpisode?: number;
  searchTitle?: string;
}

type ActiveTab = 'play' | 'favorite' | 'analysis';

type AnalysisView = 'day' | 'week' | 'month' | 'year';
type GenreScope = 'all' | 'movie' | 'tv';

interface AnalysisDataPoint {
  label: string;
  range: string;
  count: number;
  posters: string[];
}

interface GenreRadarDataPoint {
  genre: string;
  count: number;
}

type GenrePosterMap = Partial<Record<SupportedGenre, string[]>>;

interface GenreAnalysisState {
  data: GenreRadarDataPoint[];
  posters: GenrePosterMap;
}

interface WatchFormatStats {
  movie: number;
  tv: number;
  total: number;
}

interface WatchFormatChartDataPoint {
  category: string;
  movie: number;
  tv: number;
}

const PolarAngleAxisCompat = PolarAngleAxis as unknown as (props: {
  dataKey: string;
  tick?: { fill: string; fontSize: number };
}) => JSX.Element;
const PolarAngleAxisNumberCompat = PolarAngleAxis as unknown as (props: {
  type?: 'number';
  domain?: [number, number];
  tick?: boolean;
}) => JSX.Element;

const ANALYSIS_VIEW_CONFIG = {
  day: {
    title: '每日观看数量',
    description: '最近 30 天的观看记录统计',
    size: 30,
    buttonLabel: '日',
  },
  week: {
    title: '每周观看数量',
    description: '最近 12 周的观看记录统计',
    size: 12,
    buttonLabel: '周',
  },
  month: {
    title: '每月观看数量',
    description: '最近 12 个月的观看记录统计',
    size: 12,
    buttonLabel: '月',
  },
  year: {
    title: '每年观看数量',
    description: '最近 8 年的观看记录统计',
    size: 8,
    buttonLabel: '年',
  },
} as const;

const GENRE_ANALYSIS_MAX_ITEMS = 80;
const GENRE_TOOLTIP_POSTER_LIMIT = 3;
const GENRE_TOOLTIP_POSTER_CACHE_LIMIT = 8;
const WATCH_FORMAT_COLORS: Record<'movie' | 'tv', string> = {
  tv: '#22d3ee',
  movie: '#60a5fa',
};
const WATCH_FORMAT_LABELS: Record<'movie' | 'tv', string> = {
  tv: '连续剧',
  movie: '电影',
};
const LONG_PRESS_DURATION_MS = 420;
const GENRE_SCOPE_OPTIONS: Array<{ value: GenreScope; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'movie', label: '电影' },
  { value: 'tv', label: '剧集' },
];
const SUPPORTED_GENRES = [
  '冒险',
  '剧情',
  '动作',
  '动画',
  '历史',
  '喜剧',
  '奇幻',
  '家庭',
  '恐怖',
  '悬疑',
  '惊悚',
  '战争',
  '爱情',
  '犯罪',
  '科幻',
  '纪录',
  '西部',
  '音乐',
] as const;

type SupportedGenre = (typeof SUPPORTED_GENRES)[number];

const GENRE_ALIAS_MAP: Record<string, SupportedGenre> = {
  adventure: '冒险',
  'action & adventure': '动作',
  动作冒险: '动作',
  drama: '剧情',
  action: '动作',
  animation: '动画',
  history: '历史',
  comedy: '喜剧',
  fantasy: '奇幻',
  family: '家庭',
  horror: '恐怖',
  mystery: '悬疑',
  thriller: '惊悚',
  war: '战争',
  'war & politics': '战争',
  romance: '爱情',
  crime: '犯罪',
  'science fiction': '科幻',
  'science fiction & fantasy': '科幻',
  sci_fi: '科幻',
  sci_fi__fantasy: '科幻',
  科幻与奇幻: '科幻',
  documentary: '纪录',
  纪录片: '纪录',
  western: '西部',
  music: '音乐',
  冒险: '冒险',
  剧情: '剧情',
  动作: '动作',
  动画: '动画',
  历史: '历史',
  喜剧: '喜剧',
  奇幻: '奇幻',
  家庭: '家庭',
  恐怖: '恐怖',
  悬疑: '悬疑',
  惊悚: '惊悚',
  战争: '战争',
  爱情: '爱情',
  犯罪: '犯罪',
  科幻: '科幻',
  纪录: '纪录',
  西部: '西部',
  音乐: '音乐',
};

function normalizeGenreName(rawGenre: string): SupportedGenre | null {
  const normalized = rawGenre.trim().toLowerCase();
  return GENRE_ALIAS_MAP[normalized] || null;
}

function appendPosterToGenreMap(
  map: Map<SupportedGenre, string[]>,
  genre: SupportedGenre,
  poster: string,
  limit: number
): void {
  const trimmedPoster = poster.trim();
  if (!trimmedPoster) return;
  const existing = map.get(genre) || [];
  if (existing.includes(trimmedPoster)) return;
  if (existing.length >= limit) return;
  map.set(genre, [...existing, trimmedPoster]);
}

function parseStorageKey(key: string): { source: string; id: string } {
  const splitIndex = key.indexOf('+');
  if (splitIndex < 0) {
    return { source: '', id: key };
  }
  return {
    source: key.slice(0, splitIndex),
    id: key.slice(splitIndex + 1),
  };
}

function stripSeasonHintFromTitle(title: string): string {
  return (title || '')
    .replace(/第\s*[一二三四五六七八九十百千万两\d]+\s*季/gi, ' ')
    .replace(/第\s*\d+\s*部/gi, ' ')
    .replace(/第\s*[一二三四五六七八九十百千万两\d]+\s*辑/gi, ' ')
    .replace(/(?:season|series|s)\s*0*\d{1,2}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTmdbTitleCandidates(
  record: Pick<PlayRecord, 'title'> & { search_title?: string }
): string[] {
  const candidates: string[] = [];
  const dedupe = new Set<string>();

  const push = (value?: string) => {
    const normalized = (value || '').trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (dedupe.has(key)) return;
    dedupe.add(key);
    candidates.push(normalized);
  };

  push(record.title);
  push(record.search_title);
  push(stripSeasonHintFromTitle(record.title));
  push(stripSeasonHintFromTitle(record.search_title || ''));

  return candidates;
}

function normalizePosterUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

function getWatchFormat(
  record: Pick<
    PlayRecord,
    'index' | 'total_episodes' | 'title' | 'search_title'
  >
): 'movie' | 'tv' {
  const totalEpisodes = Number(record.total_episodes || 0);
  if (Number.isFinite(totalEpisodes) && totalEpisodes > 1) return 'tv';

  const watchedIndex = Number(record.index || 0);
  if (Number.isFinite(watchedIndex) && watchedIndex > 1) return 'tv';

  const titleText = `${record.title || ''} ${
    record.search_title || ''
  }`.toLowerCase();
  if (
    /(第\s*\d+\s*集|全\s*\d+\s*集|更新至\s*\d+\s*集|s\s*\d{1,2}\s*e\s*\d{1,3}|ep?\s*\d{1,3})/i.test(
      titleText
    )
  ) {
    return 'tv';
  }

  return 'movie';
}

function isHttpPosterUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function getProgressPercent(record: PlayRecord): number {
  if (!record.total_time) return 0;
  return (record.play_time / record.total_time) * 100;
}

function getWeekStartTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  return date.getTime();
}

function getDayStartTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getMonthStartTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getYearStartTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  date.setMonth(0, 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getBucketStartTimestamp(
  timestamp: number,
  analysisView: AnalysisView
): number {
  if (analysisView === 'day') return getDayStartTimestamp(timestamp);
  if (analysisView === 'week') return getWeekStartTimestamp(timestamp);
  if (analysisView === 'month') return getMonthStartTimestamp(timestamp);
  return getYearStartTimestamp(timestamp);
}

function formatDayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDayRange(timestamp: number): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

function formatWeekLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatWeekRange(timestamp: number): string {
  const start = new Date(timestamp);
  const end = new Date(timestamp);
  end.setDate(end.getDate() + 6);
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatMonthLabel(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getFullYear()).slice(-2)}/${date.getMonth() + 1}`;
}

function formatMonthRange(timestamp: number): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

function formatYearLabel(timestamp: number): string {
  return `${new Date(timestamp).getFullYear()}`;
}

function formatYearRange(timestamp: number): string {
  return `${new Date(timestamp).getFullYear()} 年`;
}

function formatBucketLabel(
  timestamp: number,
  analysisView: AnalysisView
): string {
  if (analysisView === 'day') return formatDayLabel(timestamp);
  if (analysisView === 'week') return formatWeekLabel(timestamp);
  if (analysisView === 'month') return formatMonthLabel(timestamp);
  return formatYearLabel(timestamp);
}

function formatBucketRange(
  timestamp: number,
  analysisView: AnalysisView
): string {
  if (analysisView === 'day') return formatDayRange(timestamp);
  if (analysisView === 'week') return formatWeekRange(timestamp);
  if (analysisView === 'month') return formatMonthRange(timestamp);
  return formatYearRange(timestamp);
}

function moveBucket(
  current: Date,
  analysisView: AnalysisView,
  steps: number
): Date {
  const next = new Date(current);
  if (analysisView === 'day') {
    next.setDate(next.getDate() + steps);
    return next;
  }
  if (analysisView === 'week') {
    next.setDate(next.getDate() + steps * 7);
    return next;
  }
  if (analysisView === 'month') {
    next.setMonth(next.getMonth() + steps);
    return next;
  }
  next.setFullYear(next.getFullYear() + steps);
  return next;
}

function MyPageClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('play');
  const [playRecords, setPlayRecords] = useState<PlayRecordItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [loadingPlayRecords, setLoadingPlayRecords] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [isPlayBatchMode, setIsPlayBatchMode] = useState(false);
  const [isFavoriteBatchMode, setIsFavoriteBatchMode] = useState(false);
  const [selectedPlayKeys, setSelectedPlayKeys] = useState<Set<string>>(
    new Set()
  );
  const [selectedFavoriteKeys, setSelectedFavoriteKeys] = useState<Set<string>>(
    new Set()
  );
  const [deleteTarget, setDeleteTarget] = useState<'play' | 'favorite' | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [playSearchKeyword, setPlaySearchKeyword] = useState('');
  const [favoriteSearchKeyword, setFavoriteSearchKeyword] = useState('');
  const [analysisView, setAnalysisView] = useState<AnalysisView>('week');
  const [genreScope, setGenreScope] = useState<GenreScope>('all');
  const [watchFormatHoverKey, setWatchFormatHoverKey] = useState<
    'movie' | 'tv' | null
  >(null);
  const [loadingGenreRadar, setLoadingGenreRadar] = useState(false);
  const [genreAnalysisByScope, setGenreAnalysisByScope] = useState<
    Record<GenreScope, GenreAnalysisState>
  >({
    all: { data: [], posters: {} },
    movie: { data: [], posters: {} },
    tv: { data: [], posters: {} },
  });
  const genreCacheRef = useRef<Map<string, string[]>>(new Map());
  const longPressTimerRef = useRef<number | null>(null);
  const suppressPlayCardClickRef = useRef(false);
  const suppressFavoriteCardClickRef = useRef(false);

  const updatePlayRecords = useCallback(
    (records: Record<string, PlayRecord>) => {
      const sorted = Object.entries(records)
        .map(([key, record]) => ({ ...record, key }))
        .sort((a, b) => b.save_time - a.save_time);
      setPlayRecords(sorted);
    },
    []
  );

  const updateFavorites = useCallback(
    async (favorites: Record<string, Favorite>) => {
      const allPlayRecords = await getAllPlayRecords();
      const sorted = Object.entries(favorites)
        .sort(([, a], [, b]) => b.save_time - a.save_time)
        .map(([key, fav]) => {
          const { source, id } = parseStorageKey(key);
          const playRecord = allPlayRecords[key];
          return {
            key,
            source,
            id,
            title: fav.title,
            poster: fav.cover,
            year: fav.year,
            episodes: fav.total_episodes,
            sourceName: fav.source_name,
            currentEpisode: playRecord?.index,
            searchTitle: fav.search_title,
          } satisfies FavoriteItem;
        });
      setFavoriteItems(sorted);
    },
    []
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingPlayRecords(true);
        setLoadingFavorites(true);
        const [records, favorites] = await Promise.all([
          getAllPlayRecords(),
          getAllFavorites(),
        ]);
        updatePlayRecords(records);
        await updateFavorites(favorites);
      } finally {
        setLoadingPlayRecords(false);
        setLoadingFavorites(false);
      }
    };

    void load();

    const unsubPlay = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        updatePlayRecords(newRecords);
      }
    );
    const unsubFav = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, Favorite>) => {
        void updateFavorites(newFavorites);
      }
    );

    return () => {
      unsubPlay();
      unsubFav();
    };
  }, [updateFavorites, updatePlayRecords]);

  useEffect(() => {
    setSelectedPlayKeys((prev) => {
      const validKeys = new Set(playRecords.map((item) => item.key));
      return new Set(Array.from(prev).filter((key) => validKeys.has(key)));
    });
  }, [playRecords]);

  useEffect(() => {
    setSelectedFavoriteKeys((prev) => {
      const validKeys = new Set(favoriteItems.map((item) => item.key));
      return new Set(Array.from(prev).filter((key) => validKeys.has(key)));
    });
  }, [favoriteItems]);

  useEffect(() => {
    setDeleteTarget(null);
    if (activeTab === 'play') {
      setIsFavoriteBatchMode(false);
      setSelectedFavoriteKeys(new Set());
      return;
    }
    if (activeTab === 'favorite') {
      setIsPlayBatchMode(false);
      setSelectedPlayKeys(new Set());
      return;
    }
    setIsPlayBatchMode(false);
    setIsFavoriteBatchMode(false);
    setSelectedPlayKeys(new Set());
    setSelectedFavoriteKeys(new Set());
  }, [activeTab]);

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

  const normalizedPlaySearchKeyword = playSearchKeyword.trim().toLowerCase();
  const filteredPlayRecords = playRecords.filter((record) => {
    if (!normalizedPlaySearchKeyword) return true;
    return [
      record.title,
      record.source_name,
      record.year,
      record.search_title,
    ].some((value) =>
      (value || '').toLowerCase().includes(normalizedPlaySearchKeyword)
    );
  });

  const normalizedFavoriteSearchKeyword = favoriteSearchKeyword
    .trim()
    .toLowerCase();
  const filteredFavoriteItems = favoriteItems.filter((item) => {
    if (!normalizedFavoriteSearchKeyword) return true;
    return [item.title, item.sourceName, item.year, item.searchTitle].some(
      (value) =>
        (value || '').toLowerCase().includes(normalizedFavoriteSearchKeyword)
    );
  });

  const analysisChartData = useMemo<AnalysisDataPoint[]>(() => {
    const config = ANALYSIS_VIEW_CONFIG[analysisView];
    const counts = new Map<number, number>();
    const postersByBucket = new Map<number, string[]>();
    for (const record of playRecords) {
      const bucketStart = getBucketStartTimestamp(
        record.save_time,
        analysisView
      );
      counts.set(bucketStart, (counts.get(bucketStart) || 0) + 1);

      const poster = (record.cover || '').trim();
      if (!poster) continue;
      const existingPosters = postersByBucket.get(bucketStart) || [];
      if (existingPosters.includes(poster)) continue;
      if (existingPosters.length >= GENRE_TOOLTIP_POSTER_CACHE_LIMIT) continue;
      postersByBucket.set(bucketStart, [...existingPosters, poster]);
    }

    const currentBucketStart = getBucketStartTimestamp(
      Date.now(),
      analysisView
    );
    const result: AnalysisDataPoint[] = [];
    for (let i = config.size - 1; i >= 0; i -= 1) {
      const bucketStartDate = moveBucket(
        new Date(currentBucketStart),
        analysisView,
        -i
      );
      const bucketStartTimestamp = getBucketStartTimestamp(
        bucketStartDate.getTime(),
        analysisView
      );
      result.push({
        label: formatBucketLabel(bucketStartTimestamp, analysisView),
        range: formatBucketRange(bucketStartTimestamp, analysisView),
        count: counts.get(bucketStartTimestamp) || 0,
        posters: postersByBucket.get(bucketStartTimestamp) || [],
      });
    }
    return result;
  }, [analysisView, playRecords]);

  const watchFormatStats = useMemo<WatchFormatStats>(() => {
    let tv = 0;
    let movie = 0;

    for (const record of playRecords) {
      if (getWatchFormat(record) === 'tv') {
        tv += 1;
      } else {
        movie += 1;
      }
    }

    return {
      movie,
      tv,
      total: movie + tv,
    };
  }, [playRecords]);

  const watchFormatChartData = useMemo<WatchFormatChartDataPoint[]>(
    () => [
      {
        category: '内容形态',
        tv: watchFormatStats.tv,
        movie: watchFormatStats.movie,
      },
    ],
    [watchFormatStats.movie, watchFormatStats.tv]
  );

  const fetchGenresForRecord = useCallback(
    async (record: PlayRecordItem): Promise<string[]> => {
      const cached = genreCacheRef.current.get(record.key);
      if (cached) return cached;

      const { source, id } = parseStorageKey(record.key);
      const baseParams = new URLSearchParams();
      baseParams.set('mediaType', record.total_episodes > 1 ? 'tv' : 'movie');
      if (record.year) baseParams.set('year', record.year);
      if (record.cover) baseParams.set('poster', record.cover);

      const fetchGenresWithParams = async (
        params: URLSearchParams
      ): Promise<string[] | null> => {
        try {
          const response = await fetch(`/api/tmdb/detail?${params.toString()}`);
          if (!response.ok) {
            return null;
          }
          const payload = (await response.json()) as { genres?: unknown };
          const genres = Array.isArray(payload.genres)
            ? payload.genres
                .map((item) => (typeof item === 'string' ? item.trim() : ''))
                .filter(Boolean)
            : [];
          return genres;
        } catch {
          return null;
        }
      };

      if (source === 'tmdb' && /^\d+$/.test(id)) {
        const params = new URLSearchParams(baseParams);
        params.set('id', id);
        const genres = (await fetchGenresWithParams(params)) || [];
        genreCacheRef.current.set(record.key, genres);
        return genres;
      }

      const titleCandidates = buildTmdbTitleCandidates(record);
      if (titleCandidates.length === 0) {
        genreCacheRef.current.set(record.key, []);
        return [];
      }

      for (const titleCandidate of titleCandidates) {
        const params = new URLSearchParams(baseParams);
        params.set('title', titleCandidate);
        const genres = await fetchGenresWithParams(params);
        if (genres && genres.length > 0) {
          genreCacheRef.current.set(record.key, genres);
          return genres;
        }
      }

      genreCacheRef.current.set(record.key, []);
      return [];
    },
    []
  );

  useEffect(() => {
    if (activeTab !== 'analysis' || loadingPlayRecords) return;
    if (playRecords.length === 0) {
      setGenreAnalysisByScope({
        all: { data: [], posters: {} },
        movie: { data: [], posters: {} },
        tv: { data: [], posters: {} },
      });
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoadingGenreRadar(true);
      try {
        const targets = playRecords.slice(0, GENRE_ANALYSIS_MAX_ITEMS);
        const settled = await Promise.allSettled(
          targets.map((record) => fetchGenresForRecord(record))
        );

        if (cancelled) return;

        const allCountMap = new Map<SupportedGenre, number>();
        const movieCountMap = new Map<SupportedGenre, number>();
        const tvCountMap = new Map<SupportedGenre, number>();
        const allPosterMap = new Map<SupportedGenre, string[]>();
        const moviePosterMap = new Map<SupportedGenre, string[]>();
        const tvPosterMap = new Map<SupportedGenre, string[]>();

        settled.forEach((result, index) => {
          if (result.status !== 'fulfilled') return;
          const record = targets[index];
          const uniqueGenres = new Set<SupportedGenre>();

          for (const rawGenre of result.value) {
            const normalizedGenre = normalizeGenreName(rawGenre);
            if (!normalizedGenre) continue;
            uniqueGenres.add(normalizedGenre);
          }

          const recordPoster = (record?.cover || '').trim();
          const isMovie = (record?.total_episodes || 0) <= 1;
          uniqueGenres.forEach((genre) => {
            allCountMap.set(genre, (allCountMap.get(genre) || 0) + 1);
            if (isMovie) {
              movieCountMap.set(genre, (movieCountMap.get(genre) || 0) + 1);
            } else {
              tvCountMap.set(genre, (tvCountMap.get(genre) || 0) + 1);
            }

            if (!recordPoster) return;
            appendPosterToGenreMap(
              allPosterMap,
              genre,
              recordPoster,
              GENRE_TOOLTIP_POSTER_CACHE_LIMIT
            );
            if (isMovie) {
              appendPosterToGenreMap(
                moviePosterMap,
                genre,
                recordPoster,
                GENRE_TOOLTIP_POSTER_CACHE_LIMIT
              );
            } else {
              appendPosterToGenreMap(
                tvPosterMap,
                genre,
                recordPoster,
                GENRE_TOOLTIP_POSTER_CACHE_LIMIT
              );
            }
          });
        });

        const toScopeState = (
          countMap: Map<SupportedGenre, number>,
          posterMap: Map<SupportedGenre, string[]>
        ): GenreAnalysisState => {
          const data = SUPPORTED_GENRES.map((genre) => ({
            genre,
            count: countMap.get(genre) || 0,
          }))
            .filter((item) => item.count > 0)
            .sort((a, b) => b.count - a.count);

          const posters: GenrePosterMap = {};
          for (const genre of SUPPORTED_GENRES) {
            const genrePosters = (posterMap.get(genre) || []).slice(
              0,
              GENRE_TOOLTIP_POSTER_CACHE_LIMIT
            );
            if (genrePosters.length > 0) {
              posters[genre] = genrePosters;
            }
          }
          return { data, posters };
        };

        setGenreAnalysisByScope({
          all: toScopeState(allCountMap, allPosterMap),
          movie: toScopeState(movieCountMap, moviePosterMap),
          tv: toScopeState(tvCountMap, tvPosterMap),
        });
      } finally {
        if (!cancelled) setLoadingGenreRadar(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, fetchGenresForRecord, loadingPlayRecords, playRecords]);

  const activeGenreAnalysis = genreAnalysisByScope[genreScope];
  const genreRadarData = activeGenreAnalysis.data;
  const genrePosterMap = activeGenreAnalysis.posters;

  const handleGenreTooltipPosterError = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget;
      const originalSrc = image.dataset.originalSrc || '';
      const hasRetriedWithProxy = image.dataset.retryWithProxy === '1';

      if (hasRetriedWithProxy || !isHttpPosterUrl(originalSrc)) {
        image.style.display = 'none';
        return;
      }

      image.dataset.retryWithProxy = '1';
      image.src = `/api/image-proxy?url=${encodeURIComponent(originalSrc)}`;
    },
    []
  );

  const togglePlaySelection = (key: string) => {
    setSelectedPlayKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleFavoriteSelection = (key: string) => {
    setSelectedFavoriteKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handlePlayLongPressStart = useCallback(
    (key: string, pointerType: string) => {
      if (isPlayBatchMode) return;
      if (pointerType === 'mouse') return;

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        setIsPlayBatchMode(true);
        setIsFavoriteBatchMode(false);
        setSelectedFavoriteKeys(new Set());
        setSelectedPlayKeys(new Set([key]));
        suppressPlayCardClickRef.current = true;
        longPressTimerRef.current = null;
      }, LONG_PRESS_DURATION_MS);
    },
    [clearLongPressTimer, isPlayBatchMode]
  );

  const handleFavoriteLongPressStart = useCallback(
    (key: string, pointerType: string) => {
      if (isFavoriteBatchMode) return;
      if (pointerType === 'mouse') return;

      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        setIsFavoriteBatchMode(true);
        setIsPlayBatchMode(false);
        setSelectedPlayKeys(new Set());
        setSelectedFavoriteKeys(new Set([key]));
        suppressFavoriteCardClickRef.current = true;
        longPressTimerRef.current = null;
      }, LONG_PRESS_DURATION_MS);
    },
    [clearLongPressTimer, isFavoriteBatchMode]
  );

  const handleLongPressEnd = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handlePlayCardClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!suppressPlayCardClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressPlayCardClickRef.current = false;
    },
    []
  );

  const handleFavoriteCardClickCapture = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!suppressFavoriteCardClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressFavoriteCardClickRef.current = false;
    },
    []
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget === 'play') {
        const targets = playRecords.filter((item) =>
          selectedPlayKeys.has(item.key)
        );
        await Promise.all(
          targets.map((item) => {
            const { source, id } = parseStorageKey(item.key);
            return deletePlayRecord(source, id);
          })
        );
        setPlayRecords((prev) =>
          prev.filter((item) => !selectedPlayKeys.has(item.key))
        );
        setSelectedPlayKeys(new Set());
        setIsPlayBatchMode(false);
      } else {
        const targets = favoriteItems.filter((item) =>
          selectedFavoriteKeys.has(item.key)
        );
        await Promise.all(
          targets.map((item) => deleteFavorite(item.source, item.id))
        );
        setFavoriteItems((prev) =>
          prev.filter((item) => !selectedFavoriteKeys.has(item.key))
        );
        setSelectedFavoriteKeys(new Set());
        setIsFavoriteBatchMode(false);
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <PageLayout activePath='/my'>
      <div className='overflow-visible px-0 pb-4 sm:px-10 sm:pb-8'>
        <div className='space-y-8 px-4 pt-6 sm:px-0 sm:pt-8 md:pt-8'>
          <div className='flex justify-center'>
            <CapsuleSwitch
              options={[
                { label: '历史记录', value: 'play' },
                { label: '收藏夹', value: 'favorite' },
                { label: '分析', value: 'analysis' },
              ]}
              active={activeTab}
              onChange={(value) => setActiveTab(value as ActiveTab)}
            />
          </div>

          {activeTab === 'play' ? (
            <section className='space-y-4'>
              <div className='px-0'>
                <div className='relative'>
                  <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
                  <input
                    type='text'
                    value={playSearchKeyword}
                    onChange={(event) =>
                      setPlaySearchKeyword(event.target.value)
                    }
                    placeholder='搜索历史记录'
                    className='h-10 w-full rounded-xl border border-gray-200 bg-white/80 pl-9 pr-9 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300/40 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/30'
                  />
                  {playSearchKeyword ? (
                    <button
                      type='button'
                      aria-label='clear-play-search'
                      onClick={() => setPlaySearchKeyword('')}
                      className='absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                    >
                      <X className='h-4 w-4' />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className='flex items-center justify-between'>
                <h2 className='flex items-center gap-2 text-xl font-bold text-gray-800 dark:text-gray-200'>
                  <History className='h-5 w-5' />
                  {'\u6211\u7684\u5386\u53f2\u8bb0\u5f55'}
                </h2>
                {!loadingPlayRecords && playRecords.length > 0 ? (
                  isPlayBatchMode ? (
                    <div className='flex items-center gap-3'>
                      <button
                        type='button'
                        className='text-sm text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-400'
                        disabled={selectedPlayKeys.size === 0}
                        onClick={() => setDeleteTarget('play')}
                      >
                        {`\u5220\u9664 (${selectedPlayKeys.size})`}
                      </button>
                      <button
                        type='button'
                        className='text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        onClick={() => {
                          setIsPlayBatchMode(false);
                          setSelectedPlayKeys(new Set());
                        }}
                      >
                        {'\u53d6\u6d88'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type='button'
                      className='text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      onClick={() => {
                        setIsPlayBatchMode(true);
                        setIsFavoriteBatchMode(false);
                        setSelectedFavoriteKeys(new Set());
                      }}
                    >
                      {'\u6279\u91cf\u5904\u7406'}
                    </button>
                  )
                ) : null}
              </div>

              {loadingPlayRecords ? (
                <div className='px-0'>
                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div
                        key={`my-play-skeleton-${index}`}
                        className='relative aspect-[2/3] overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'
                      />
                    ))}
                  </div>
                </div>
              ) : filteredPlayRecords.length > 0 ? (
                <div className='px-0'>
                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {filteredPlayRecords.map((record) => {
                      const { source, id } = parseStorageKey(record.key);
                      const isSelected = selectedPlayKeys.has(record.key);
                      return (
                        <div
                          key={record.key}
                          className='relative'
                          onPointerDown={(event) =>
                            handlePlayLongPressStart(
                              record.key,
                              event.pointerType
                            )
                          }
                          onPointerUp={handleLongPressEnd}
                          onPointerLeave={handleLongPressEnd}
                          onPointerCancel={handleLongPressEnd}
                          onClickCapture={handlePlayCardClickCapture}
                        >
                          <VideoCard
                            id={id}
                            source={source}
                            title={record.title}
                            poster={record.cover}
                            source_name={record.source_name}
                            year={record.year}
                            episodes={record.total_episodes}
                            currentEpisode={record.index}
                            progress={getProgressPercent(record)}
                            query={record.search_title}
                            from='playrecord'
                            type={record.total_episodes > 1 ? 'tv' : ''}
                            onDelete={() =>
                              setPlayRecords((prev) =>
                                prev.filter((item) => item.key !== record.key)
                              )
                            }
                          />
                          {isPlayBatchMode ? (
                            <button
                              type='button'
                              aria-label='toggle-play-record-selection'
                              className='absolute inset-0 z-20 rounded-lg bg-black/10 transition-colors hover:bg-black/15'
                              onClick={() => togglePlaySelection(record.key)}
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
                  </div>
                </div>
              ) : (
                <div className='py-8 text-center text-sm text-gray-500 dark:text-gray-400'>
                  {playRecords.length === 0
                    ? '\u6682\u65e0\u5386\u53f2\u8bb0\u5f55'
                    : '\u672a\u627e\u5230\u5339\u914d\u7684\u5386\u53f2\u8bb0\u5f55'}
                </div>
              )}
            </section>
          ) : activeTab === 'favorite' ? (
            <section className='space-y-4'>
              <div className='px-0'>
                <div className='relative'>
                  <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
                  <input
                    type='text'
                    value={favoriteSearchKeyword}
                    onChange={(event) =>
                      setFavoriteSearchKeyword(event.target.value)
                    }
                    placeholder='搜索收藏夹'
                    className='h-10 w-full rounded-xl border border-gray-200 bg-white/80 pl-9 pr-9 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300/40 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/30'
                  />
                  {favoriteSearchKeyword ? (
                    <button
                      type='button'
                      aria-label='clear-favorite-search'
                      onClick={() => setFavoriteSearchKeyword('')}
                      className='absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                    >
                      <X className='h-4 w-4' />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className='flex items-center justify-between'>
                <h2 className='flex items-center gap-2 text-xl font-bold text-gray-800 dark:text-gray-200'>
                  <Heart className='h-5 w-5' />
                  {'\u6211\u7684\u6536\u85cf\u5939'}
                </h2>
                {!loadingFavorites && favoriteItems.length > 0 ? (
                  isFavoriteBatchMode ? (
                    <div className='flex items-center gap-3'>
                      <button
                        type='button'
                        className='text-sm text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-400'
                        disabled={selectedFavoriteKeys.size === 0}
                        onClick={() => setDeleteTarget('favorite')}
                      >
                        {`\u5220\u9664 (${selectedFavoriteKeys.size})`}
                      </button>
                      <button
                        type='button'
                        className='text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        onClick={() => {
                          setIsFavoriteBatchMode(false);
                          setSelectedFavoriteKeys(new Set());
                        }}
                      >
                        {'\u53d6\u6d88'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type='button'
                      className='text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                      onClick={() => {
                        setIsFavoriteBatchMode(true);
                        setIsPlayBatchMode(false);
                        setSelectedPlayKeys(new Set());
                      }}
                    >
                      {'\u6279\u91cf\u5904\u7406'}
                    </button>
                  )
                ) : null}
              </div>

              {loadingFavorites ? (
                <div className='px-0'>
                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div
                        key={`my-favorite-skeleton-${index}`}
                        className='relative aspect-[2/3] overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'
                      />
                    ))}
                  </div>
                </div>
              ) : filteredFavoriteItems.length > 0 ? (
                <div className='px-0'>
                  <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-[18px] sm:gap-y-8'>
                    {filteredFavoriteItems.map((item) => (
                      <div
                        key={item.key}
                        className='relative'
                        onPointerDown={(event) =>
                          handleFavoriteLongPressStart(
                            item.key,
                            event.pointerType
                          )
                        }
                        onPointerUp={handleLongPressEnd}
                        onPointerLeave={handleLongPressEnd}
                        onPointerCancel={handleLongPressEnd}
                        onClickCapture={handleFavoriteCardClickCapture}
                      >
                        <VideoCard
                          id={item.id}
                          source={item.source}
                          title={item.title}
                          poster={item.poster}
                          source_name={item.sourceName}
                          year={item.year}
                          episodes={item.episodes}
                          currentEpisode={item.currentEpisode}
                          query={item.searchTitle}
                          from='favorite'
                          type={item.episodes > 1 ? 'tv' : ''}
                        />
                        {isFavoriteBatchMode ? (
                          <button
                            type='button'
                            aria-label='toggle-favorite-selection'
                            className='absolute inset-0 z-20 rounded-lg bg-black/10 transition-colors hover:bg-black/15'
                            onClick={() => toggleFavoriteSelection(item.key)}
                          >
                            <span
                              className={`absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-bold ${
                                selectedFavoriteKeys.has(item.key)
                                  ? 'border-red-500 bg-red-500 text-white'
                                  : 'border-white/80 bg-black/40 text-transparent'
                              }`}
                            >
                              {'\u2713'}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className='px-0'>
                  <div className='py-8 text-center text-sm text-gray-500 dark:text-gray-400'>
                    {favoriteItems.length === 0
                      ? '\u6682\u65e0\u6536\u85cf\u5185\u5bb9'
                      : '\u672a\u627e\u5230\u5339\u914d\u7684\u6536\u85cf\u5185\u5bb9'}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className='space-y-4'>
              <h2 className='flex items-center gap-2 text-xl font-bold text-gray-800 dark:text-gray-200'>
                <BarChart3 className='h-5 w-5' />
                我的分析
              </h2>

              <div className='grid gap-4 lg:grid-cols-2'>
                <div className='relative z-30 overflow-visible rounded-2xl border border-zinc-800 bg-[#171717] p-3 shadow-sm dark:border-zinc-800 sm:p-5'>
                  <div className='mb-3 flex items-start justify-between gap-3'>
                    <div>
                      <p className='text-sm font-semibold text-gray-100'>
                        观看类型偏好
                      </p>
                      <p className='text-xs text-gray-400'>
                        基于类型统计最近观看内容
                      </p>
                    </div>
                    <div className='inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800'>
                      {GENRE_SCOPE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type='button'
                          onClick={() => setGenreScope(option.value)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            genreScope === option.value
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className='h-72 w-full sm:h-80'>
                    {loadingGenreRadar ? (
                      <div className='flex h-full items-center justify-center text-sm text-gray-400'>
                        正在分析类型...
                      </div>
                    ) : genreRadarData.length > 0 ? (
                      <ResponsiveContainer width='100%' height='100%'>
                        <RadarChart data={genreRadarData}>
                          <PolarGrid stroke='rgba(148,163,184,.35)' />
                          <PolarAngleAxisCompat
                            dataKey='genre'
                            tick={{ fill: '#9ca3af', fontSize: 12 }}
                          />
                          <Tooltip
                            cursor={false}
                            allowEscapeViewBox={{ x: true, y: true }}
                            wrapperStyle={{
                              zIndex: 9999,
                              pointerEvents: 'none',
                            }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const genre =
                                typeof payload[0]?.payload?.genre === 'string'
                                  ? payload[0].payload.genre
                                  : '';
                              const posters =
                                genre &&
                                (genre as SupportedGenre) in genrePosterMap
                                  ? genrePosterMap[genre as SupportedGenre] ||
                                    []
                                  : [];
                              const displayPosters = posters.slice(
                                0,
                                GENRE_TOOLTIP_POSTER_LIMIT
                              );
                              const hasMorePosters =
                                posters.length > GENRE_TOOLTIP_POSTER_LIMIT;
                              const value = payload[0]?.value;
                              const numericValue =
                                typeof value === 'number'
                                  ? value
                                  : Number(value || 0);

                              return (
                                <div className='relative z-[9999] rounded-xl border border-zinc-700 bg-black/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-sm'>
                                  <p className='mb-1 text-[11px] text-white/70'>
                                    类型偏好
                                  </p>
                                  <div className='flex items-center gap-2'>
                                    <span className='inline-block h-2 w-2 rounded-full bg-cyan-400' />
                                    <span className='text-white/85'>
                                      {genre}
                                    </span>
                                    <span className='font-semibold text-white'>
                                      {Number.isFinite(numericValue)
                                        ? numericValue
                                        : 0}{' '}
                                      部
                                    </span>
                                  </div>
                                  {displayPosters.length > 0 ? (
                                    <div className='mt-2 flex items-center gap-1.5'>
                                      {displayPosters.map((poster, index) => {
                                        const normalizedPoster =
                                          normalizePosterUrl(poster);
                                        return (
                                          <img
                                            key={`${genre}-poster-${index}`}
                                            src={processImageUrl(
                                              normalizedPoster
                                            )}
                                            data-original-src={normalizedPoster}
                                            alt={`${genre} 海报 ${index + 1}`}
                                            className='h-24 w-16 rounded object-cover ring-1 ring-white/10'
                                            referrerPolicy='no-referrer'
                                            loading='lazy'
                                            decoding='async'
                                            onError={
                                              handleGenreTooltipPosterError
                                            }
                                          />
                                        );
                                      })}
                                      {hasMorePosters ? (
                                        <div className='flex h-24 w-16 items-center justify-center rounded bg-white/5 text-xl leading-none font-bold text-white/80 ring-1 ring-white/10'>
                                          ...
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <p className='mt-2 text-[11px] text-white/55'>
                                      暂无最近海报
                                    </p>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Radar
                            dataKey='count'
                            stroke='#06b6d4'
                            fill='#06b6d4'
                            fillOpacity={0.35}
                            dot={{ r: 3, fillOpacity: 1 }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className='flex h-full items-center justify-center text-sm text-gray-400'>
                        暂无可用类型数据
                      </div>
                    )}
                  </div>
                </div>

                <div className='relative z-20 overflow-visible rounded-2xl border border-zinc-800 bg-[#171717] p-3 shadow-sm dark:border-zinc-800 sm:p-5'>
                  <div className='mb-3'>
                    <p className='text-sm font-semibold text-gray-100'>
                      内容形态分布
                    </p>
                    <p className='text-xs text-gray-400'>
                      按历史记录区分电影与连续剧
                    </p>
                  </div>
                  <div className='relative h-72 w-full overflow-visible sm:h-80'>
                    {loadingPlayRecords ? (
                      <div className='flex h-full items-center justify-center text-sm text-gray-400'>
                        正在统计内容形态...
                      </div>
                    ) : watchFormatStats.total > 0 ? (
                      <div className='relative z-20 h-full w-full overflow-visible'>
                        <ResponsiveContainer width='100%' height='100%'>
                          <RadialBarChart
                            data={watchFormatChartData}
                            startAngle={180}
                            endAngle={0}
                            innerRadius={80}
                            outerRadius={130}
                            cy='56%'
                          >
                            <PolarAngleAxisNumberCompat
                              type='number'
                              domain={[0, Math.max(watchFormatStats.total, 1)]}
                              tick={false}
                            />
                            <PolarRadiusAxis
                              tick={false}
                              tickLine={false}
                              axisLine={false}
                            >
                              <Label content={() => null} />
                            </PolarRadiusAxis>
                            <Tooltip
                              cursor={false}
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const fallbackKey = payload.find((entry) => {
                                  const key = String(entry?.dataKey || '');
                                  return key === 'tv' || key === 'movie';
                                })?.dataKey;

                                const key =
                                  watchFormatHoverKey ||
                                  (String(fallbackKey) as 'movie' | 'tv');
                                if (key !== 'movie' && key !== 'tv')
                                  return null;

                                const value = Number(
                                  payload.find(
                                    (entry) =>
                                      String(entry?.dataKey || '') === key
                                  )?.value || 0
                                );
                                const total =
                                  watchFormatStats.total > 0
                                    ? watchFormatStats.total
                                    : 1;
                                const percent = (value / total) * 100;

                                return (
                                  <div className='rounded-xl border border-zinc-700 bg-black/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-sm'>
                                    <p className='mb-1 text-[11px] text-white/70'>
                                      内容形态
                                    </p>
                                    <div className='flex items-center gap-2'>
                                      <span
                                        className='inline-block h-2 w-2 rounded-full'
                                        style={{
                                          backgroundColor:
                                            WATCH_FORMAT_COLORS[key],
                                        }}
                                      />
                                      <span className='text-white/85'>
                                        {WATCH_FORMAT_LABELS[key]}
                                      </span>
                                      <span className='font-semibold text-white'>
                                        {value} 条 · {percent.toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <RadialBar
                              dataKey='tv'
                              stackId='watch-format'
                              cornerRadius={5}
                              fill={WATCH_FORMAT_COLORS.tv}
                              onMouseEnter={() => setWatchFormatHoverKey('tv')}
                              onMouseLeave={() => setWatchFormatHoverKey(null)}
                              className='stroke-transparent stroke-2'
                            />
                            <RadialBar
                              dataKey='movie'
                              stackId='watch-format'
                              cornerRadius={5}
                              fill={WATCH_FORMAT_COLORS.movie}
                              onMouseEnter={() =>
                                setWatchFormatHoverKey('movie')
                              }
                              onMouseLeave={() => setWatchFormatHoverKey(null)}
                              className='stroke-transparent stroke-2'
                            />
                          </RadialBarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className='flex h-full items-center justify-center text-sm text-gray-400'>
                        暂无可用统计数据
                      </div>
                    )}
                    {watchFormatStats.total > 0 ? (
                      <div className='pointer-events-none absolute left-1/2 top-[62%] z-0 -translate-x-1/2 -translate-y-1/2 text-center'>
                        <p className='text-2xl font-bold text-white'>
                          {watchFormatStats.total.toLocaleString()}
                        </p>
                        <p className='text-xs text-gray-400'>总观看</p>
                      </div>
                    ) : null}
                  </div>
                  <div className='mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400'>
                    <div className='inline-flex items-center gap-1.5'>
                      <span
                        className='inline-block h-2.5 w-2.5 rounded-full'
                        style={{ backgroundColor: '#22d3ee' }}
                      />
                      <span>连续剧</span>
                      <span className='text-gray-300'>
                        {watchFormatStats.tv}
                      </span>
                    </div>
                    <div className='inline-flex items-center gap-1.5'>
                      <span
                        className='inline-block h-2.5 w-2.5 rounded-full'
                        style={{ backgroundColor: '#60a5fa' }}
                      />
                      <span>电影</span>
                      <span className='text-gray-300'>
                        {watchFormatStats.movie}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className='relative z-0 rounded-2xl border border-zinc-800 bg-[#171717] p-3 shadow-sm dark:border-zinc-800 sm:p-5'>
                <div className='mb-3 flex items-start justify-between gap-3'>
                  <div>
                    <p className='text-sm font-semibold text-gray-900 dark:text-gray-100'>
                      {ANALYSIS_VIEW_CONFIG[analysisView].title}
                    </p>
                    <p className='text-xs text-gray-500 dark:text-gray-400'>
                      {ANALYSIS_VIEW_CONFIG[analysisView].description}
                    </p>
                  </div>
                  <div className='inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800'>
                    {(Object.keys(ANALYSIS_VIEW_CONFIG) as AnalysisView[]).map(
                      (view) => (
                        <button
                          key={view}
                          type='button'
                          onClick={() => setAnalysisView(view)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            analysisView === view
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                          }`}
                        >
                          {ANALYSIS_VIEW_CONFIG[view].buttonLabel}
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div className='h-72 w-full sm:h-80'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart
                      data={analysisChartData}
                      margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray='3 3' vertical={false} />
                      <XAxis
                        dataKey='label'
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={24}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        width={26}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(96,165,250,0.08)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0]?.payload as
                            | AnalysisDataPoint
                            | undefined;
                          const range =
                            row && typeof row.range === 'string'
                              ? row.range
                              : '';
                          const value = payload[0]?.value;
                          const numericValue =
                            typeof value === 'number'
                              ? value
                              : Number(value || 0);
                          const posters = row?.posters || [];
                          const displayPosters = posters.slice(
                            0,
                            GENRE_TOOLTIP_POSTER_LIMIT
                          );
                          const hasMorePosters =
                            posters.length > GENRE_TOOLTIP_POSTER_LIMIT;

                          return (
                            <div className='rounded-xl border border-zinc-700 bg-black/90 px-3 py-2 text-xs text-white shadow-xl backdrop-blur-sm'>
                              <p className='mb-1 text-[11px] text-white/70'>
                                {range}
                              </p>
                              <div className='flex items-center gap-2'>
                                <span className='inline-block h-2 w-2 rounded-full bg-sky-400' />
                                <span className='text-white/85'>观看数</span>
                                <span className='font-semibold text-white'>
                                  {Number.isFinite(numericValue)
                                    ? numericValue
                                    : 0}{' '}
                                  次
                                </span>
                              </div>
                              {displayPosters.length > 0 ? (
                                <div className='mt-2 flex items-center gap-1.5'>
                                  {displayPosters.map((poster, index) => {
                                    const normalizedPoster =
                                      normalizePosterUrl(poster);
                                    return (
                                      <img
                                        key={`analysis-poster-${range}-${index}`}
                                        src={processImageUrl(normalizedPoster)}
                                        data-original-src={normalizedPoster}
                                        alt={`时间段海报 ${index + 1}`}
                                        className='h-24 w-16 rounded object-cover ring-1 ring-white/10'
                                        referrerPolicy='no-referrer'
                                        loading='lazy'
                                        decoding='async'
                                        onError={handleGenreTooltipPosterError}
                                      />
                                    );
                                  })}
                                  {hasMorePosters ? (
                                    <div className='flex h-24 w-16 items-center justify-center rounded bg-white/5 text-xl leading-none font-bold text-white/80 ring-1 ring-white/10'>
                                      ...
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <p className='mt-2 text-[11px] text-white/55'>
                                  暂无最近海报
                                </p>
                              )}
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey='count'
                        fill='#60a5fa'
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className='w-[min(92vw,24rem)] max-w-sm overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/90 p-6 text-zinc-900 shadow-[0_30px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/85 dark:text-zinc-100'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {'\u786e\u8ba4\u5220\u9664\u5417\uff1f'}
            </AlertDialogTitle>
            <AlertDialogDescription className='text-zinc-600 dark:text-zinc-300'>
              {deleteTarget === 'play'
                ? `\u5c06\u5220\u9664 ${selectedPlayKeys.size} \u6761\u5386\u53f2\u8bb0\u5f55\u3002`
                : `\u5c06\u5220\u9664 ${selectedFavoriteKeys.size} \u9879\u6536\u85cf\u3002`}
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
    </PageLayout>
  );
}

export default function MyPage() {
  return (
    <Suspense>
      <MyPageClient />
    </Suspense>
  );
}
