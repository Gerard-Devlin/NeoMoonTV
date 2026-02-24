/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  CheckCircle,
  Heart,
  Star,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import { ImagePlaceholder } from '@/components/ImagePlaceholder';
import TmdbDetailModal from '@/components/TmdbDetailModal';
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

interface VideoCardProps {
  id?: string;
  source?: string;
  title?: string;
  query?: string;
  poster?: string;
  episodes?: number;
  source_name?: string;
  progress?: number;
  year?: string;
  from: 'playrecord' | 'favorite' | 'search' | 'douban';
  currentEpisode?: number;
  douban_id?: string;
  onDelete?: () => void;
  rate?: string;
  items?: SearchResult[];
  type?: string;
}

type TmdbMediaType = 'movie' | 'tv';

interface TmdbDetailCastItem {
  id: number;
  name: string;
  character: string;
}

interface TmdbCardDetail {
  id: number;
  mediaType: TmdbMediaType;
  title: string;
  logo?: string;
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

interface TmdbDetailLookupInput {
  title: string;
  year: string;
  mediaType: TmdbMediaType;
  poster?: string;
  score?: string;
}

interface TmdbDetailRawGenre {
  name?: string;
}

interface TmdbDetailRawCast {
  id?: number;
  name?: string;
  character?: string;
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

interface TmdbSearchResultItem {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
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

const TMDB_CLIENT_API_KEY =
  process.env.NEXT_PUBLIC_TMDB_API_KEY || '';
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';
const TMDB_DETAIL_CLIENT_CACHE_TTL_MS = 10 * 60 * 1000;
const TMDB_DETAIL_CLIENT_CACHE_MAX_ENTRIES = 240;
const TMDB_DETAIL_PREFETCH_CONCURRENCY = 2;
const TMDB_DETAIL_PREFETCH_MAX_TOTAL = 48;

interface TmdbDetailClientCacheEntry {
  expiresAt: number;
  payload: TmdbCardDetail;
}

const tmdbDetailClientCache = new Map<string, TmdbDetailClientCacheEntry>();
const tmdbDetailClientPending = new Map<string, Promise<TmdbCardDetail>>();
const tmdbDetailPrefetchQueue: Array<() => void> = [];
const tmdbDetailPrefetchScheduledKeys = new Set<string>();
let tmdbDetailPrefetchActiveCount = 0;
let tmdbDetailPrefetchTotalCount = 0;

function normalizeYear(value?: string): string {
  const year = (value || '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

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

function toImageUrl(path?: string | null, size = 'w500'): string {
  if (!path) return '';
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

function selectBestLogoPath(logos: TmdbLogoItem[]): string {
  if (!logos.length) return '';

  const getLanguagePriority = (lang?: string | null): number => {
    if (lang === 'zh') return 4;
    if (lang === 'en') return 3;
    if (lang === null || lang === undefined) return 2;
    return 1;
  };

  const sorted = logos
    .filter((logo) => logo.file_path)
    .sort((a, b) => {
      const lp =
        getLanguagePriority(b.iso_639_1) - getLanguagePriority(a.iso_639_1);
      if (lp !== 0) return lp;
      const vr = (b.vote_average || 0) - (a.vote_average || 0);
      if (vr !== 0) return vr;
      return (b.width || 0) - (a.width || 0);
    });

  return sorted[0]?.file_path || '';
}

function normalizeMediaType(value?: string, episodes?: number): TmdbMediaType {
  if (value === 'tv' || value === 'show') return 'tv';
  if (value === 'movie') return 'movie';
  if (typeof episodes === 'number' && episodes > 1) return 'tv';
  return 'movie';
}

function normalizeDetailCacheTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildTmdbDetailCacheKey(input: TmdbDetailLookupInput): string {
  const normalizedTitle = normalizeDetailCacheTitle(input.title);
  const normalizedYear = normalizeYear(input.year) || 'unknown';
  return `${input.mediaType}:${normalizedTitle}:${normalizedYear}`;
}

function canUseTmdbDetailPrefetch(): boolean {
  if (typeof navigator === 'undefined') return true;

  const connection = (navigator as Navigator & {
    connection?: {
      saveData?: boolean;
      effectiveType?: string;
    };
  }).connection;

  if (!connection) return true;
  if (connection.saveData) return false;

  const effectiveType = (connection.effectiveType || '').toLowerCase();
  if (effectiveType === 'slow-2g' || effectiveType === '2g') {
    return false;
  }

  return true;
}

function pruneTmdbDetailClientCache(): void {
  while (tmdbDetailClientCache.size > TMDB_DETAIL_CLIENT_CACHE_MAX_ENTRIES) {
    const oldestKey = tmdbDetailClientCache.keys().next().value;
    if (!oldestKey) break;
    tmdbDetailClientCache.delete(oldestKey);
  }
}

function readTmdbDetailClientCache(key: string): TmdbCardDetail | null {
  const hit = tmdbDetailClientCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    tmdbDetailClientCache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeTmdbDetailClientCache(
  key: string,
  payload: TmdbCardDetail
): void {
  tmdbDetailClientCache.set(key, {
    payload,
    expiresAt: Date.now() + TMDB_DETAIL_CLIENT_CACHE_TTL_MS,
  });
  pruneTmdbDetailClientCache();
}

function pumpTmdbDetailPrefetchQueue(): void {
  while (
    tmdbDetailPrefetchActiveCount < TMDB_DETAIL_PREFETCH_CONCURRENCY &&
    tmdbDetailPrefetchQueue.length > 0
  ) {
    const runner = tmdbDetailPrefetchQueue.shift();
    if (!runner) return;
    tmdbDetailPrefetchActiveCount += 1;
    runner();
  }
}

function enqueueTmdbDetailPrefetch(task: () => Promise<void>): void {
  tmdbDetailPrefetchQueue.push(() => {
    task()
      .catch(() => {
        // ignore prefetch errors to keep interaction path clean
      })
      .finally(() => {
        tmdbDetailPrefetchActiveCount = Math.max(
          0,
          tmdbDetailPrefetchActiveCount - 1
        );
        pumpTmdbDetailPrefetchQueue();
      });
  });

  pumpTmdbDetailPrefetchQueue();
}

function hasSeasonHint(value: string): boolean {
  const text = (value || '').toLowerCase();
  if (!text.trim()) return false;
  return (
    /\u7b2c\s*[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24\d]+\s*\u5b63/.test(
      text
    ) ||
    /(?:season|series|s)\s*0*\d{1,2}/i.test(text)
  );
}

function stripSeasonHint(value: string): string {
  return (value || '')
    .replace(
      /\u7b2c\s*[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24\d]+\s*\u5b63/gi,
      ' '
    )
    .replace(/(?:season|series|s)\s*0*\d{1,2}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LOOKUP_TITLE_PUNCTUATION_PATTERN =
  /[\u2018\u2019\u201c\u201d'"`.,;:!?()[\]{}<>/\-|\\\u3001\u3002\uFF0C\uFF01\uFF1F\u300a\u300b\u300c\u300d\u300e\u300f\u3010\u3011]+/g;
const LOOKUP_ENGLISH_SEASON_DETECT_PATTERN = /\b(?:season|series|s)\s*0*\d{1,2}\b/i;
const LOOKUP_CHINESE_SEASON_DETECT_PATTERN =
  /\u7b2c\s*[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24\d]+\s*(?:\u5b63|\u90e8|\u8f91)/i;
const LOOKUP_SPECIAL_FEATURE_KEYWORD_PATTERN =
  /(?:\u5e55\u540e|\u7279\u8f91|\u91cd\u9022|\u82b1\u7d6e|\u5236\u4f5c|\u7eaa\u5f55|\u756a\u5916|\u885d\u751f|making of|behind the scenes|behind the curtain|reunion|special|featurette|documentary)/i;

function normalizeLookupTitle(value: string): string {
  return stripSeasonHint(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(LOOKUP_TITLE_PUNCTUATION_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasSeasonIntentForLookup(value: string): boolean {
  const normalized = (value || '').normalize('NFKC');
  return (
    LOOKUP_ENGLISH_SEASON_DETECT_PATTERN.test(normalized) ||
    LOOKUP_CHINESE_SEASON_DETECT_PATTERN.test(normalized)
  );
}

function buildLookupSearchQueries(value: string): string[] {
  const variants = new Set<string>();
  const push = (input: string) => {
    const normalized = (input || '').trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    variants.add(normalized);
  };

  const raw = (value || '').trim();
  push(raw);
  push(stripSeasonHint(raw));
  return Array.from(variants);
}

function buildLookupQueryVariants(value: string): string[] {
  return buildLookupSearchQueries(value)
    .map((item) => normalizeLookupTitle(item))
    .filter(Boolean);
}

function buildLookupResultTitleVariants(candidate: TmdbSearchResultItem): string[] {
  const variants = new Set<string>();
  const push = (input?: string) => {
    const normalized = normalizeLookupTitle(input || '');
    if (!normalized) return;
    variants.add(normalized);
  };

  push(candidate.title);
  push(candidate.name);
  push(candidate.original_title);
  push(candidate.original_name);
  return Array.from(variants);
}

function scoreLookupTitleSimilarity(
  queryVariants: string[],
  candidateVariants: string[]
): number {
  let best = 0;

  for (const queryVariant of queryVariants) {
    for (const candidateVariant of candidateVariants) {
      if (!queryVariant || !candidateVariant) continue;
      if (queryVariant === candidateVariant) {
        best = Math.max(best, 1);
        continue;
      }

      const longer =
        queryVariant.length >= candidateVariant.length
          ? queryVariant
          : candidateVariant;
      const shorter =
        queryVariant.length >= candidateVariant.length
          ? candidateVariant
          : queryVariant;

      if (!longer.includes(shorter)) continue;
      const coverage = shorter.length / longer.length;
      const score =
        coverage >= 0.92
          ? 0.98
          : coverage >= 0.75
            ? 0.9
            : coverage >= 0.6
              ? 0.8
              : coverage >= 0.45
                ? 0.68
                : coverage * 0.4;
      if (score > best) best = score;
    }
  }

  return best;
}

function scoreLookupYearMatch(inputYear: string, candidateYear: string): number {
  if (!inputYear || !candidateYear) return 0;
  const delta = Math.abs(Number(inputYear) - Number(candidateYear));
  if (!Number.isFinite(delta)) return 0;
  if (delta === 0) return 0.08;
  if (delta === 1) return 0.03;
  if (delta >= 2) return -0.08;
  return 0;
}

function scoreLookupSpecialFeaturePenalty(
  hasSeasonIntent: boolean,
  candidateVariants: string[]
): number {
  if (!hasSeasonIntent) return 0;
  const hasSpecialKeyword = candidateVariants.some((titleVariant) =>
    LOOKUP_SPECIAL_FEATURE_KEYWORD_PATTERN.test(titleVariant)
  );
  return hasSpecialKeyword ? -0.26 : 0;
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

async function resolveTmdbTargetFromTitle(
  title: string,
  year: string,
  mediaType: TmdbMediaType
): Promise<{ id: number; mediaType: TmdbMediaType } | null> {
  if (!TMDB_CLIENT_API_KEY) return null;

  const queryHasSeasonIntent = hasSeasonIntentForLookup(title);
  const primaryMediaType: TmdbMediaType = queryHasSeasonIntent ? 'tv' : mediaType;
  const otherType: TmdbMediaType = primaryMediaType === 'movie' ? 'tv' : 'movie';
  const searchQueryVariants = buildLookupSearchQueries(title);
  const queryTitleVariants = buildLookupQueryVariants(title);
  const minSimilarityThreshold = 0.34;
  const attempts: Array<{
    endpoint: 'movie' | 'tv' | 'multi';
    year?: string;
  }> = queryHasSeasonIntent
    ? [
        // Season queries should not rely on first-air year in the first pass.
        { endpoint: 'tv' },
        { endpoint: 'tv', year },
        { endpoint: otherType },
        { endpoint: otherType, year },
        { endpoint: 'multi' },
      ]
    : [
        { endpoint: primaryMediaType, year },
        { endpoint: primaryMediaType },
        { endpoint: otherType, year },
        { endpoint: otherType },
        { endpoint: 'multi' },
      ];

  for (const attempt of attempts) {
    for (const searchQuery of searchQueryVariants) {
      const params = new URLSearchParams({
        api_key: TMDB_CLIENT_API_KEY,
        language: 'zh-CN',
        include_adult: 'false',
        query: searchQuery,
        page: '1',
      });

      if (attempt.year && attempt.endpoint !== 'multi') {
        params.set(
          attempt.endpoint === 'movie' ? 'year' : 'first_air_date_year',
          attempt.year
        );
      }

      try {
        const response = await fetch(
          `${TMDB_API_BASE_URL}/search/${attempt.endpoint}?${params.toString()}`,
          { cache: 'no-store' }
        );
        if (!response.ok) continue;

        const payload = (await response.json()) as {
          results?: TmdbSearchResultItem[];
        };
        const candidates = (payload.results || []).slice(0, 8);
        let bestCandidate:
          | {
              id: number;
              mediaType: TmdbMediaType;
              score: number;
            }
          | null = null;

        for (const candidate of candidates) {
          const candidateId = Number(candidate.id);
          if (!Number.isInteger(candidateId) || candidateId <= 0) continue;

          const candidateMediaType: TmdbMediaType | null =
            attempt.endpoint === 'multi'
              ? candidate.media_type === 'movie' || candidate.media_type === 'tv'
                ? candidate.media_type
                : null
              : attempt.endpoint;
          if (!candidateMediaType) continue;

          const candidateTitleVariants = buildLookupResultTitleVariants(candidate);
          if (candidateTitleVariants.length === 0) continue;

          const titleScore = scoreLookupTitleSimilarity(
            queryTitleVariants,
            candidateTitleVariants
          );
          if (titleScore <= 0) continue;

          const candidateYear = toYear(
            candidate.release_date || candidate.first_air_date
          );
          const mediaBoost =
            queryHasSeasonIntent && candidateMediaType === 'tv' ? 0.05 : 0;
          const finalScore =
            titleScore +
            scoreLookupYearMatch(year, candidateYear) +
            scoreLookupSpecialFeaturePenalty(
              queryHasSeasonIntent,
              candidateTitleVariants
            ) +
            mediaBoost;

          if (!bestCandidate || finalScore > bestCandidate.score) {
            bestCandidate = {
              id: candidateId,
              mediaType: candidateMediaType,
              score: finalScore,
            };
          }
        }

        if (bestCandidate && bestCandidate.score >= minSimilarityThreshold) {
          return {
            id: bestCandidate.id,
            mediaType: bestCandidate.mediaType,
          };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

async function fetchTmdbLogo(
  mediaType: TmdbMediaType,
  id: number
): Promise<string> {
  if (!TMDB_CLIENT_API_KEY) return '';

  try {
    const params = new URLSearchParams({
      api_key: TMDB_CLIENT_API_KEY,
      include_image_language: 'zh,en,null',
    });
    const response = await fetch(
      `${TMDB_API_BASE_URL}/${mediaType}/${id}/images?${params.toString()}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return '';

    const data = (await response.json()) as TmdbImagesResponse;
    const logoPath = selectBestLogoPath(data.logos || []);
    return logoPath ? `${TMDB_IMAGE_BASE_URL}/w500${logoPath}` : '';
  } catch {
    return '';
  }
}

async function fetchTmdbDetailByTitle(
  input: TmdbDetailLookupInput
): Promise<TmdbCardDetail> {
  const routeParams = new URLSearchParams({
    title: input.title,
    type: input.mediaType,
  });
  if (input.year) {
    routeParams.set('year', input.year);
  }
  if (input.poster) {
    routeParams.set('poster', input.poster);
  }
  if (input.score) {
    routeParams.set('score', input.score);
  }

  try {
    const routeResponse = await fetch(
      `/api/tmdb/detail?${routeParams.toString()}`
    );
    if (routeResponse.ok) {
      return (await routeResponse.json()) as TmdbCardDetail;
    }
  } catch {
    // Fallback to direct TMDB calls below.
  }

  const resolved = await resolveTmdbTargetFromTitle(
    input.title,
    input.year,
    input.mediaType
  );
  if (!resolved) {
    throw new Error('TMDB detail request failed: 404');
  }

  const appendToResponse =
    resolved.mediaType === 'movie'
      ? 'credits,videos,release_dates'
      : 'credits,videos,content_ratings';

  const params = new URLSearchParams({
    api_key: TMDB_CLIENT_API_KEY,
    language: 'zh-CN',
    append_to_response: appendToResponse,
  });

  const [response, logo] = await Promise.all([
    fetch(
      `${TMDB_API_BASE_URL}/${resolved.mediaType}/${resolved.id}?${params.toString()}`,
      { cache: 'no-store' }
    ),
    fetchTmdbLogo(resolved.mediaType, resolved.id),
  ]);

  if (!response.ok) {
    throw new Error(`TMDB detail request failed: ${response.status}`);
  }

  const raw = (await response.json()) as TmdbDetailRawResponse;

  const cast = (raw.credits?.cast || [])
    .slice(0, 8)
    .map((member) => ({
      id: member.id ?? 0,
      name: member.name || '',
      character: member.character || '',
    }))
    .filter((member) => member.id > 0 && member.name);

  const contentRating =
    resolved.mediaType === 'movie'
      ? pickMovieContentRatingFromRaw(raw)
      : pickTvContentRatingFromRaw(raw);

  const runtime =
    resolved.mediaType === 'movie'
      ? (raw.runtime ?? null)
      : (raw.episode_run_time?.[0] ?? null);

  return {
    id: raw.id || resolved.id,
    mediaType: resolved.mediaType,
    title: (raw.title || raw.name || input.title || '').trim(),
    logo: logo || undefined,
    overview: (raw.overview || '').trim() || 'No overview available.',
    backdrop: toImageUrl(raw.backdrop_path, 'original'),
    poster: toImageUrl(raw.poster_path, 'w500') || input.poster || '',
    score: toScore(raw.vote_average) || input.score || '',
    voteCount: raw.vote_count || 0,
    year: toYear(raw.release_date || raw.first_air_date) || input.year,
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

async function fetchTmdbDetailWithClientCache(
  input: TmdbDetailLookupInput
): Promise<TmdbCardDetail> {
  const cacheKey = buildTmdbDetailCacheKey(input);
  const cached = readTmdbDetailClientCache(cacheKey);
  if (cached) return cached;

  const pending = tmdbDetailClientPending.get(cacheKey);
  if (pending) return pending;

  const request = fetchTmdbDetailByTitle(input)
    .then((payload) => {
      writeTmdbDetailClientCache(cacheKey, payload);
      return payload;
    })
    .finally(() => {
      tmdbDetailClientPending.delete(cacheKey);
    });

  tmdbDetailClientPending.set(cacheKey, request);
  return request;
}

function scheduleTmdbDetailPrefetch(input: TmdbDetailLookupInput): void {
  if (!input.title.trim()) return;
  if (!canUseTmdbDetailPrefetch()) return;
  if (tmdbDetailPrefetchTotalCount >= TMDB_DETAIL_PREFETCH_MAX_TOTAL) return;

  const cacheKey = buildTmdbDetailCacheKey(input);
  if (readTmdbDetailClientCache(cacheKey)) return;
  if (tmdbDetailClientPending.has(cacheKey)) return;
  if (tmdbDetailPrefetchScheduledKeys.has(cacheKey)) return;

  tmdbDetailPrefetchScheduledKeys.add(cacheKey);
  tmdbDetailPrefetchTotalCount += 1;

  enqueueTmdbDetailPrefetch(async () => {
    try {
      await fetchTmdbDetailWithClientCache(input);
    } finally {
      tmdbDetailPrefetchScheduledKeys.delete(cacheKey);
    }
  });
}

export default function VideoCard({
  id,
  title = '',
  query = '',
  poster = '',
  episodes,
  source,
  source_name,
  progress = 0,
  year,
  from,
  currentEpisode,
  douban_id,
  onDelete,
  rate,
  items,
  type = '',
}: VideoCardProps) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<TmdbCardDetail | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [favoriteDeleteDialogOpen, setFavoriteDeleteDialogOpen] =
    useState(false);
  const [favoriteDeleteLoading, setFavoriteDeleteLoading] = useState(false);
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [seasonPickerData, setSeasonPickerData] = useState<{
    baseTitle: string;
    year: string;
    seasonCount: number;
  }>({
    baseTitle: '',
    year: '',
    seasonCount: 0,
  });
  const detailCacheRef = useRef<Record<string, TmdbCardDetail>>({});
  const detailRequestIdRef = useRef(0);
  const suppressCardClickUntilRef = useRef(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const hasScheduledPrefetchRef = useRef(false);

  const isAggregate = from === 'search' && !!items?.length;

  const aggregateData = useMemo(() => {
    if (!isAggregate || !items) return null;
    const countMap = new Map<string | number, number>();
    const episodeCountMap = new Map<number, number>();
    items.forEach((item) => {
      if (item.douban_id && item.douban_id !== 0) {
        countMap.set(item.douban_id, (countMap.get(item.douban_id) || 0) + 1);
      }
      const totalEpisodes =
        typeof item.total_episodes === 'number' && item.total_episodes > 0
          ? Math.floor(item.total_episodes)
          : item.source === 'tmdb' &&
              (item.type_name || '').trim().toLowerCase() === 'tv'
            ? 0
            : item.episodes?.length || 0;
      if (totalEpisodes > 0) {
        episodeCountMap.set(
          totalEpisodes,
          (episodeCountMap.get(totalEpisodes) || 0) + 1
        );
      }
    });

    const getMostFrequent = <T extends string | number>(
      map: Map<T, number>
    ) => {
      let maxCount = 0;
      let result: T | undefined;
      map.forEach((cnt, key) => {
        if (cnt > maxCount) {
          maxCount = cnt;
          result = key;
        }
      });
      return result;
    };

    return {
      first: items[0],
      mostFrequentDoubanId: getMostFrequent(countMap),
      mostFrequentEpisodes: getMostFrequent(episodeCountMap) || 0,
    };
  }, [isAggregate, items]);

  const actualTitle = aggregateData?.first.title ?? title;
  const actualPoster = aggregateData?.first.poster ?? poster;
  const actualSource = aggregateData?.first.source ?? source;
  const actualId = aggregateData?.first.id ?? id;
  const actualDoubanId = String(
    aggregateData?.mostFrequentDoubanId ?? douban_id
  );
  const hasDoubanId =
    Boolean(actualDoubanId) &&
    !['undefined', 'null', '0'].includes(actualDoubanId);
  const actualEpisodes = aggregateData?.mostFrequentEpisodes ?? episodes;
  const actualYear = aggregateData?.first.year ?? year;
  const actualQuery = query || '';
  const seasonPickerBackdrop =
    detailData?.backdrop ||
    detailData?.poster ||
    (actualPoster ? processImageUrl(actualPoster) : '');
  const aggregateFirstTypeName = (aggregateData?.first.type_name || '')
    .trim()
    .toLowerCase();
  const aggregateFirstEpisodeCount =
    typeof aggregateData?.first.total_episodes === 'number' &&
    aggregateData.first.total_episodes > 0
      ? Math.floor(aggregateData.first.total_episodes)
      : aggregateData?.first.source === 'tmdb' && aggregateFirstTypeName === 'tv'
        ? 0
      : aggregateData?.first.episodes?.length || 0;
  const actualSearchType = isAggregate
    ? aggregateFirstTypeName === 'tv'
      ? 'tv'
      : aggregateFirstTypeName === 'movie'
        ? 'movie'
        : aggregateFirstEpisodeCount === 1
          ? 'movie'
          : 'tv'
    : type;
  const tmdbTrigger = useMemo<TmdbDetailLookupInput>(
    () => ({
      title: (actualTitle || '').trim(),
      year: normalizeYear(actualYear),
      mediaType: normalizeMediaType(actualSearchType, actualEpisodes),
      poster: actualPoster,
      score: rate || '',
    }),
    [actualTitle, actualYear, actualSearchType, actualEpisodes, actualPoster, rate]
  );
  const tmdbDetailCacheKey = useMemo(
    () => buildTmdbDetailCacheKey(tmdbTrigger),
    [tmdbTrigger]
  );

  // 闁兼儳鍢茶ぐ鍥绩閹増顥戦柣妯垮煐閳?
  useEffect(() => {
    if (from === 'douban' || !actualSource || !actualId) return;

    const fetchFavoriteStatus = async () => {
      try {
        const fav = await isFavorited(actualSource, actualId);
        setFavorited(fav);
      } catch (err) {
        throw new Error('Failed to check favorite status');
      }
    };

    fetchFavoriteStatus();

    // 闁烩晜鍨甸幆澶愬绩閹増顥戦柣妯垮煐閳ь兛鐒﹀ú鍧楀棘妫颁胶鐨戝ù?
    const storageKey = generateStorageKey(actualSource, actualId);
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        // 婵☆偀鍋撻柡灞诲劚缂嶅宕滃澶堚偓宥夋儎椤旇姤笑闁告熬绠戝﹢顏堝棘閹殿喗鐣遍柡鈧幆鐗堫棏闁告帗顨夐妴鍐╃▔?
        const isNowFavorited = !!newFavorites[storageKey];
        setFavorited(isNowFavorited);
      }
    );

    return unsubscribe;
  }, [from, actualSource, actualId]);

  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (from === 'douban' || !actualSource || !actualId) return;
      try {
        if (favorited) {
          if (from === 'favorite') {
            setFavoriteDeleteDialogOpen(true);
            return;
          }
          // 濠碘€冲€归悘澶婎啅閸欏鏆柦妯洪獜缁辨繈宕氶悩缁樼彑闁衡偓閹増顥?
          await deleteFavorite(actualSource, actualId);
          setFavorited(false);
        } else {
          // 濠碘€冲€归悘澶愬嫉椤忓懏鏆柦妯洪獜缁辨繂菐鐠囨彃顫ｉ柡鈧幆鐗堫棏
          await saveFavorite(actualSource, actualId, {
            title: actualTitle,
            source_name: source_name || '',
            year: actualYear || '',
            cover: actualPoster,
            total_episodes: actualEpisodes ?? 1,
            save_time: Date.now(),
          });
          setFavorited(true);
        }
      } catch (err) {
        throw new Error('Failed to toggle favorite state');
      }
    },
    [
      from,
      actualSource,
      actualId,
      actualTitle,
      source_name,
      actualYear,
      actualPoster,
      actualEpisodes,
      favorited,
    ]
  );

  const handleConfirmDeleteFavorite = useCallback(async () => {
    if (!actualSource || !actualId) return;
    setFavoriteDeleteLoading(true);
    try {
      await deleteFavorite(actualSource, actualId);
      setFavorited(false);
      onDelete?.();
      setFavoriteDeleteDialogOpen(false);
    } catch {
      throw new Error('Failed to delete favorite');
    } finally {
      setFavoriteDeleteLoading(false);
    }
  }, [actualSource, actualId, onDelete]);

  const handleOpenDeleteDialog = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (from !== 'playrecord' || !actualSource || !actualId) return;
    setDeleteDialogOpen(true);
  }, [from, actualSource, actualId]);

  const handleConfirmDeleteRecord = useCallback(async () => {
    if (from !== 'playrecord' || !actualSource || !actualId) return;
    setDeleteLoading(true);
    try {
      await deletePlayRecord(actualSource, actualId);
      onDelete?.();
      setDeleteDialogOpen(false);
    } catch (err) {
      throw new Error('Failed to delete play record');
    } finally {
      setDeleteLoading(false);
    }
  }, [from, actualSource, actualId, onDelete]);

  const pushPlayByTitle = useCallback(
    (titleValue: string, yearValue: string, searchTypeValue: string) => {
      router.push(
        `/play?title=${encodeURIComponent(titleValue.trim())}${
          yearValue ? `&year=${yearValue}` : ''
        }${searchTypeValue ? `&stype=${searchTypeValue}` : ''}`
      );
    },
    [router]
  );

  const fetchTmdbSeasonCountByTitle = useCallback(
    async (titleValue: string, yearValue: string): Promise<number> => {
      const trimmedTitle = (titleValue || '').trim();
      if (!trimmedTitle) return 0;

      const params = new URLSearchParams({
        title: trimmedTitle,
        mediaType: 'tv',
      });
      if (yearValue) {
        params.set('year', yearValue.trim());
      }

      try {
        const response = await fetch(`/api/tmdb/detail?${params.toString()}`);
        if (!response.ok) return 0;
        const payload = (await response.json()) as {
          mediaType?: 'movie' | 'tv';
          seasons?: number | null;
        };
        if (payload.mediaType !== 'tv') return 0;
        const seasons = payload.seasons;
        if (typeof seasons !== 'number' || !Number.isFinite(seasons)) return 0;
        return seasons > 0 ? Math.floor(seasons) : 0;
      } catch {
        return 0;
      }
    },
    []
  );

  const goToPlay = useCallback(async () => {
    const shouldSearchByTitle = from === 'douban' || actualSource === 'tmdb';
    if (shouldSearchByTitle) {
      const titleForPlay = actualTitle.trim();
      if (actualSearchType === 'tv' && !hasSeasonHint(titleForPlay)) {
        const detailSeasons =
          detailData?.mediaType === 'tv' &&
          typeof detailData.seasons === 'number' &&
          detailData.seasons > 1
            ? Math.floor(detailData.seasons)
            : 0;
        const seasonCount =
          detailSeasons || (await fetchTmdbSeasonCountByTitle(titleForPlay, actualYear || ''));
        if (seasonCount > 1) {
          setDetailOpen(false);
          setDetailLoading(false);
          setDetailError(null);
          setSeasonPickerData({
            baseTitle: stripSeasonHint(titleForPlay) || titleForPlay,
            year: actualYear || '',
            seasonCount,
          });
          setSeasonPickerOpen(true);
          return;
        }
      }

      pushPlayByTitle(titleForPlay, actualYear || '', actualSearchType || '');
      return;
    }

    if (actualSource && actualId) {
      router.push(
        `/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(
          actualTitle
        )}${actualYear ? `&year=${actualYear}` : ''}${
          isAggregate ? '&prefer=true' : ''
        }${
          actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}`
      );
    }
  }, [
    from,
    actualSource,
    actualTitle,
    actualSearchType,
    detailData,
    fetchTmdbSeasonCountByTitle,
    actualYear,
    pushPlayByTitle,
    actualId,
    router,
    isAggregate,
    actualQuery,
  ]);

  const handleSeasonPick = useCallback(
    (season: number) => {
      const base = seasonPickerData.baseTitle.trim();
      if (!base) return;
      const seasonTitle = `${base} 第${season}季`;
      const yearForPlay = seasonPickerData.year;
      setSeasonPickerOpen(false);
      setSeasonPickerData({ baseTitle: '', year: '', seasonCount: 0 });
      pushPlayByTitle(seasonTitle, yearForPlay, 'tv');
    },
    [pushPlayByTitle, seasonPickerData]
  );

  const handleSeasonPickerClose = useCallback(() => {
    setSeasonPickerOpen(false);
    setSeasonPickerData({ baseTitle: '', year: '', seasonCount: 0 });
  }, []);

  const handleSeasonPickerBackdropPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      handleSeasonPickerClose();
    },
    [handleSeasonPickerClose]
  );

  useEffect(() => {
    if (!seasonPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleSeasonPickerClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [seasonPickerOpen, handleSeasonPickerClose]);

  const config = useMemo(() => {
    const configs = {
      playrecord: {
        showSourceName: false,
        showProgress: true,
        showHeart: true,
        showCheckCircle: true,
        showDoubanLink: false,
        showRating: false,
      },
      favorite: {
        showSourceName: false,
        showProgress: false,
        showHeart: true,
        showCheckCircle: false,
        showDoubanLink: false,
        showRating: false,
      },
      search: {
        showSourceName: true,
        showProgress: false,
        showHeart: !isAggregate,
        showCheckCircle: false,
        showDoubanLink: hasDoubanId,
        showRating: false,
      },
      douban: {
        showSourceName: false,
        showProgress: false,
        showHeart: false,
        showCheckCircle: false,
        showDoubanLink: hasDoubanId,
        showRating: !!rate,
      },
    };
    return configs[from] || configs.search;
  }, [from, hasDoubanId, isAggregate, rate]);

  const prefetchTmdbDetail = useCallback(() => {
    if (hasScheduledPrefetchRef.current) return;
    if (from === 'playrecord') return;
    if (!tmdbTrigger.title) return;

    hasScheduledPrefetchRef.current = true;
    scheduleTmdbDetailPrefetch(tmdbTrigger);
  }, [from, tmdbTrigger]);

  useEffect(() => {
    hasScheduledPrefetchRef.current = false;
  }, [tmdbDetailCacheKey]);

  useEffect(() => {
    if (from === 'playrecord') return;
    if (!tmdbTrigger.title) return;
    if (!canUseTmdbDetailPrefetch()) return;

    const node = cardRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      prefetchTmdbDetail();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        prefetchTmdbDetail();
        observer.disconnect();
      },
      {
        rootMargin: '240px 0px 240px 0px',
        threshold: 0.05,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [from, prefetchTmdbDetail, tmdbTrigger.title]);

  const handleCloseDetail = useCallback(() => {
    suppressCardClickUntilRef.current = Date.now() + 220;
    setDetailOpen(false);
    setDetailLoading(false);
    setDetailError(null);
    detailRequestIdRef.current += 1;
  }, []);

  const handleCardClick = useCallback(async () => {
    if (Date.now() < suppressCardClickUntilRef.current) return;
    if (detailOpen || detailLoading) return;
    if (from === 'playrecord') {
      goToPlay();
      return;
    }
    if (!tmdbTrigger.title) {
      goToPlay();
      return;
    }

    const cached = detailCacheRef.current[tmdbDetailCacheKey];
    if (cached) {
      setDetailData(cached);
      setDetailError(null);
      setDetailOpen(true);
      return;
    }

    setDetailError(null);
    setDetailData(null);
    setDetailOpen(true);
    setDetailLoading(true);
    const requestId = ++detailRequestIdRef.current;

    try {
      const detail = await fetchTmdbDetailWithClientCache(tmdbTrigger);
      if (detailRequestIdRef.current !== requestId) return;
      detailCacheRef.current[tmdbDetailCacheKey] = detail;
      setDetailData(detail);
    } catch {
      if (detailRequestIdRef.current !== requestId) return;
      setDetailOpen(false);
      goToPlay();
    } finally {
      if (detailRequestIdRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }, [
    detailLoading,
    detailOpen,
    from,
    goToPlay,
    tmdbDetailCacheKey,
    tmdbTrigger,
  ]);

  const handleCardContainerClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-card-action="true"]')) {
        return;
      }
      void handleCardClick();
    },
    [handleCardClick]
  );

  const handleRetryDetail = useCallback(async () => {
      if (!tmdbTrigger.title) return;

      setDetailError(null);

      const cached = detailCacheRef.current[tmdbDetailCacheKey];
      if (cached) {
        setDetailData(cached);
        setDetailLoading(false);
        return;
      }

      setDetailData(null);
      setDetailLoading(true);
      const requestId = ++detailRequestIdRef.current;

      try {
        const detail = await fetchTmdbDetailWithClientCache(tmdbTrigger);
        if (detailRequestIdRef.current !== requestId) return;
        detailCacheRef.current[tmdbDetailCacheKey] = detail;
        setDetailData(detail);
      } catch (err) {
        if (detailRequestIdRef.current !== requestId) return;
        setDetailError((err as Error).message || 'TMDB detail load failed');
      } finally {
        if (detailRequestIdRef.current === requestId) {
          setDetailLoading(false);
        }
      }
    }, [tmdbDetailCacheKey, tmdbTrigger]);

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
        handleCloseDetail();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [detailOpen, handleCloseDetail]);

  return (
    <div
      ref={cardRef}
      className='group relative w-full rounded-[22px] bg-transparent cursor-pointer transition-all duration-300 ease-in-out hover:scale-[1.05] hover:z-[500]'
      onClick={handleCardContainerClick}
      onPointerEnter={prefetchTmdbDetail}
      onTouchStart={prefetchTmdbDetail}
    >
      {/* 婵炴挳鏀辨慨銈団偓鍦嚀濞?*/}
      <div className='relative aspect-[2/3] overflow-hidden rounded-[22px]'>
        {/* 濡ょ姰鍔嶉悘锔句沪?*/}
        {!isLoading && <ImagePlaceholder aspectRatio='aspect-[2/3]' />}
        {/* 闁搞儱澧芥晶?*/}
        {actualPoster ? (
          <Image
            src={processImageUrl(actualPoster)}
            alt={actualTitle}
            fill
            className='object-cover'
            referrerPolicy='no-referrer'
            onLoadingComplete={() => setIsLoading(true)}
          />
        ) : null}

        {/* 闁诡噮鍓氱拠鐐烘焼椤旀儳鍏?*/}
        <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity duration-300 ease-in-out group-hover:opacity-100' />

        {(config.showHeart || config.showCheckCircle) && (
          <div
            data-card-action='true'
            className='absolute bottom-3 right-3 flex gap-2 opacity-0 translate-y-2 transition-all duration-300 ease-in-out group-hover:opacity-100 group-hover:translate-y-0'
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {config.showCheckCircle && (
              <button
                type='button'
                data-card-action='true'
                aria-label='delete-play-record'
                onClick={handleOpenDeleteDialog}
                onMouseDown={(event) => event.stopPropagation()}
                className='inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white transition-all duration-300 ease-out hover:bg-black/55 hover:text-red-400'
              >
                <CheckCircle size={18} />
              </button>
            )}
            {config.showHeart && (
              <button
                type='button'
                data-card-action='true'
                aria-label='toggle-favorite'
                onClick={handleToggleFavorite}
                onMouseDown={(event) => event.stopPropagation()}
                className='inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/35 transition-all duration-300 ease-out hover:bg-black/55'
              >
                <Heart
                  size={18}
                  className={`transition-all duration-300 ease-out ${
                    favorited
                      ? 'fill-red-600 stroke-red-600'
                      : 'fill-transparent stroke-white hover:stroke-red-400'
                  } hover:scale-[1.1]`}
                />
              </button>
            )}
          </div>
        )}

        {/* 瀵扮晫鐝?*/}
        {config.showRating &&
          rate &&
          (hasDoubanId ? (
            <div
              data-card-action='true'
              onClick={(e) => e.stopPropagation()}
              className='absolute top-2 left-2 bg-black/70 text-yellow-300 text-xs font-bold h-7 px-2.5 rounded-full flex items-center gap-1 shadow-md transition-transform duration-200 ease-out hover:scale-105'
            >
              <Star size={14} stroke='currentColor' fill='currentColor' />
              <span>{rate}</span>
            </div>
          ) : (
            <div className='absolute top-2 left-2 bg-black/70 text-yellow-300 text-xs font-bold h-7 px-2.5 rounded-full flex items-center gap-1 shadow-md'>
              <Star size={14} stroke='currentColor' fill='currentColor' />
              <span>{rate}</span>
            </div>
          ))}

        {actualEpisodes && actualEpisodes > 1 && (
          <div className='absolute top-2 right-2 bg-blue-500 text-white text-xs font-semibold px-2 py-1 rounded-md shadow-md opacity-0 -translate-y-1 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-110'>
            {currentEpisode
              ? `${currentEpisode}/${actualEpisodes}`
              : actualEpisodes}
          </div>
        )}

        {/* 鐠炲棛鎽氶柧鐐复 */}
      </div>

      {config.showProgress && progress !== undefined && (
        <div className='mt-1 h-1 w-full bg-gray-200 rounded-full overflow-hidden'>
          <div
            className='h-full bg-blue-500 transition-all duration-500 ease-out'
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* 闁哄秴娲。鑺ョ▔鎼淬垺闄嶆繝?*/}
      <div className='mt-2 text-center'>
        <div className='relative'>
          <span className='block text-sm font-semibold truncate text-gray-900 dark:text-gray-100 transition-colors duration-300 ease-in-out group-hover:text-blue-600 dark:group-hover:text-blue-400 peer'>
            {actualTitle}
          </span>
          {/* 闁煎浜滈悾鐐▕?tooltip */}
          <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none'>
            {actualTitle}
            <div className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800'></div>
          </div>
        </div>
        {config.showSourceName && source_name && (
          <span className='block text-xs text-gray-500 dark:text-gray-400 mt-1'>
            <span className='inline-block border rounded px-2 py-0.5 border-gray-500/60 dark:border-gray-400/60 transition-all duration-300 ease-in-out group-hover:border-blue-500/60 group-hover:text-blue-600 dark:group-hover:text-blue-400 blur-[3px] opacity-70 group-hover:blur-0 group-hover:opacity-100'>
              {source_name}
            </span>
          </span>
        )}
      </div>

      <TmdbDetailModal
        open={detailOpen}
        loading={detailLoading}
        error={detailError}
        detail={detailData}
        titleLogo={detailData?.logo}
        onClose={handleCloseDetail}
        onRetry={() => {
          void handleRetryDetail();
        }}
        onPlay={goToPlay}
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
                  {seasonPickerBackdrop ? (
                    <Image
                      src={seasonPickerBackdrop}
                      alt={seasonPickerData.baseTitle || actualTitle}
                      fill
                      className='object-cover opacity-30'
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
                      handleSeasonPickerClose();
                    }}
                    className='absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-zinc-200 transition-colors hover:bg-black/70 hover:text-white'
                    aria-label='关闭选季弹窗'
                  >
                    <X size={16} />
                  </button>

                  <div className='space-y-2 text-center sm:text-left'>
                    <h3 className='text-lg font-semibold sm:pr-10'>请选择要播放的季</h3>
                    {detailData?.logo ? (
                      <div className='relative mx-auto mb-1.5 h-14 w-full max-w-[360px] sm:mx-0 sm:h-16'>
                        <Image
                          src={processImageUrl(detailData.logo)}
                          alt={`${seasonPickerData.baseTitle || actualTitle} logo`}
                          fill
                          className='object-contain object-center sm:object-left drop-shadow-[0_8px_20px_rgba(0,0,0,0.55)]'
                        />
                      </div>
                    ) : (
                      <p className='text-sm text-zinc-300/90'>
                        {seasonPickerData.baseTitle || actualTitle}
                      </p>
                    )}
                  </div>

                  <div className='mt-1 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto py-1 sm:grid-cols-4'>
                    {Array.from(
                      { length: Math.max(1, seasonPickerData.seasonCount) },
                      (_, idx) => idx + 1
                    ).map((season) => (
                      <button
                        key={`season-pick-${season}`}
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

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <AlertDialogContent
          className='w-[min(92vw,24rem)] max-w-sm overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/90 p-6 text-zinc-900 shadow-[0_30px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/85 dark:text-zinc-100'
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{'\u786e\u8ba4\u5220\u9664\u5417\uff1f'}</AlertDialogTitle>
            <AlertDialogDescription className='text-zinc-600 dark:text-zinc-300'>
              {'\u8be5\u64ad\u653e\u8bb0\u5f55\u5c06\u88ab\u5220\u9664\u3002'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteLoading}
              className='rounded-xl border-zinc-200/80 bg-white/80 text-zinc-700 hover:bg-white dark:border-zinc-600/70 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700/90'
            >
              {'\u53d6\u6d88'}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLoading}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDeleteRecord();
              }}
              className='rounded-xl bg-red-600/95 text-white shadow-[0_10px_20px_rgba(220,38,38,0.25)] hover:bg-red-600 dark:bg-red-500/90 dark:hover:bg-red-500'
            >
              {deleteLoading ? '\u5220\u9664\u4e2d...' : '\u786e\u5b9a\u5220\u9664'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={favoriteDeleteDialogOpen}
        onOpenChange={setFavoriteDeleteDialogOpen}
      >
        <AlertDialogContent
          className='w-[min(92vw,24rem)] max-w-sm overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/90 p-6 text-zinc-900 shadow-[0_30px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/85 dark:text-zinc-100'
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{'\u786e\u8ba4\u53d6\u6d88\u6536\u85cf\u5417\uff1f'}</AlertDialogTitle>
            <AlertDialogDescription className='text-zinc-600 dark:text-zinc-300'>
              {'\u8be5\u5185\u5bb9\u5c06\u4ece\u6536\u85cf\u5939\u4e2d\u79fb\u9664\u3002'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={favoriteDeleteLoading}
              className='rounded-xl border-zinc-200/80 bg-white/80 text-zinc-700 hover:bg-white dark:border-zinc-600/70 dark:bg-zinc-800/80 dark:text-zinc-200 dark:hover:bg-zinc-700/90'
            >
              {'\u53d6\u6d88'}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={favoriteDeleteLoading}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDeleteFavorite();
              }}
              className='rounded-xl bg-red-600/95 text-white shadow-[0_10px_20px_rgba(220,38,38,0.25)] hover:bg-red-600 dark:bg-red-500/90 dark:hover:bg-red-500'
            >
              {favoriteDeleteLoading
                ? '\u5904\u7406\u4e2d...'
                : '\u786e\u5b9a\u53d6\u6d88'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


