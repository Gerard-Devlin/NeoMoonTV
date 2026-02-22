'use client';

import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { SearchResult } from '@/lib/types';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import Loader from '@/components/Loader';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

export const runtime = 'edge';

type CreditSortMode = 'popularity' | 'date';

interface PersonCredit {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster: string;
  year: string;
  releaseDate?: string;
  role: string;
  score: string;
  overview: string;
  popularity: number;
}

interface PersonDetail {
  id: number;
  name: string;
  profile: string;
  birthday: string;
  deathday: string;
  placeOfBirth: string;
  knownForDepartment: string;
  biography: string;
  popularity: number;
  homepage: string;
  imdbId: string;
  credits: PersonCredit[];
}

function toCreditTimestamp(releaseDate?: string, year?: string): number {
  const normalizedDate = (releaseDate || '').trim();
  if (normalizedDate) {
    const timestamp = Date.parse(normalizedDate);
    if (!Number.isNaN(timestamp)) return timestamp;
  }

  const normalizedYear = (year || '').trim();
  if (/^\d{4}$/.test(normalizedYear)) {
    return Date.UTC(Number(normalizedYear), 0, 1);
  }

  return 0;
}

function formatTimelineLabel(releaseDate?: string, year?: string): string {
  const normalizedDate = (releaseDate || '').trim();
  const yearFromDate = normalizedDate.slice(0, 4);
  if (/^\d{4}$/.test(yearFromDate)) return yearFromDate;

  const normalizedYear = (year || '').trim();
  if (/^\d{4}$/.test(normalizedYear)) return normalizedYear;

  return 'Unknown';
}

export default function PersonDetailPage() {
  const params = useParams<{ id: string }>();
  const personId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [creditSortMode, setCreditSortMode] =
    useState<CreditSortMode>('popularity');

  useEffect(() => {
    const idNum = Number(personId);
    setCreditSortMode('popularity');
    if (!Number.isInteger(idNum) || idNum <= 0) {
      setError('Invalid person id');
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/tmdb/person/${idNum}`);
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error || 'Failed to load person detail');
        }
        const payload = (await response.json()) as PersonDetail;
        setDetail(payload);
      } catch (err) {
        setError((err as Error).message || 'Failed to load person detail');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [personId]);

  const sortedCredits = useMemo<PersonCredit[]>(() => {
    if (!detail?.credits?.length) return [];
    const credits = [...detail.credits];

    credits.sort((a, b) => {
      const dateDiff =
        toCreditTimestamp(b.releaseDate, b.year) -
        toCreditTimestamp(a.releaseDate, a.year);
      const popularityDiff = b.popularity - a.popularity;

      if (creditSortMode === 'date') {
        if (dateDiff !== 0) return dateDiff;
        if (popularityDiff !== 0) return popularityDiff;
        return b.id - a.id;
      }

      if (popularityDiff !== 0) return popularityDiff;
      if (dateDiff !== 0) return dateDiff;
      return b.id - a.id;
    });

    return credits;
  }, [creditSortMode, detail]);

  const timelineGroups = useMemo<
    Array<{ year: string; items: PersonCredit[] }>
  >(() => {
    if (creditSortMode !== 'date' || !sortedCredits.length) return [];

    const grouped = new Map<string, PersonCredit[]>();
    sortedCredits.forEach((item) => {
      const yearLabel = formatTimelineLabel(item.releaseDate, item.year);
      const existing = grouped.get(yearLabel);
      if (existing) {
        existing.push(item);
        return;
      }
      grouped.set(yearLabel, [item]);
    });

    return Array.from(grouped.entries()).map(([year, items]) => ({
      year,
      items,
    }));
  }, [creditSortMode, sortedCredits]);

  const creditSearchResults = useMemo<SearchResult[]>(() => {
    if (!sortedCredits.length) return [];
    return sortedCredits.map((item) => ({
      id: String(item.id),
      title: item.title,
      poster: item.poster,
      episodes: item.mediaType === 'movie' ? ['movie'] : ['tv'],
      source: 'tmdb',
      source_name: '',
      year: item.year || 'unknown',
      score: item.score || '',
      desc: item.overview || '',
      type_name: item.mediaType,
      douban_id: 0,
    }));
  }, [sortedCredits]);

  return (
    <div className='min-h-screen w-full'>
      <PageLayout activePath='/search' forceShowBackButton>
        <div className='px-4 pt-10 pb-5 sm:px-10 sm:pt-16 sm:pb-8 md:pt-20'>
            {loading ? (
              <div className='flex min-h-[50vh] items-center justify-center'>
                <Loader />
              </div>
            ) : error ? (
              <div className='rounded-xl border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'>
                {error}
              </div>
            ) : detail ? (
              <div className='space-y-10'>
                <section>
                  <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
                    <div className='flex items-center gap-3'>
                      <h2 className='text-xl font-bold text-gray-900 dark:text-gray-100'>
                        作品
                      </h2>
                      <span className='text-sm text-gray-500 dark:text-gray-400'>
                        共 {creditSearchResults.length} 条
                      </span>
                    </div>
                    <CapsuleSwitch
                      options={[
                        { label: '按热度', value: 'popularity' },
                        { label: '按时间', value: 'date' },
                      ]}
                      active={creditSortMode}
                      onChange={(value) =>
                        setCreditSortMode(value as CreditSortMode)
                      }
                      className='bg-gray-200/90 dark:bg-gray-700'
                    />
                  </div>

                  {creditSearchResults.length > 0 ? (
                    creditSortMode === 'date' ? (
                      <div className='space-y-8'>
                        {timelineGroups.map((group) => (
                          <div
                            key={`person-credit-year-${group.year}`}
                            className='space-y-3'
                          >
                            <div className='flex items-center gap-2 pl-0.5'>
                              <span className='h-3 w-3 rounded-full border-2 border-blue-500 bg-transparent' />
                              <div className='text-sm font-semibold text-gray-700 dark:text-gray-200'>
                                {group.year}
                              </div>
                            </div>
                            <div className='pl-5'>
                              <div className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-8'>
                                {group.items.map((item) => (
                                  <div
                                    key={`person-credit-${item.mediaType}-${item.id}`}
                                  >
                                    <VideoCard
                                      id={String(item.id)}
                                      title={item.title}
                                      poster={item.poster}
                                      episodes={1}
                                      source='tmdb'
                                      year={item.year}
                                      rate={item.score}
                                      from='douban'
                                      type={item.mediaType}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        className='grid grid-cols-2 gap-x-2 gap-y-8 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-8'
                      >
                        {creditSearchResults.map((item) => (
                          <div key={`person-credit-${item.type_name}-${item.id}`}>
                            <VideoCard
                              id={item.id}
                              title={item.title}
                              poster={item.poster}
                              episodes={item.episodes.length}
                              source={item.source}
                              year={item.year}
                              rate={item.score}
                              from='douban'
                              type={item.type_name}
                            />
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className='rounded-xl border border-gray-200 bg-white/80 p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-400'>
                      暂无作品信息。
                    </div>
                  )}
                </section>
              </div>
            ) : null}
          </div>
      </PageLayout>
    </div>
  );
}
